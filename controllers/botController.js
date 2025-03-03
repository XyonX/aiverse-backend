const Bot = require("../models/bot");

exports.getBots = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const bots = await Bot.find({
      $or: [{ owner: userId }, { owner: null }],
    });
    res.json(bots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addBot = async (req, res) => {
  try {
    const userId = req.user.id;
    const newBot = new Bot({ ...req.body, owner: userId });
    await newBot.save();
    res.status(201).json(newBot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
