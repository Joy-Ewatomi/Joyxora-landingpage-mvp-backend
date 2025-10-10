// ==================== index.js ====================

// Step 1: Import packages
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs"; // ✅ Secure password hashing

const { Pool } = pkg;
dotenv.config();

// Step 2: Initialize app
const app = express();
app.use(cors());
app.use(express.json());

// Step 3: Set up database connection
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: isProduction ? process.env.DATABASE_URL : process.env.LOCAL_DB_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Step 4: Initialize tables
const initDB = async () => {
  try {
    // Waitlist table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Funder table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS funder (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        amount TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Signup table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ PostgreSQL tables ready!");
  } catch (err) {
    console.error("❌ Error setting up database:", err);
  }
};
initDB();


// ===================== WAITLIST ROUTES =====================
app.post("/api/Waitlist", async (req, res) => {
  const { name, email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required" });

  try {
    await pool.query("INSERT INTO waitlist (name, email) VALUES ($1, $2)", [name, email]);
    res.json({ success: true, message: "Added to waitlist!" });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ success: false, error: "Already on the waitlist" });
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

app.get("/api/Waitlist", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM waitlist ORDER BY joined_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error fetching waitlist data" });
  }
});


// ===================== FUNDER ROUTES =====================
app.post("/api/Funder", async (req, res) => {
  const { name, email, amount } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "Email is required" });

  try {
    await pool.query("INSERT INTO funder (name, email, amount) VALUES ($1, $2, $3)", [
      name,
      email,
      amount,
    ]);
    res.json({ success: true, message: "Thank you for supporting Joyxora!" });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ success: false, error: "Already registered as a funder" });
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

app.get("/api/Funder", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM funder ORDER BY joined_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error fetching funders" });
  }
});


// ===================== SIGNUP ROUTE =====================
app.post("/api/signup", async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password)
    return res.status(400).json({ success: false, error: "All fields are required" });

  try {
    // Check if user already exists
    const existing = await pool.query(
      "SELECT * FROM signup WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, error: "User already exists" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO signup (email, username, password) VALUES ($1, $2, $3)",
      [email, username, hashedPassword]
    );

    res.json({ success: true, message: "You are now a member of Joyxora!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});


// ===================== SIGNIN ROUTE =====================
app.post("/api/signin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ success: false, error: "Username and password required" });

  try {
    const { rows } = await pool.query("SELECT * FROM signup WHERE username = $1", [username]);
    const user = rows[0];

    if (!user)
      return res.status(400).json({ success: false, error: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ success: false, error: "Invalid credentials" });

    res.json({ success: true, message: `Welcome back, ${user.username}!` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});


// ===================== SERVER START =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
