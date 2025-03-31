//bot.js
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
    unique: true,
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
  isOnline: { type: Boolean, default: false }, // Indicates if the bot is online
  lastOnline: { type: Date, default: Date.now }, // Last time bot was online
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
    systemMessage: {
      type: String,
      default: "You are an AI assistant in the AIVERSE app.",
    },
    personality: {
      type: String,
      enum: ["friendly", "formal", "sarcastic", "professional"],
      default: "friendly",
    },
    knowledgeScope: {
      type: [String], // Array to specify knowledge areas
      default: ["general"],
    },
    memoryEnabled: {
      type: Boolean,
      default: false, // Determines if bot retains past interactions
    },
    restrictions: {
      type: [String], // Topics or actions the bot should avoid
      default: [],
    },
  },

  category: {
    type: String,
    enum: ["general", "role-playing", "specialized"],
    default: "general",
  },
  sessionSettings: {
    timeout: { type: Number, default: 6 }, // Hours of inactivity
    maxSummaryLength: { type: Number, default: 200 }, // Characters
    maxHistorySessions: { type: Number, default: 3 }, // How many past summaries to keep
  },
  specification: {
    context: {
      type: Number,
      required: true,
    },
    maxOutput: {
      type: Number,
      required: true,
    },
    inputCost: {
      type: Number,
      default: 0,
    },
    outputCost: {
      type: Number,
      default: 0,
    },
    latency: {
      // Changed to camelCase (recommended convention)
      type: Number,
      default: 1.36, // Fixed typo 'defalt' -> 'default'
    },
    throughput: {
      type: Number,
    },
  },
});

// module.exports = mongoose.model("Bot", botSchema, "aiverse-bot");
// Check if the User model already exists. If so, reuse it.
module.exports =
  mongoose.models.Bot || mongoose.model("Bot", botSchema, "aiverse-bot");
