const { Conversation } = require("../models/conversation");
const Message = require("../models/message");

exports.getUserConversations = async (req, res) => {
  console.log(`getUserConversations initiated for user: ${req.params.userId}`);
  try {
    const conversations = await Conversation.find({ user: req.params.userId })
      .populate("bot")
      .populate({
        path: "messages",
        match: { isTemporary: false },
        options: { sort: { timestamp: -1 }, limit: 20 },
      })
      .sort({ lastMessageTimestamp: -1 });

    console.log(
      `Successfully retrieved ${conversations.length} conversations for user: ${req.params.userId}`
    );
    res.json(conversations);
  } catch (error) {
    console.error(
      `Error fetching conversations for user ${req.params.userId}:`,
      error
    );
    res.status(500).json({ message: "Error fetching conversations" });
  }
};

exports.getUserBotConversation = async (req, res) => {
  console.log(
    `getUserBotConversation requested for user: ${req.params.userId}, bot: ${req.params.botId}`
  );
  try {
    const conversation = await Conversation.findOne({
      user: req.params.userId,
      bot: req.params.botId,
    })
      .populate("bot")
      .populate("messages");

    if (!conversation) {
      console.log(
        `No conversation found for user: ${req.params.userId} and bot: ${req.params.botId}`
      );
      return res.status(404).json({ message: "Conversation not found" });
    }

    console.log(
      `Found conversation ${conversation._id} with ${conversation.messages.length} messages`
    );
    res.json(conversation);
  } catch (error) {
    console.error(
      `Error retrieving conversation for user ${req.params.userId}, bot ${req.params.botId}:`,
      error
    );
    res.status(500).json({ message: "Error fetching conversation" });
  }
};

exports.createConversation = async (req, res) => {
  console.log(
    `createConversation request received for user: ${req.body.userId}, bot: ${req.body.botId}`
  );
  try {
    const { userId, botId } = req.body;

    const existingConversation = await Conversation.findOne({
      user: userId,
      bot: botId,
    });

    if (existingConversation) {
      console.log(
        `Conversation already exists for user: ${userId} and bot: ${botId}`
      );
      return res.status(400).json({ message: "Conversation already exists" });
    }

    const newConversation = new Conversation({
      user: userId,
      bot: botId,
      messages: [],
    });

    await newConversation.save();
    console.log(
      `Created new conversation ${newConversation._id} for user: ${userId}`
    );
    res.status(201).json(newConversation);
  } catch (error) {
    console.error(
      `Error creating conversation for user ${req.body.userId}:`,
      error
    );
    res.status(500).json({ message: "Error creating conversation" });
  }
};
