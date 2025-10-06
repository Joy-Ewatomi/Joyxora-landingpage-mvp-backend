// Step 1: Import the packages
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv"; // Import dotenv for environment variables

// Load environment variables
dotenv.config();

// Step 2: Initialize the app
const app = express();

// Step 3: Middleware (these run before your routes)
app.use(cors()); // allows frontend connection
app.use(express.json()); // lets express handle JSON requests

// Step 4: Connect to MongoDB
const mongoURI = process.env.MONGODB_URI; // Use environment variable for MongoDB connection string
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("🚀 Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

// Step 5: Define Mongoose Schemas and Models
const waitlistSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Added required validation
    email: { type: String, required: true, unique: true }, // Added required validation
    joinedAt: { type: Date, default: Date.now },
});

const funderSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Added required validation
    email: { type: String, required: true, unique: true }, // Added required validation
    amount: { type: Number, required: true }, // Added required validation
    joinedAt: { type: Date, default: Date.now },
});

const Waitlist = mongoose.model("Waitlist", waitlistSchema);
const Funder = mongoose.model("Funder", funderSchema);

// WAITLIST ROUTE — to receive and store waitlist entries
app.post("/api/Waitlist", async (req, res) => {
    const { name, email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
    }

    try {
        const existingEntry = await Waitlist.findOne({ email });
        if (existingEntry) {
            return res.status(400).json({ success: false, error: "Already on the waitlist" });
        }

        const newEntry = new Waitlist({ name, email });
        await newEntry.save();
        res.json({ success: true, message: "Added to waitlist!" });
    } catch (err) {
        console.error("Error adding to waitlist:", err);
        res.status(500).json({ success: false, error: "Error adding to waitlist" });
    }
});

// FUNDERS ROUTE — to collect funders' info
app.post("/api/Funder", async (req, res) => {
    const { name, email, amount } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
    }

    try {
        const existingFunder = await Funder.findOne({ email });
        if (existingFunder) {
            return res.status(400).json({ success: false, error: "Already registered as a funder" });
        }

        const newEntry = new Funder({ name, email, amount });
        await newEntry.save();
        res.json({ success: true, message: "Thank you for supporting Joyxora!" });
    } catch (err) {
        console.error("Error adding funder:", err);
        res.status(500).json({ success: false, error: "Error adding funder" });
    }
});

// Step 6: Choose a port
const PORT = process.env.PORT || 5000;

// Step 7: Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
