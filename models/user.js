const mongoose = require("mongoose");
const Bot = require("./bot"); // Import the Bot model

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // password: {
  //   type: String,
  //   required: true,
  //   select: false, // Exclude password by default
  // },
  avatar: {
    type: String,
    default: "default-avatar.png",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  bots: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bot",
      default: [],
    },
  ],
  // Optional: Add preferences or settings if needed
});

// Assign default bots before saving a new user
userSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const defaultBots = await Bot.find({ isDefault: true }).select("_id");
      this.bots = defaultBots.map((bot) => bot._id);
    } catch (error) {
      console.error("Error fetching default bots:", error);
    }
  }
  next();
});

// Check if the User model already exists. If so, reuse it.
module.exports =
  mongoose.models.User || mongoose.model("User", userSchema, "aiverse-users");
