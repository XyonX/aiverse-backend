// const Conversation = require("../models/Conversation");

// exports.getUserConversations = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const conversations = await Conversation.find({ user: userId })
//       .populate("bot") // Include bot name/avatar
//       .sort({ lastMessageTimestamp: -1 });
//     res.json(conversations);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

const Conversation = require("../models/conversation");
const Message = require("../models/message");

exports.getUserConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ user: req.params.userId })
      .populate("bot")
      .populate({
        path: "messages",
        options: { sort: { timestamp: 1 }, limit: 1 },
      })
      .sort({ lastMessageTimestamp: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching conversations" });
  }
};

exports.getUserBotConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      user: req.params.userId,
      bot: req.params.botId,
    })
      .populate("bot")
      .populate("messages");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: "Error fetching conversation" });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const { userId, botId } = req.body;

    const existingConversation = await Conversation.findOne({
      user: userId,
      bot: botId,
    });

    if (existingConversation) {
      return res.status(400).json({ message: "Conversation already exists" });
    }

    const newConversation = new Conversation({
      user: userId,
      bot: botId,
      messages: [],
    });

    await newConversation.save();
    res.status(201).json(newConversation);
  } catch (error) {
    res.status(500).json({ message: "Error creating conversation" });
  }
};
