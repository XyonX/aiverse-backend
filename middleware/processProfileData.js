const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the uploads directory exists
const uploadDir = "uploads/avatars/";
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

const processProfileData = multer({ storage: storage });

module.exports = processProfileData;
