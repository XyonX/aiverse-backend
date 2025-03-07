// const express = require("express");
// const router = express.Router();
// const messageController = require("../controllers/messageController");
// const { verifyToken } = require("../middleware/auth");

// router.get("/:botId", verifyToken, messageController.getMessages); // Get chat history with a bot
// router.post("/:botId", verifyToken, messageController.sendMessage); // Send message and get bot reply

// module.exports = router;

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
