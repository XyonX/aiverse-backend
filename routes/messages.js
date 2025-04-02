//messages.js
const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
// Update the import to match the exported name
const { authenticate } = require("../middleware/auth");
const { authorize } = require("../middleware/authorize");

// Create new message
router.post("/", messageController.createMessage);

// Get messages for conversation
router.get(
  "/conversation/:conversationId",
  authenticate,
  authorize,
  messageController.getConversationMessages
);

module.exports = router;
