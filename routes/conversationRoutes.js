const express = require("express");
const router = express.Router();
const conversationController = require("../controllers/conversationController");
const { verifyToken } = require("../middleware/auth");

// Get all conversations for a user
router.get(
  "/user/:userId",
  verifyToken,
  conversationController.getUserConversations
);

// Get specific conversation between user and bot
router.get(
  "/user/:userId/bot/:botId",
  verifyToken,
  conversationController.getUserBotConversation
);

// Create new conversation
router.post("/", verifyToken, conversationController.createConversation);

module.exports = router;
