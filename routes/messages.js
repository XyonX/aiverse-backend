const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const auth = require("../middleware/auth");

router.get("/:botId", auth, messageController.getMessages); // Get chat history with a bot
router.post("/:botId", auth, messageController.sendMessage); // Send message and get bot reply

module.exports = router;
