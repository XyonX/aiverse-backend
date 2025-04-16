require("dotenv").config();
const fs = require("fs");
const https = require("https"); // ⚠️ Missing HTTPS module
const app = require("./app");

// Paths to certificates (ensure they exist in the 'certs' folder)
const options = {
  key: fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem"),
};

const PORT = 443;

// Create and start server
https.createServer(options, app).listen(PORT, "0.0.0.0", () => {
  // 👈 Crucial change here
  console.log(`HTTPS Server running on https://localhost:${PORT}`);
});
