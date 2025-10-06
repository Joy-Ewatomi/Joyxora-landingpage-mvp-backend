// Step 1: Import the packages
import express from "express";
import cors from "cors";
import fs from "fs";

// Step 2: Initialize the app
const app = express();

// Step 3: Middleware (these run before your routes)
app.use(cors()); // allows frontend connection
app.use(express.json()); // lets express handle JSON requests

// WAITLIST ROUTE — to receive and store waitlist entries
app.post("/api/Waitlist", async (req, res) => {
    const { name, email } = req.body;

    // Check if email is missing
    if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
    }

    let data;
    // Read existing waitlist data
    try {
        data = JSON.parse(fs.readFileSync("./data/Waitlist.json", "utf8"));
    } catch (err) {
        return res.status(500).json({ success: false, error: "Error reading waitlist data" });
    }

    // Check if email already exists
    if (data.find((person) => person.email === email)) {
        return res.status(400).json({ success: false, error: "Already on the waitlist" });
    }

    // Create new entry
    const newEntry = {
        id: Date.now(),
        name,
        email,
        joinedAt: new Date().toISOString(),
    };

    // Add the new entry and save back to file
    data.push(newEntry);
    try {
        fs.writeFileSync("./data/Waitlist.json", JSON.stringify(data, null, 2));
    } catch (err) {
        return res.status(500).json({ success: false, error: "Error saving to waitlist" });
    }

    // Send success response
    res.json({ success: true, message: "Added to waitlist!" });
});

// FUNDERS ROUTE — to collect funders' info
app.post("/api/Funder", async (req, res) => {
    const { name, email, amount } = req.body;

    // Check if email is missing
    if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
    }

    let data;
    // Read existing funders data
    try {
        data = JSON.parse(fs.readFileSync("./data/Funder.json", "utf8"));
    } catch (err) {
        return res.status(500).json({ success: false, error: "Error reading funder data" });
    }

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
    try {
        fs.writeFileSync("./data/Funder.json", JSON.stringify(data, null, 2));
    } catch (err) {
        return res.status(500).json({ success: false, error: "Error saving to funder data" });
    }

    // Send success response
    res.json({ success: true, message: "Thank you for supporting Joyxora!" });
});

// Step 4: Choose a port
const PORT = 5000;

// Step 5: Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
