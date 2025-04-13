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
    //input token capacity of the modle
    context: {
      type: Number,
      required: true,
    },
    //output caparcity or max toke generation
    maxOutput: {
      type: Number,
      required: true,
    },
    //  cost per m input token
    inputCost: {
      type: Number,
      default: 0,
    },
    //cost per m output token
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
  messageTokenLimit: {
    type: Number,
    default: 10000,
  },
});

botSchema.pre("save", function (next) {
  const context = this.specification.context; // Model’s total token capacity
  const twentyPercent = context * 0.2;

  // Determine the base limit based on context size
  let baseLimit;
  if (context >= 10000) {
    // For large models: use 20% if >=10k, else default to 10k
    baseLimit = Math.max(twentyPercent, 10000);
  } else {
    // For smaller models: use 20% but never less than 1k
    baseLimit = Math.max(twentyPercent, 1000);
  }

  // Ensure the limit does not exceed the model’s actual capacity
  this.messageTokenLimit = Math.min(baseLimit, context);

  next();
});

// module.exports = mongoose.model("Bot", botSchema, "aiverse-bot");
// Check if the User model already exists. If so, reuse it.
module.exports =
  mongoose.models.Bot || mongoose.model("Bot", botSchema, "aiverse-bot");
