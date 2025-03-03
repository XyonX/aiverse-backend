const express = require("express");
const router = express.Router();
const botController = require("../controllers/botController");
const auth = require("../middleware/auth");

router.get("/", auth, botController.getBots); // Get all accessible bots
router.post("/", auth, botController.addBot); // Add a new bot

module.exports = router;
