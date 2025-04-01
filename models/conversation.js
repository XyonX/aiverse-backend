//conversation.js
const mongoose = require("mongoose");
const sessionSchema = mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  sessionId: { type: String, default: () => uuidv4() },

  // contains summary of conversation thisis generated after a session is end or isactive is set to false
  //maybe 10 past session summary could be atted to context
  summary: [
    // For AI context
    {
      _id: false, // Disable automatic _id for summary items
      role: {
        type: String,
        enum: ["system", "user", "assistant"],
      },
      content: String,
    },
  ],
  //contains all the messages of conversation in conversation format
  //will be deleted at the time of closing session
  //summary and hosstorical summary will be generated from this at teh time of closing
  //should be added to all message context
  sessionContext: [
    {
      _id: false, // Disable automatic _id for context items
      role: {
        type: String,
        enum: ["system", "user", "assistant"],
      },
      content: String,
    },
  ],
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  isActive: { type: Boolean, default: true },
  tokenCount: {
    type: Number,
    default: 0,
  },
});

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
    sessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
      },
    ],
    //the active session ref
    activeSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },
    // this can contian a stripped out version of seassion summary
    //maybe 20 historical summaries can be included in context

    lastActivity: { type: Date, default: Date.now },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    indexes: [{ unique: true, fields: ["user", "bot"] }],
  }
);

// Create models
const Session = mongoose.model("Session", sessionSchema, "aiverse-session");
const Conversation = mongoose.model(
  "Conversation",
  conversationSchema,
  "aiverse-conversation"
);

// Export both models
module.exports = {
  Session,
  Conversation,
};
//so the active session from the cureent converation will be always added as context
//and like last 20  recent summary session from the conversation will be taken from session array->summaries
