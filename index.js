// Step 1: Import packages
import express from "express";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

// Step 2: Initialize app
const app = express();
app.use(cors());
app.use(express.json());

// Step 3: Connect to Railway PostgreSQL
const pool = new Pool({
  connectionString: process.env.CONNECT_URL,
  ssl: { rejectUnauthorized: false },
});

// Step 4: Create tables if they don’t exist
const initDB = async () => {
  try {
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

// Step 5: Start server
const  PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
