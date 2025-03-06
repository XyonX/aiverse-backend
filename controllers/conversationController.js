const Conversation = require("../models/Conversation");

exports.getUserConversations = async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await Conversation.find({ user: userId })
      .populate("bot") // Include bot name/avatar
      .sort({ lastMessageTimestamp: -1 });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
