const Bot = require("../models/Bot");
const User = require("../models/User");
const { encrypt } = require("../utils/encryption");

// exports.getBots = async (req, res) => {
//   // try {
//   //   const userId = req.user.id;
//   //   const bots = await Bot.find({
//   //     $or: [{ owner: userId }, { owner: null, isDefault: true }],
//   //   });
//   //   res.json(bots);
//   // } catch (error) {
//   //   res.status(500).json({ message: error.message });
//   // }

//   const { id } = req.params;
//   if (id) {
//     const bot = await Bot.findById(id);
//     res.json(bot);
//   } else {
//     const bots = await Bot.find({ owner: null, isDefault: true });
//     res.json(bots);
//   }
// };
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
    const { name, apiKey, endpoint, model, context, category, isDefault } =
      req.body;

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
    });
    await newBot.save();
    res.status(201).json(newBot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
