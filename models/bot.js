const mongoose = require("mongoose");

const botSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  apiKey: {
    type: Object, // Store encrypted data
    required: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  model: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    default: "default-bot.png",
  },
  description: {
    type: String,
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  streamingEnabled: {
    type: Boolean,
    default: false,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  context: {
    type: String,
    default: "You are a helpful assistant.", // Default for general bots
  },
  category: {
    type: String,
    enum: ["general", "role-playing", "specialized"],
    default: "general",
  },
});

// module.exports = mongoose.model("Bot", botSchema, "aiverse-bot");
// Check if the User model already exists. If so, reuse it.
module.exports =
  mongoose.models.Bot || mongoose.model("Bot", botSchema, "aiverse-bot");
