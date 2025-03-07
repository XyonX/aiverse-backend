// const Message = require("../models/Message");
// const Conversation = require("../models/Conversation");
// const Bot = require("../models/Bot");
// const axios = require("axios");
// const { decrypt } = require("../utils/encryption");

// // async function callBotAPI(bot, content) {
// //   const decryptedKey = decrypt(bot.apiKey); // Decrypt the key

// //   const response = await axios.post(
// //     bot.endpoint,
// //     {
// //       model: bot.model,
// //       messages: [
// //         { role: "system", content: bot.context },
// //         { role: "user", content },
// //       ],
// //     },
// //     { headers: { Authorization: `Bearer ${decryptedKey}` } }
// //   );
// //   return response.data.choices[0].message.content;
// // }

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
//       stream: false, // Added stream parameter as specified in the cURL example
//     },
//     {
//       headers: {
//         "Content-Type": "application/json", // Explicit content type (axios adds this by default, but shown for completeness)
//         Authorization: `Bearer ${decryptedKey}`,
//       },
//     }
//   );
//   return response.data.choices[0].message.content;
// }

// exports.getMessages = async (req, res) => {
//   try {
//     const { userId, botId } = req.params;
//     const conversation = await Conversation.findOne({
//       user: userId,
//       bot: botId,
//     }).populate({
//       path: "messages",
//       options: { sort: { timestamp: 1 }, limit: 50 },
//     });

//     if (!conversation) return res.json([]);
//     res.json(conversation.messages);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// exports.sendMessage = async (req, res) => {
//   try {
//     const { userId, botId } = req.params;
//     const { content } = req.body;

//     // Find bot and validate access
//     const bot = await Bot.findById(botId);
//     if (!bot || (bot.owner !== userId && bot.owner !== null)) {
//       return res.status(403).json({ message: "Bot not accessible" });
//     }

//     // Save user message
//     const userMessage = new Message({
//       conversation: conversation._id,
//       sender: "user",
//       content,
//     });
//     await userMessage.save();

//     // Get bot response using its context
//     const botResponse = await callBotAPI(bot, content); // Bot's context is included here
//     const botMessage = new Message({
//       conversation: conversation._id,
//       sender: "bot",
//       content: botResponse,
//     });
//     await botMessage.save();

//     res.json({ userMessage, botMessage });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

const Message = require("../models/message");
const Conversation = require("../models/conversation");
const Bot = require("../models/bot");
const { OpenAI } = require("openai"); // Example using OpenAI
const { decrypt } = require("../utils/encryption");
exports.createMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body;

    console.log("Received request to create message.");
    console.log("Conversation ID:", conversationId);
    console.log("Message content:", content);

    // 1. Save user message
    console.log("Saving user message...");
    const userMessage = new Message({
      conversation: conversationId,
      sender: "user",
      content,
    });
    await userMessage.save();
    console.log("User message saved with ID:", userMessage._id);

    // 2. Get bot configuration
    console.log("Fetching conversation and bot configuration...");
    const conversation = await Conversation.findById(conversationId).populate(
      "bot"
    );
    if (!conversation) {
      console.error("Conversation not found for ID:", conversationId);
      return res.status(404).json({ message: "Conversation not found" });
    }
    console.log("Conversation fetched:", conversation);
    const bot = conversation.bot;
    console.log("Bot configuration:", bot);
    // 3. Generate bot response
    console.log("Generating bot response...");

    const openai = new OpenAI({
      apiKey: decrypt(bot.apiKey), // Implement your decryption
      baseURL: "https://api.deepseek.com", // Hardcoded endpoint,
    });

    // Prepare request data: using a system message from bot context followed by the user's message.
    const requestData = {
      messages: [
        {
          role: "system",
          content: bot.context || "You are a helpful assistant.",
        },
        { role: "user", content },
      ],
      model: bot.model,
    };

    // Log the data being sent to OpenAI
    console.log("Data passed to OpenAI:", requestData);

    const completion = await openai.chat.completions.create(requestData);

    const botContent = completion.choices[0].message.content;
    console.log("Bot response generated:", botContent);

    // 4. Save bot message
    console.log("Saving bot message...");
    const botMessage = new Message({
      conversation: conversationId,
      sender: "bot",
      content: botContent,
    });
    await botMessage.save();
    console.log("Bot message saved with ID:", botMessage._id);

    // 5. Update conversation
    console.log("Updating conversation with new messages...");
    await Conversation.findByIdAndUpdate(conversationId, {
      $push: { messages: { $each: [userMessage._id, botMessage._id] } },
      lastMessageTimestamp: Date.now(),
    });
    console.log("Conversation updated successfully.");

    res.json({
      userMessage,
      botMessage,
    });
  } catch (error) {
    console.error("Error in createMessage:", error);
    res.status(500).json({ message: "Error sending message" });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      conversation: req.params.conversationId,
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages" });
  }
};
