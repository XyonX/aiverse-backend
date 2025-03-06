const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const botRoutes = require("./routes/bots");
const messageRoutes = require("./routes/messages");
const path = require("path"); // For serving static files
const cookieParser = require("cookie-parser");

const app = express();
connectDB();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://joycodes.tech"], // Allow frontend access
    methods: "GET,POST,PUT,DELETE",
    credentials: true, // Allow cookies/auth headers
  })
);

// Serve the uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.json());
// Use cookie-parser before your routes
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

module.exports = app;
