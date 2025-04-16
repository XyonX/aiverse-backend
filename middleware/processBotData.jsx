const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = "uploads/bots/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure storage options (example: disk storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // specify the destination directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // specify the file naming convention
  },
});

const processBotData = multer({ storage: storage });

module.exports = processBotData;
