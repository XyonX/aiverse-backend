const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const botRoutes = require("./routes/bots");
const messageRoutes = require("./routes/messages");
const conversationRoutes = require("./routes/conversationRoutes");
const path = require("path");
const multer = require("multer");
const cookieParser = require("cookie-parser");

const app = express();

// All middlewares
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://aiverseapp.site",
      "https://www.aiverseapp.site",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(cookieParser());

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/messages", upload.single("file"), messageRoutes);
app.use("/api/conversations", conversationRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

module.exports = app;
