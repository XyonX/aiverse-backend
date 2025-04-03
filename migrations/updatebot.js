// migrations/updateApiKeys.js
// require("dotenv").config();
const mongoose = require("mongoose");
const { encrypt } = require("../utils/encryption");
const Bot = require("../models/bot");

async function migrateApiKeys() {
  try {
    // Connect to MongoDB
    const DB_URI =
      "mongodb+srv://joydip:k1rPxx6rBZ1RZCiN@nodejs-ecommerce-api.qb2vm.mongodb.net/nodejs-ecommerce-api?retryWrites=true&w=majority&appName=nodejs-ecommerce-apiJWT_SECRET=f98d45daaa9d7f8883221f624ab1b69e3052de6ea6e0bb37d51159f1189e113c";
    await mongoose.connect(DB_URI);

    // // Get new API key from environment variables
    // const newApiKey = process.env.NEW_API_KEY;
    // if (!newApiKey) {
    //   throw new Error("NEW_API_KEY environment variable not set");
    // }

    // Encrypt the new key once
    const encryptedKey = encrypt(
      "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"
    );

    // Update all bots
    const result = await Bot.updateMany(
      {}, // Match all documents
      { $set: { apiKey: encryptedKey } },
      { multi: true }
    );

    console.log(`Successfully updated ${result.nModified} bots`);

    // Close connection
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateApiKeys();
