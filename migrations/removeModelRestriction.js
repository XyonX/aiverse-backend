// migrations/remove-model-index.js
require("dotenv").config();
const mongoose = require("mongoose");
const Bot = require("../models/bot");

async function removeModelIndex() {
  try {
    // 1. Connect to DB
    const DB_URI =
      "mongodb+srv://joydip:k1rPxx6rBZ1RZCiN@nodejs-ecommerce-api.qb2vm.mongodb.net/nodejs-ecommerce-api?retryWrites=true&w=majority&appName=nodejs-ecommerce-apiJWT_SECRET=f98d45daaa9d7f8883221f624ab1b69e3052de6ea6e0bb37d51159f1189e113c";
    await mongoose.connect(DB_URI);

    // Get the native MongoDB collection instance
    const collection = mongoose.connection.db.collection("aiverse-bot");

    // Check if index exists first
    const indexes = await collection.indexes();
    const modelIndex = indexes.find((index) => index.name === "model_1");

    if (modelIndex) {
      // Remove the index
      await collection.dropIndex("model_1");
      console.log("Successfully dropped model_1 index");
    } else {
      console.log("model_1 index does not exist, skipping removal");
    }

    // Close connection
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

removeModelIndex();
