const Message = require("../models/message");
const Bot = require("../models/bot");
const axios = require("axios");

async function callBotAPI(bot, content) {
  // Example implementation for a generic bot API
  const response = await axios.post(
    bot.endpoint,
    {
      model: bot.model,
      messages: [{ role: "user", content }],
    },
    { headers: { Authorization: `Bearer ${bot.apiKey}` } }
  );
  return response.data.choices[0].message.content; // Adjust based on actual API response
}

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const botId = req.params.botId;
    const messages = await Message.find({ userId, botId })
      .sort({ timestamp: 1 })
      .limit(50); // Pagination can be added later
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const botId = req.params.botId;
    const { content } = req.body;

    // Save user's message
    const userMessage = new Message({
      userId,
      botId,
      sender: "user",
      content,
      timestamp: new Date(),
    });
    await userMessage.save();

    // Check bot access
    const bot = await Bot.findOne({
      _id: botId,
      $or: [{ owner: userId }, { owner: null }],
    });
    if (!bot) {
      return res.status(403).json({ message: "Bot not accessible" });
    }

    // Get and save bot's response
    const botResponse = await callBotAPI(bot, content);
    const botMessage = new Message({
      userId,
      botId,
      sender: "bot",
      content: botResponse,
      timestamp: new Date(),
    });
    await botMessage.save();

    res.json({ userMessage, botMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
