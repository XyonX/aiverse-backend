const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const botRoutes = require("./routes/bots");
const messageRoutes = require("./routes/messages");
const conversationRoutes = require("./routes/conversationRoutes");
const path = require("path");
const cookieParser = require("cookie-parser");

const app = express();
connectDB();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://joycodes.tech"],
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/conversations", conversationRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

module.exports = app;
