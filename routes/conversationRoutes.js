const express = require("express");
const {
  getUserConversations,
} = require("../controllers/conversationController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all user conversations
router.get("/:userId", authMiddleware, getUserConversations);

module.exports = router;
