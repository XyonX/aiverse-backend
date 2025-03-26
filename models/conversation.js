//conversation.js
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bot",
      required: true,
    },
    messages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    lastMessageTimestamp: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    sessions: [
      {
        sessionId: { type: String, required: true, default: () => uuidv4() },
        messages: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
          },
        ],
        summary: String,
        startTime: { type: Date, default: Date.now },
        endTime: Date,
        isActive: { type: Boolean, default: true },
      },
    ],
    historicalSummaries: [String], // For long-term context
    lastActivity: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    indexes: [{ unique: true, fields: ["user", "bot"] }],
  }
);

module.exports = mongoose.model(
  "Conversation",
  conversationSchema,
  "aiverse-conversation"
);
