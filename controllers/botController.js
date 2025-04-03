const Bot = require("../models/bot");
const User = require("../models/user");
const { encrypt } = require("../utils/encryption");

exports.getBots = async (req, res) => {
  try {
    const { id } = req.params;

    if (id) {
      const bot = await Bot.findById(id);
      if (!bot) {
        return res.status(404).json({ message: "Bot not found" });
      }
      res.json([bot]); // Return as an array
    } else {
      const bots = await Bot.find({ owner: null, isDefault: true });
      res.json(bots); // Already an array
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addBot = async (req, res) => {
  try {
    const {
      name,
      apiKey,
      endpoint,
      model,
      context,
      category,
      isDefault,
      specification,
    } = req.body;

    console.log("Received apiKey:", apiKey); // Debugging
    console.log(Buffer.from(process.env.ENCRYPTION_KEY).length);

    if (!apiKey) {
      return res.status(400).json({ message: "API Key is required" });
    }

    const encryptedKey = encrypt(apiKey); // Encrypt the key

    const newBot = new Bot({
      name,
      apiKey: encryptedKey, // Store encrypted key
      endpoint,
      model,
      context,
      category,
      owner: req.user?.id || null,
      isDefault,
      specification,
    });
    await newBot.save();
    res.status(201).json(newBot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.editBotbyId = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 1. Find the bot and validate ownership
    const bot = await Bot.findById(id);
    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    // // Check if the authenticated user owns the bot
    // if (bot.owner?.toString() !== req.user.id) {
    //   return res.status(403).json({ message: "Unauthorized to edit this bot" });
    // }

    // 2. Encrypt new API key (if provided)
    if (updates.apiKey) {
      bot.apiKey = encrypt(updates.apiKey);
    }

    // 3. Update allowed fields
    const allowedFields = [
      "name",
      "endpoint",
      "model",
      "context",
      "category",
      "isDefault",
      "specification",
    ];
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        bot[field] = updates[field];
      }
    });

    // Save changes
    await bot.save();

    res.json(bot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
exports.editBotbyModel = async (req, res) => {
  try {
    const { model } = req.params;
    const updates = req.body;

    // 1. Find the bot by model name
    const bot = await Bot.findOne({ model });
    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    // 2. Ownership check (commented for single-user setup)
    // if (bot.owner?.toString() !== req.user.id) {
    //   return res.status(403).json({ message: "Unauthorized to edit this bot" });
    // }

    // 3. Check for model name collision if changing model
    if (updates.model && updates.model !== model) {
      const existingBot = await Bot.findOne({ model: updates.model });
      if (existingBot) {
        return res.status(400).json({
          message: "New model name already exists. Choose a different name.",
        });
      }
    }

    // 4. Encrypt API key if provided
    if (updates.apiKey) {
      bot.apiKey = encrypt(updates.apiKey);
    }

    // 5. Update allowed fields with nested object handling
    const allowedFields = [
      "name",
      "endpoint",
      "model",
      "context",
      "category",
      "isDefault",
      "specification",
      "description",
      "sessionSettings",
      "messageTokenLimit",
    ];

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        if (field === "specification") {
          // Merge specification updates
          bot.specification = {
            ...bot.specification,
            ...updates.specification,
          };
        } else {
          bot[field] = updates[field];
        }
      }
    });

    // 6. Update timestamp
    bot.updatedAt = Date.now();

    // 7. Save changes with duplicate key safety
    await bot.save();

    res.json(bot);
  } catch (error) {
    // Handle MongoDB duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Model name conflict. Already exists in another bot.",
      });
    }
    res.status(400).json({ message: error.message });
  }
};
