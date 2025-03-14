//message.js
const mongoose = require("mongoose");

// Define the base schema for all messages
const baseMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: String,
      enum: ["user", "bot"],
      required: true,
    },
    textContent: {
      type: String,
      required: true, // Mandatory text for all message types
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    isTemporary: {
      type: Boolean,
      default: false,
    },
  },
  { discriminatorKey: "type" }
);

// Create the base Message model, specifying the collection name
const Message = mongoose.model("Message", baseMessageSchema, "aiverse-message");

// Define subdocument schemas for image and file content
const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, required: true },
});

const fileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, required: true },
  size: { type: String, required: true },
});

// Discriminator for text messages (no additional fields needed)
const textMessageSchema = new mongoose.Schema({});
Message.Text = Message.discriminator("text", textMessageSchema);

// Discriminator for image messages (supports multiple images)
const imageMessageSchema = new mongoose.Schema({
  images: {
    type: [imageSchema],
    validate: {
      validator: (val) => val.length > 0,
      message: "Images array cannot be empty",
    },
  },
});
Message.Image = Message.discriminator("image", imageMessageSchema);

// Discriminator for file messages (single file)
const fileMessageSchema = new mongoose.Schema({
  file: { type: fileSchema, required: true },
});
Message.File = Message.discriminator("file", fileMessageSchema);

module.exports = Message;
