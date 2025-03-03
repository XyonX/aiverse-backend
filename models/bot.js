const mongoose = require("mongoose");

const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiKey: { type: String, required: true },
  endpoint: { type: String, required: true },
  model: { type: String, required: true },
  avatar: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

module.exports = mongoose.model("Bot", botSchema);
