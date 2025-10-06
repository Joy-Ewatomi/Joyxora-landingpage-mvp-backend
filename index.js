// Step 1: Import the packages
import express from "express";
import cors from "cors";
import fs from "fs";

// Step 2: Initialize the app
const app = express();

// Step 3: Middleware (these run before your routes)
app.use(cors()); // allows frontend connection
app.use(express.json()); // lets express handle JSON requests

// 🧩 WAITLIST ROUTE — to receive and store waitlist entries
app.post("/api/Waitlist", (req, res) => {
  const { name, email } = req.body;

  // check if email is missing
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  // read existing waitlist data
  const data = JSON.parse(fs.readFileSync("./data/waitlist.json", "utf8"));

  // check if email already exists
  if (data.find((person) => person.email === email)) {
    return res.status(400).json({ success: false, error: "Already on the waitlist" });
  }

  // create new entry
  const newEntry = {
    id: Date.now(),
    name,
    email,
    joinedAt: new Date().toISOString(),
  };

  // add it and save back to file
  data.push(newEntry);
  fs.writeFileSync("./data/waitlist.json", JSON.stringify(data, null, 2));

  // send success response
  res.json({ success: true, message: "Added to waitlist!" });
});

// 💰 FUNDERS ROUTE — to collect funders' info
app.post("/api/Funder", (req, res) => {
  const { name, email, amount } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  // Read existing funders data
  const data = JSON.parse(fs.readFileSync("./data/funders.json", "utf8"));

  // Check if funder already exists
  if (data.find((person) => person.email === email)) {
    return res.status(400).json({ success: false, error: "Already registered as a funder" });
  }

  // Create a new funder entry
  const newEntry = {
    id: Date.now(),
    name,
    email,
    amount,
    joinedAt: new Date().toISOString(),
  };

  // Add and save back to file
  data.push(newEntry);
  fs.writeFileSync("./data/funders.json", JSON.stringify(data, null, 2));

  // Send success response
  res.json({ success: true, message: "Thank you for supporting Joyxora!" });
});


// Step 4: Choose a port
const PORT = 5000;

// Step 5: Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
