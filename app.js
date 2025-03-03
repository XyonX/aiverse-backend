const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const botRoutes = require("./routes/bots");
const messageRoutes = require("./routes/messages");

const app = express();
connectDB();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/messages", messageRoutes);

module.exports = app;
