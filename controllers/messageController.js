//messageController.js
const Message = require("../models/message");
const User = require("../models/user");
const Conversation = require("../models/conversation");
const { OpenAI } = require("openai"); // Example using OpenAI
const { decrypt } = require("../utils/encryption");
const fs = require("fs");
const appContext = JSON.parse(
  fs.readFileSync("./context/appContext.json", "utf8")
);

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
    const { textContent, conversationId, userId } = req.body;
    const file = req.file;

    // Validate input
    if (!textContent?.trim() && !file) {
      console.warn("[Message Handler] Validation failed: No content provided");
      return res.status(400).json({ message: "Content or file required" });
    }

    // 1. Create user message
    let userMessage;
    try {
      if (file) {
        const isImage = file.mimetype.startsWith("image/");
        const finalTextContent = textContent?.trim() || "Explain the file";

        if (isImage) {
          userMessage = new Message.Image({
            conversation: conversationId,
            sender: "user",
            textContent: finalTextContent,
            images: [
              { url: `/uploads/${file.filename}`, name: file.originalname },
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
        userMessage = new Message.Text({
          conversation: conversationId,
          sender: "user",
          textContent: textContent.trim(),
        });
      }

      await userMessage.save();
    } catch (dbError) {
      console.error("[Message Handler] Message creation failed:", dbError);
      return res.status(500).json({ message: "Failed to create message" });
    }

    // 2. Fetch conversation and bot configuration
    const conversation = await Conversation.findById(conversationId).populate(
      "bot"
    );
    if (!conversation) {
      console.error("[Message Handler] Conversation not found - rolling back");
      await userMessage.remove();
      return res.status(404).json({ message: "Conversation not found" });
    }

    const bot = conversation.bot;

    // 3. Initialize OpenAI
    let openai;
    try {
      openai = new OpenAI({
        apiKey: decrypt(bot.apiKey),
        baseURL: bot.endpoint,
      });
    } catch (decryptError) {
      console.error("[OpenAI] Decryption failed:", decryptError);
      await userMessage.remove();
      return res.status(500).json({ message: "API configuration error" });
    }
    console.log("userID");

    console.log(userId);
    const user = await User.findById(userId);

    // *** New: Construct the system message with app context ***
    const name = user.displayName || user.username;
    const userPreferences =
      user.preferences.length > 0 ? user.preferences.join(", ") : null;
    //we have appContext.json imported as appContext

    // const systemMessage = `You are in the ${appContext.appName} app, which is ${
    //   appContext.theme
    // }. You are chatting with ${name}, who is interested in ${
    //   userPreferences || "various topics"
    // }. ${bot.context?.systemMessage || "You are a helpful assistant."}

    // Your personality is ${
    //   bot.context?.personality || "friendly"
    // }. Your knowledge scope includes ${
    //   bot.context?.knowledgeScope?.join(", ") || "general topics"
    // }. ${
    //   bot.context?.restrictions?.length
    //     ? `Avoid discussing: ${bot.context.restrictions.join(", ")}.`
    //     : ""
    // }`.trim();
    const systemMessage = `
    You are in [App: ${appContext.appName}] (Theme: ${appContext.theme}).
    Current User: ${name} (Interests: ${userPreferences || "general topics"}).

    ### Bot Configuration
    Personality: ${bot.context?.personality || "friendly"}
    Knowledge Scope: ${
      bot.context?.knowledgeScope?.join(", ") || "general topics"
    }
    ${
      bot.context?.restrictions?.length
        ? `Restrictions: NEVER discuss ${bot.context.restrictions.join(", ")}\n`
        : ""
    }
    ${bot.context?.systemMessage || "Default: Helpful assistant."}
    `.trim();

    console.log("[system Message]:");
    console.log(systemMessage);

    // 4. Handle streaming response
    if (bot.streamingEnabled) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let botMessage;
      try {
        botMessage = new Message.Text({
          conversation: conversationId,
          sender: "bot",
          textContent: "PLACEHOLDER",
          isTemporary: true,
        });
        await botMessage.save();
      } catch (botMessageError) {
        console.error(
          "[Streaming] Bot message creation failed:",
          botMessageError
        );
        await userMessage.remove();
        return res
          .status(500)
          .json({ message: "Failed to initialize response" });
      }

      await Conversation.findByIdAndUpdate(conversationId, {
        $push: { messages: { $each: [userMessage._id, botMessage._id] } },
        $set: { lastMessageTimestamp: new Date() },
      });

      res.write(
        `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
      );

      try {
        const stream = await openai.chat.completions.create({
          model: bot.model,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: textContent },
          ],
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices?.[0]?.delta?.content) {
            const contentChunk = chunk.choices[0].delta.content;
            botMessage.textContent += contentChunk;
            await botMessage.save();
            res.write(
              `data: ${JSON.stringify({
                type: "chunk",
                content: contentChunk,
              })}\n\n`
            );
          }
        }

        botMessage.isTemporary = false;
        botMessage.textContent = botMessage.textContent.replace(
          /^PLACEHOLDER\s*/,
          ""
        );
        await botMessage.save();
        res.write(
          `data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`
        );
      } catch (streamError) {
        console.error("[Streaming] Error:", streamError);
        await Promise.all([botMessage?.remove(), userMessage.remove()]);
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
      try {
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: bot.context || "You are a helpful assistant.",
            },
            { role: "user", content: textContent },
          ],
          model: bot.model,
        });

        const botMessage = new Message.Text({
          conversation: conversationId,
          sender: "bot",
          textContent: completion.choices[0].message.content,
        });

        await botMessage.save();
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: { messages: { $each: [userMessage._id, botMessage._id] } },
          $set: { lastMessageTimestamp: new Date() },
        });

        res.json({
          userMessage: userMessage.toObject(),
          botMessage: botMessage.toObject(),
        });
      } catch (apiError) {
        console.error("[Response] API error:", apiError);
        await userMessage.remove();
        res.status(500).json({ message: "Error generating response" });
      }
    }
  } catch (error) {
    console.error("[CreateMessage] Unexpected error:", error);

    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Processing error",
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
    console.log(
      "[FetchMessages] Fetching messages for conversation:",
      req.params.conversationId
    );

    const messages = await Message.find({
      conversation: req.params.conversationId,
    }).sort({ timestamp: 1 });

    console.log("[FetchMessages] Retrieved", messages.length, "messages.");
    res.json(messages);
  } catch (error) {
    console.error("[FetchMessages] Error fetching messages:", error);
    res.status(500).json({ message: "Error fetching messages" });
  } finally {
    console.log("[FetchMessages] Finished processing request for messages.");
  }
};
