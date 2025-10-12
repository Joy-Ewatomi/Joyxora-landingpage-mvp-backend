// ==================== index.js ====================
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
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

// Initialize tables
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
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

// ==================== JWT HELPERS ====================
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET || "your-secret-key-change-this",
    { expiresIn: "7d" }
  );
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, error: "Missing token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key-change-this");
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

// ==================== WAITLIST ROUTES =====================
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

// ==================== FUNDER ROUTES =====================
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

// ==================== AUTH ROUTES =====================

// Sign Up
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  if (password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters" });

  try {
    const existing = await pool.query("SELECT * FROM signup WHERE email = $1", [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ message: "User already exists" });

    const username = email.split('@')[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      "INSERT INTO signup (email, username, password) VALUES ($1, $2, $3) RETURNING id, username, email, joined_at",
      [email, username, hashedPassword]
    );
    const user = rows[0];

    const token = generateToken(user);

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.joined_at
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup" });
  }
});

// Sign In
app.post("/api/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE email = $1", [email]);
    const user = rows[0];

    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid email or password" });

    const token = generateToken(user);

    res.json({
      message: "Sign in successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.joined_at
      }
    });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({ message: "Server error during signin" });
  }
});

// Forgot Password (Disabled until domain is set up)
app.post("/api/forgot-password", async (req, res) => {
  res.status(503).json({ 
    message: "Password reset is temporarily unavailable. Disabled until domain is set up." 
  });
});

// Reset Password (Disabled until domain is set up)
app.post("/api/reset-password", async (req, res) => {
  res.status(503).json({ 
    message: "Password reset is temporarily unavailable. Disabled until domain is set up." 
  });
});

// Get current user
app.get("/api/me", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, email, joined_at FROM signup WHERE id=$1",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error("User fetch error:", err);
    res.status(500).json({ message: "Could not fetch user" });
  }
});

// Profile route
app.get("/api/profile", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, email, joined_at FROM signup WHERE id=$1",
      [req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ success: false, error: "Could not fetch profile" });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Joyxora backend running on port ${PORT}`);
});
