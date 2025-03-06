const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Bot = require("../models/Bot");
const axios = require("axios");
const { decrypt } = require("../utils/encryption");

// async function callBotAPI(bot, content) {
//   const decryptedKey = decrypt(bot.apiKey); // Decrypt the key

//   const response = await axios.post(
//     bot.endpoint,
//     {
//       model: bot.model,
//       messages: [
//         { role: "system", content: bot.context },
//         { role: "user", content },
//       ],
//     },
//     { headers: { Authorization: `Bearer ${decryptedKey}` } }
//   );
//   return response.data.choices[0].message.content;
// }

async function callBotAPI(bot, content) {
  const decryptedKey = decrypt(bot.apiKey); // Decrypt the key

  const response = await axios.post(
    bot.endpoint,
    {
      model: bot.model,
      messages: [
        { role: "system", content: bot.context },
        { role: "user", content },
      ],
      stream: false, // Added stream parameter as specified in the cURL example
    },
    {
      headers: {
        "Content-Type": "application/json", // Explicit content type (axios adds this by default, but shown for completeness)
        Authorization: `Bearer ${decryptedKey}`,
      },
    }
  );
  return response.data.choices[0].message.content;
}

exports.getMessages = async (req, res) => {
  try {
    const { userId, botId } = req.params;
    const conversation = await Conversation.findOne({
      user: userId,
      bot: botId,
    }).populate({
      path: "messages",
      options: { sort: { timestamp: 1 }, limit: 50 },
    });

    if (!conversation) return res.json([]);
    res.json(conversation.messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { userId, botId } = req.params;
    const { content } = req.body;

    // Find bot and validate access
    const bot = await Bot.findById(botId);
    if (!bot || (bot.owner !== userId && bot.owner !== null)) {
      return res.status(403).json({ message: "Bot not accessible" });
    }

    // Save user message
    const userMessage = new Message({
      conversation: conversation._id,
      sender: "user",
      content,
    });
    await userMessage.save();

    // Get bot response using its context
    const botResponse = await callBotAPI(bot, content); // Bot's context is included here
    const botMessage = new Message({
      conversation: conversation._id,
      sender: "bot",
      content: botResponse,
    });
    await botMessage.save();

    res.json({ userMessage, botMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
