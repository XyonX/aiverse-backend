//messageController.js
const Message = require("../models/message");
const Conversation = require("../models/conversation");
const { OpenAI } = require("openai"); // Example using OpenAI
const { decrypt } = require("../utils/encryption");

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

exports.createMessage = async (req, res) => {
  try {
    const { textContent, conversationId } = req.body;
    const file = req.file;

    // Ensure textContent is set properly
    let finalTextContent = textContent || "Explain the image or file"; // Default fallback

    console.log("Received request to create message.");
    console.log("Conversation ID:", conversationId);
    console.log("Message content:", textContent);
    console.log("File:", file);

    // 1. Create user message based on request data
    let userMessage;
    if (file) {
      const isImage = file.mimetype.startsWith("image/");
      if (isImage) {
        userMessage = new Message.Image({
          conversation: conversationId,
          sender: "user",
          // caption: content, // Text sent with the image
          textContent: finalTextContent,
          images: [
            {
              url: `/uploads/${file.filename}`, // URL for frontend access
              name: file.originalname, // Original filename
            },
          ],
        });
      } else {
        userMessage = new Message.File({
          conversation: conversationId,
          sender: "user",
          // caption: content, // Text sent with the file
          textContent: finalTextContent,
          file: {
            url: `/uploads/${file.filename}`,
            name: file.originalname,
            size: formatSize(file.size), // Convert bytes to human-readable string
          },
        });
      }
    } else {
      if (!textContent) {
        console.log("Contet or text not received");
        return res
          .status(400)
          .json({ message: "Content is required for text messages" });
      }
      userMessage = new Message.Text({
        conversation: conversationId,
        sender: "user",
        textContent: textContent,
      });
    }
    await userMessage.save();
    console.log("User message saved with ID:", userMessage._id);

    // 2. Fetch conversation and bot configuration
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
      apiKey: decrypt(bot.apiKey),
      baseURL: bot.endpoint,
    });

    const requestData = {
      messages: [
        {
          role: "system",
          content: bot.context || "You are a helpful assistant.",
        },
        { role: "user", content: textContent },
      ],
      model: bot.model,
    };
    console.log("Data passed to OpenAI:", requestData);

    const completion = await openai.chat.completions.create(requestData);
    const botContent = completion.choices[0].message.content;
    console.log("Bot response generated:", botContent);

    // 4. Save bot message (always text)
    console.log("Saving bot message...");
    const botMessage = new Message.Text({
      conversation: conversationId,
      sender: "bot",
      textContent: botContent,
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

    // 6. Send response with full message objects
    res.json({
      userMessage: userMessage.toObject(), // Includes type and specific fields
      botMessage: botMessage.toObject(),
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
