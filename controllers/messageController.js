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
const sessionUtils = require("../utils/sessionUtils");

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
// Helper functions
async function createUserMessage(conversationId, file, textContent, session) {
  let userMessage;

  if (file) {
    const isImage = file.mimetype.startsWith("image/");
    const finalTextContent = textContent?.trim() || "Explain the file";

    if (isImage) {
      userMessage = new Message.Image({
        conversation: conversationId,
        sender: "user",
        textContent: finalTextContent,
        images: [{ url: `/uploads/${file.filename}`, name: file.originalname }],
        sessionId: session.sessionId,
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
        sessionId: session.sessionId,
      });
    }
  } else {
    userMessage = new Message.Text({
      conversation: conversationId,
      sender: "user",
      textContent: textContent.trim(),
      sessionId: session.sessionId,
    });
  }

  await userMessage.save();
  return userMessage;
}
async function prepareSystemContext(userId, conversation) {
  const user = await User.findById(userId);
  const bot = conversation.bot;

  return {
    systemMessage: `
      You are in [App: ${appContext.appName}] (Theme: ${appContext.theme}).
      Current User: ${user.displayName || user.username} 
      (Interests: ${user.preferences?.join(", ") || "general topics"}).

      ### Bot Configuration
      Personality: ${bot.context?.personality || "friendly"}
      Knowledge Scope: ${
        bot.context?.knowledgeScope?.join(", ") || "general topics"
      }
      ${
        bot.context?.restrictions?.length
          ? `Restrictions: ${bot.context.restrictions.join(", ")}`
          : ""
      }
      ${bot.context?.systemMessage || "Default: Helpful assistant."}
    `.trim(),
    user,
  };
}

async function buildChatContext(conversation, currentMessageId) {
  const context = [];
  const currentSession = conversation.sessions.find((s) => s.isActive);

  // Add historical summaries
  context.push(
    ...conversation.historicalSummaries.map((summary) => ({
      role: "system",
      content: `Previous conversation summary: ${summary}`,
    }))
  );

  // Add current session messages (excluding current message)
  if (currentSession) {
    const previousMessages = currentSession.messages.filter(
      (msgId) => msgId.toString() !== currentMessageId.toString()
    );

    if (previousMessages.length > 0) {
      const messages = await Message.find({ _id: { $in: previousMessages } })
        .sort({ timestamp: 1 })
        .lean();

      messages.forEach((msg) => {
        context.push({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.textContent || msg.content,
        });
      });
    }
  }

  return context;
}

function createOpenAIClient(bot) {
  let openai;

  openai = new OpenAI({
    apiKey: decrypt(bot.apiKey),
    baseURL: bot.endpoint,
  });
  return openai;
}

async function handleStreamingResponse({
  res,
  conversation,
  userMessage,
  llmMessages,
  conversationId,
  bot,
  session,
}) {
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
      sessionId: session.sessionId,
    });
    await botMessage.save();
  } catch (botMessageError) {
    console.error("[Streaming] Bot message creation failed:", botMessageError);
    await userMessage.remove();
    return res.status(500).json({ message: "Failed to initialize response" });
  }

  // await conversation.findByIdAndUpdate(conversationId, {
  //   $push: { messages: { $each: [userMessage._id, botMessage._id] } },
  //   $set: { lastMessageTimestamp: new Date() },
  // });

  await sessionUtils.addMessagesToConversation(conversation, [
    userMessage._id,
    botMessage._id,
  ]);

  res.write(
    `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
  );

  try {
    let openai = createOpenAIClient(bot);
    const stream = await openai.chat.completions.create({
      model: bot.model,
      messages: llmMessages,
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
    res.write(`data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`);
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
}
async function handleRegularResponse(
  res,
  conversation,
  userMessage,
  llmMessages,
  conversationId,
  bot,
  session
) {
  try {
    let openai = createOpenAIClient(bot);
    const completion = await openai.chat.completions.create({
      messages: llmMessages,
      model: bot.model,
    });

    const botMessage = new Message.Text({
      conversation: conversationId,
      sender: "bot",
      textContent: completion.choices[0].message.content,
      sessionId: session.sessionId,
    });

    await botMessage.save();
    // await conversation.findByIdAndUpdate(conversationId, {
    //   $push: { messages: { $each: [userMessage._id, botMessage._id] } },
    //   $set: { lastMessageTimestamp: new Date() },
    // });

    await sessionUtils.addMessagesToConversation(conversation, [
      userMessage._id,
      botMessage._id,
    ]);

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

exports.createMessage = async (req, res) => {
  try {
    const { textContent, conversationId, userId } = req.body;
    const file = req.file;

    // Validate input
    if (!textContent?.trim() && !file) {
      console.warn("[Message Handler] Validation failed: No content provided");
      return res.status(400).json({ message: "Content or file required" });
    }
    console.log("Message validation passed");

    //001
    const conversation = await Conversation.findById(conversationId)
      .populate("bot")
      .populate("sessions.messages"); // ✅ Remove sorting here

    // Manually sort messages inside each session
    conversation.sessions.forEach((session) => {
      session.messages.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
    });
    console.log("Conversation found with id ", conversation._id);

    if (!conversation)
      return res.status(404).json({ message: "Conversation not found" });

    // Session management - ensure active session
    const session = await sessionUtils.getOrCreateActiveSession(conversation);

    console.log("Seassion responce", session);

    // 1. Create and save user message
    const userMessage = await createUserMessage(
      conversationId,
      file,
      textContent,
      session
    );
    console.log("User Messae created :", userMessage);

    // Add user message to session immediately
    //await sessionUtils.addMessageToConversation(conversation, userMessage._id);

    // 2. Prepare context-aware system message
    const { systemMessage, user } = await prepareSystemContext(
      userId,
      conversation
    );

    // 3. Build conversation context
    const context = await buildChatContext(conversation, userMessage._id);

    // 4. Prepare LLM messages array
    const llmMessages = [
      { role: "system", content: systemMessage },
      ...context,
      { role: "user", content: userMessage.textContent },
    ];

    // 5. Handle streaming response
    if (conversation.bot.streamingEnabled) {
      return handleStreamingResponse({
        res,
        conversation,
        userMessage,
        llmMessages,
        conversationId,
        bot: conversation.bot,
        session,
      });
    }

    // Handle non-streaming response
    return handleRegularResponse({
      res,
      conversation,
      userMessage,
      llmMessages,
      conversationId,
      bot: conversation.bot,
      session,
    });
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
