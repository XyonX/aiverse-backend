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

        //it keeps all themessage id of the convesation in message schema format not llm conversation role format
        messages: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
          },
        ],
        // contains summary of conversation thisis generated after a session is end or isactive is set to false
        //maybe 10 past session summary could be atted to context
        summary: [
          // For AI context
          {
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
        sessionContext: [
          {
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
      },
    ],
    // this can contian a stripped out version of seassion summary
    //maybe 20 historical summaries can be included in context
    historicalSummaries: [
      [
        // For AI context
        {
          role: { type: String, enum: ["system", "user", "assistant"] },
          content: String,
        },
      ],
    ],
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

module.exports = mongoose.model(
  "Conversation",
  conversationSchema,
  "aiverse-conversation"
);

//so 10 session summary at amx
//20 historical summary at max
//and
