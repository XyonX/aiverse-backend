//messages.js
const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
// Update the import to match the exported name
const { verifyToken } = require("../middleware/auth");

// Create new message
router.post("/", verifyToken, messageController.createMessage);

// Get messages for conversation
router.get(
  "/conversation/:conversationId",
  verifyToken,
  messageController.getConversationMessages
);

module.exports = router;
