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
    const { textContent, conversationId, tempUserMessageId, tempBotMessageId } =
      req.body;
    const file = req.file;
    let finalTextContent = textContent || "Explain the image or file";

    // 1. Create user message
    let userMessage;
    if (file) {
      const isImage = file.mimetype.startsWith("image/");
      if (isImage) {
        userMessage = new Message.Image({
          conversation: conversationId,
          sender: "user",
          textContent: finalTextContent,
          images: [
            {
              url: `/uploads/${file.filename}`,
              name: file.originalname,
            },
          ],
        });
      } else {
        userMessage = new Message.File({
          conversation: conversationId,
          sender: "user",
          textContent: finalTextContent,
          file: {
            url: `/uploads/${file.filename}`,
            name: file.originalname,
            size: formatSize(file.size),
          },
        });
      }
    } else {
      if (!textContent) {
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

    // 2. Fetch conversation and bot configuration
    const conversation = await Conversation.findById(conversationId).populate(
      "bot"
    );
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const bot = conversation.bot;

    // 3. Handle streaming response
    if (bot.streamingEnabled) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Create initial bot message
      const botMessage = new Message.Text({
        conversation: conversationId,
        sender: "bot",
        textContent: "",
      });
      await botMessage.save();

      // Send initialization event
      res.write(
        `data: ${JSON.stringify({
          type: "init",
          tempUserMessageId,
          userMessage: userMessage.toObject(),
          tempBotMessageId,
          botMessage: botMessage.toObject(),
        })}\n\n`
      );

      // Update conversation with both messages
      await Conversation.findByIdAndUpdate(conversationId, {
        $push: { messages: { $each: [userMessage._id, botMessage._id] } },
        $set: { lastMessageTimestamp: Date.now() },
      });

      // Initialize OpenAI
      const openai = new OpenAI({
        apiKey: decrypt(bot.apiKey),
        baseURL: bot.endpoint,
      });

      try {
        // Stream OpenAI response
        const stream = await openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: bot.context || "You are a helpful assistant.",
            },
            { role: "user", content: finalTextContent }, // Changed from textContent to finalTextContent
          ],
          model: bot.model,
          stream: true,
        });

        let fullContent = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            res.write(
              `data: ${JSON.stringify({
                type: "chunk",
                botMessageId: botMessage._id.toString(),
                content: content,
              })}\n\n`
            );
          }
        }

        // Update final bot message
        botMessage.textContent = fullContent;
        await botMessage.save();

        // Send completion event
        res.write(
          `data: ${JSON.stringify({
            type: "complete",
            botMessage: botMessage.toObject(),
          })}\n\n`
        );
      } catch (error) {
        console.error("Streaming error:", error);
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Error generating response",
          })}\n\n`
        );
      } finally {
        res.end();
      }
    } else {
      // Non-streaming logic
      const openai = new OpenAI({
        apiKey: decrypt(bot.apiKey),
        baseURL: bot.endpoint,
      });

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: bot.context || "You are a helpful assistant.",
          },
          { role: "user", content: finalTextContent }, // Changed from textContent to finalTextContent
        ],
        model: bot.model,
      });

      const botContent = completion.choices[0].message.content;
      const botMessage = new Message.Text({
        conversation: conversationId,
        sender: "bot",
        textContent: botContent,
      });
      await botMessage.save();

      await Conversation.findByIdAndUpdate(conversationId, {
        $push: { messages: { $each: [userMessage._id, botMessage._id] } },
        $set: { lastMessageTimestamp: Date.now() },
      });

      res.json({
        userMessage: userMessage.toObject(),
        botMessage: botMessage.toObject(),
      });
    }
  } catch (error) {
    console.error("Error in createMessage:", error);
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Error processing message",
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ message: "Error sending message" });
    }
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
