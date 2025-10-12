// ==================== index.js ====================
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Resend } from "resend"; // ✅ Add this

const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== RESEND CONFIG ====================
const resend = new Resend(process.env.RESEND_API_KEY);

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
// ==================== EMAIL FUNCTIONS ====================

async function sendWelcomeEmail(email, username) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Joyxora <onboarding@resend.dev>', // Use resend's domain for now
      to: email,
      subject: 'Welcome to Joyxora 🐱',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;background:#f8fff8;border-radius:10px;">
          <div style="text-align:center;margin-bottom:20px;">
            <span style="font-size:64px;">🐱</span>
          </div>
          <h2 style="color:#10b981;text-align:center;">Welcome to Joyxora, ${username}!</h2>
          <p style="color:#333;font-size:16px;line-height:1.6;">
            Thank you for joining <strong>Joyxora</strong> - your privacy-first encryption platform.
          </p>
          <p style="color:#333;font-size:16px;line-height:1.6;">
            Your account has been created successfully. Start encrypting your files and chatting securely today!
          </p>
          <div style="text-align:center;margin-top:30px;">
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="display:inline-block;padding:12px 30px;background:#10b981;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
              Go to Dashboard
            </a>
          </div>
          <p style="color:#666;font-size:12px;text-align:center;margin-top:30px;">
            Questions? Reply to this email - we're here to help!
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Welcome email error:', error);
      return false;
    }

    console.log('✅ Welcome email sent to:', email, '| ID:', data.id);
    return true;
  } catch (err) {
    console.error('❌ Welcome email exception:', err.message);
    return false;
  }
}

async function sendPasswordResetEmail(email, username, token) {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    const { data, error } = await resend.emails.send({
      from: 'Joyxora <onboarding@resend.dev>',
      to: email,
      subject: 'Reset your Joyxora password 🔑',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;background:#fff;border:2px solid #10b981;border-radius:10px;">
          <h2 style="color:#10b981;">Password Reset Request</h2>
          <p style="color:#333;font-size:16px;">Hello ${username},</p>
          <p style="color:#333;font-size:16px;">
            We received a request to reset your password. Click the button below to continue:
          </p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${resetLink}" 
               style="display:inline-block;padding:14px 32px;background:#10b981;color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
              Reset Password
            </a>
          </div>
          <p style="color:#666;font-size:14px;">
            Or copy this link:<br/>
            <a href="${resetLink}" style="color:#10b981;word-break:break-all;">${resetLink}</a>
          </p>
          <p style="color:#999;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:20px;">
            This link expires in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Reset email error:', error);
      return false;
    }

    console.log('✅ Reset email sent to:', email, '| ID:', data.id);
    return true;
  } catch (err) {
    console.error('❌ Reset email exception:', err.message);
    return false;
  }
}
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

    // Send welcome email (don't await - fire and forget)
    sendWelcomeEmail(email, username);

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

// Forgot Password
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE email = $1", [email]);
    const user = rows[0];
    
    if (!user) {
      return res.json({ message: "If that email exists, we sent a reset link." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      "UPDATE signup SET reset_token=$1, reset_expires=$2 WHERE email=$3", 
      [token, expires, email]
    );

    // Send reset email (don't await)
    sendPasswordResetEmail(email, user.username, token);

    res.json({ message: "If that email exists, we sent a reset link." });
  } catch (err) {
    console.error("Forgot-password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) 
    return res.status(400).json({ message: "Token and new password required" });

  if (newPassword.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM signup WHERE reset_token=$1 AND reset_expires > NOW()", 
      [token]
    );
    const user = rows[0];
    
    if (!user) 
      return res.status(400).json({ message: "Invalid or expired reset token" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      "UPDATE signup SET password=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2", 
      [hashedPassword, user.id]
    );

    res.json({ message: "Password reset successfully! You can now sign in." });
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).json({ message: "Server error" });
  }
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
// ==================== TEST EMAIL ROUTE ====================
app.get("/api/test-email", async (req, res) => {
  console.log("📧 Testing Resend email...");
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'Joyxora Test <onboarding@resend.dev>',
      to: 'delivered@resend.dev', // Resend's test email
      subject: 'Test Email - Joyxora Backend ✅',
      html: '<h1>Email is working!</h1><p>If you see this, Resend is configured correctly.</p>',
    });

    if (error) {
      console.error('❌ Test email error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Test email sent! ID:', data.id);
    res.json({ 
      success: true, 
      message: "Test email sent successfully!",
      emailId: data.id 
    });
  } catch (err) {
    console.error('❌ Test email exception:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Joyxora backend running on port ${PORT}`);
  console.log(`📧 Email service: Resend`);
});
