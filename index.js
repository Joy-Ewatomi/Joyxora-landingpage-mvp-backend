// ==================== index.js ====================

import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== DATABASE ====================
const isProduction = process.env.NODE_ENV === "production";
const pool = new Pool({
  connectionString: isProduction ? process.env.DATABASE_URL : process.env.LOCAL_DB_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Initialize tables (signup + waitlist + funder)
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        reset_token TEXT,
        reset_expires TIMESTAMP,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS funder (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        amount TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Database ready (signup, waitlist, funder)");
  } catch (err) {
    console.error("❌ Database setup error:", err);
  }
};
initDB();

// ==================== EMAIL CONFIG ====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==================== JWT HELPERS ====================
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, error: "Missing token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

// ==================== WAITLIST ROUTES (public) =====================
// Keep using the same endpoints you had before to avoid breaking the frontend
app.post("/api/Waitlist", async (req, res) => {
  const { name, email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required" });

  try {
    await pool.query("INSERT INTO waitlist (name, email) VALUES ($1, $2)", [name || null, email]);
    res.json({ success: true, message: "Added to waitlist!" });
  } catch (err) {
    if (err && err.code === "23505")
      return res.status(400).json({ success: false, error: "Already on the waitlist" });
    console.error("Waitlist error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

app.get("/api/Waitlist", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM waitlist ORDER BY joined_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("Waitlist fetch error:", err);
    res.status(500).json({ error: "Error fetching waitlist data" });
  }
});

// ==================== FUNDER ROUTES (public) =====================
app.post("/api/Funder", async (req, res) => {
  const { name, email, amount } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required" });

  try {
    await pool.query("INSERT INTO funder (name, email, amount) VALUES ($1, $2, $3)", [
      name || null,
      email,
      amount || null,
    ]);
    res.json({ success: true, message: "Thank you for supporting Joyxora!" });
  } catch (err) {
    if (err && err.code === "23505")
      return res.status(400).json({ success: false, error: "Already registered as a funder" });
    console.error("Funder error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

app.get("/api/Funder", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM funder ORDER BY joined_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("Funder fetch error:", err);
    res.status(500).json({ error: "Error fetching funders" });
  }
});

// ==================== SIGNUP =====================
app.post("/api/signup", async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password)
    return res.status(400).json({ success: false, error: "All fields are required" });

  try {
    const existing = await pool.query(
      "SELECT * FROM signup WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO signup (email, username, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [email, username, hashedPassword]
    );
    const user = rows[0];

    // Send welcome email (fire-and-forget; log errors)
    transporter.sendMail({
      from: `"Joyxora Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to Joyxora 💚",
      html: `
        <div style="font-family:Arial;max-width:600px;margin:auto;padding:20px;border-radius:10px;background:#f8fff8;">
          <h2 style="color:#0f5132;">Welcome, ${username}!</h2>
          <p>Thank you for joining <b>Joyxora</b>. Your account has been created successfully.</p>
        </div>
      `,
    }).catch((err) => console.error("Welcome email error:", err));

    const token = generateToken(user);
    res.json({ success: true, message: "Signup successful", token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// ==================== SIGNIN =====================
app.post("/api/signin", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, error: "Username and password required" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE username = $1", [username]);
    const user = rows[0];
    if (!user) return res.status(400).json({ success: false, error: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = generateToken(user);
    res.json({ success: true, message: "Login successful", token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// ==================== FORGOT PASSWORD =====================
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE email = $1", [email]);
    const user = rows[0];
    if (!user) return res.status(400).json({ success: false, error: "No account with that email" });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query("UPDATE signup SET reset_token=$1, reset_expires=$2 WHERE email=$3", [token, expires, email]);

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    transporter.sendMail({
      from: `"Joyxora Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset your Joyxora password 🔑",
      html: `
        <div style="font-family:Arial;max-width:600px;margin:auto;padding:20px;border-radius:10px;background:#fff;">
          <h2 style="color:#155724;">Password Reset Request</h2>
          <p>Hello ${user.username},</p>
          <p>Click below to reset your password:</p>
          <a href="${resetLink}" style="display:inline-block;margin-top:10px;padding:10px 20px;background:#198754;color:white;border-radius:6px;text-decoration:none;">Reset Password</a>
          <p>This link will expire in 15 minutes.</p>
        </div>
      `,
    }).catch((err) => console.error("Reset email error:", err));

    res.json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    console.error("Forgot-password error:", err);
    res.status(500).json({ success: false, error: "Error sending reset email" });
  }
});

// ==================== RESET PASSWORD =====================
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, error: "Missing token or password" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE reset_token=$1 AND reset_expires > NOW()", [token]);
    const user = rows[0];
    if (!user) return res.status(400).json({ success: false, error: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE signup SET password=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2", [hashedPassword, user.id]);

    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==================== PROTECTED ROUTE (example) =====================
app.get("/api/profile", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, username, email, joined_at FROM signup WHERE id=$1", [req.user.id]);
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ success: false, error: "Could not fetch profile" });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Joyxora backend running on port ${PORT}`));
