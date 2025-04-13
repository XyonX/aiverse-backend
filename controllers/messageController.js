// messageController.js
const Message = require("../models/message");
const User = require("../models/user");
const { Conversation, Session } = require("../models/conversation");
const { OpenAI } = require("openai");
const { decrypt } = require("../utils/encryption");
const sessionUtils = require("../utils/sessionUtils");

const appContext = {
  appName: "Aiverse",
  purpose:
    "A messaging platform for interacting with AI bots like ChatGPT, Gemini, and Grok.",
  platform: "A chat-based interface simulating natural human conversation.",
  theme: "modern ai messaging application",
};

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Helper function to create user message
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

// Prepare system context with user and bot details
async function prepareSystemContext(userId, conversation) {
  const user = await User.findById(userId).select(
    "displayName username preferences"
  );
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

// Build chat context efficiently
async function buildChatContext(conversation, session) {
  console.log("Starting to build chat context...");

  const { historyTokens, maxPastSessions } =
    sessionUtils.calculateTokenAllocation(conversation.bot);
  console.log(
    `Token allocation - historyTokens: ${historyTokens}, maxPastSessions: ${maxPastSessions}`
  );

  // Fetch only necessary closed sessions directly from the database
  const closedSessions = await Session.find({
    conversation: conversation._id,
    isActive: false,
  })
    .sort({ endTime: -1 })
    .limit(maxPastSessions)
    .select("summary")
    .lean();

  console.log(`Found ${closedSessions.length} closed sessions to include`);

  const historicalContext = closedSessions.flatMap(
    (session) => session.summary || []
  );
  console.log(
    `Collected ${historicalContext.length} historical context messages`
  );

  let tokenCount = historicalContext.reduce(
    (sum, msg) => sum + sessionUtils.calculateMessageToken(msg.content),
    0
  );
  console.log(`Initial historical context token count: ${tokenCount}`);

  // Trim historical context if it exceeds token limit
  while (tokenCount > historyTokens && historicalContext.length > 0) {
    const removedMsg = historicalContext.shift();
    const removedTokens = sessionUtils.calculateMessageToken(
      removedMsg.content
    );
    tokenCount -= removedTokens;
    console.log(
      `Removed message with ${removedTokens} tokens (new total: ${tokenCount})`
    );
  }

  // Use the active session's context directly
  const currentContext = session.sessionContext || [];
  console.log(`Current session has ${currentContext.length} context messages`);

  const context = [...historicalContext, ...currentContext];
  console.log(`Final context built with ${context.length} total messages`);

  return context;
}

// Create OpenAI client
function createOpenAIClient(bot) {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API || decrypt(bot.apiKey),
    baseURL: bot.endpoint,
  });
}

// Handle streaming response
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

    await sessionUtils.addMessagesToConversation(conversation, [
      userMessage._id,
    ]);
    console.log(
      `[Streaming] Added user message ${userMessage._id} to conversation`
    );
  } catch (error) {
    console.error("[Streaming] Initial setup failed:", error);
    await userMessage.deleteOne();
    return res.status(500).json({ message: "Failed to initialize response" });
  }

  res.write(
    `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
  );

  try {
    const openai = createOpenAIClient(bot);
    const stream = await openai.chat.completions.create({
      model: bot.model,
      messages: llmMessages,
      stream: true,
    });

    let firstContentReceived = false;

    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta?.content) {
        const contentChunk = chunk.choices[0].delta.content;
        if (!firstContentReceived) {
          botMessage.textContent = contentChunk;
          firstContentReceived = true;
        } else {
          botMessage.textContent += contentChunk;
        }
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
    await botMessage.save();
    await sessionUtils.addMessagesToConversation(conversation, [
      botMessage._id,
    ]);
    console.log(
      `[Streaming] Added bot message ${botMessage._id} to conversation`
    );
    res.write(`data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`);
  } catch (streamError) {
    console.error("[Streaming] Error:", streamError);
    await Promise.all([botMessage?.deleteOne(), userMessage.deleteOne()]);
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

// Handle regular (non-streaming) response
async function handleRegularResponse({
  res,
  conversation,
  userMessage,
  llmMessages,
  conversationId,
  bot,
  session,
}) {
  try {
    const openai = createOpenAIClient(bot);
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
    await userMessage.deleteOne();
    res.status(500).json({ message: "Error generating response" });
  }
}

// Main createMessage controller
exports.createMessage = async (req, res) => {
  try {
    const { textContent, conversationId, userId } = req.body;
    const file = req.file;

    if (!textContent?.trim() && !file) {
      console.warn("[Message Handler] Validation failed: No content provided");
      return res.status(400).json({ message: "Content or file required" });
    }
    console.log("Message validation passed");

    // Fetch conversation and user concurrently
    const [conversation, user] = await Promise.all([
      Conversation.findById(conversationId).populate("bot"),
      User.findById(userId).select("displayName username preferences"),
    ]);

    if (!conversation)
      return res.status(404).json({ message: "Conversation not found" });

    // Get or create active session
    const session = await sessionUtils.getOrCreateActiveSession(conversation);
    if (!session) throw new Error("Failed to get or create active session");

    // Create user message
    const userMessage = await createUserMessage(
      conversationId,
      file,
      textContent,
      session
    );
    console.log("User Message created:", userMessage);

    // Prepare system context
    const { systemMessage } = await prepareSystemContext(userId, conversation);

    // Build chat context
    const context = await buildChatContext(conversation, session);
    console.log("Final context created:", context);

    // Prepare LLM messages
    const llmMessages = [
      { role: "system", content: systemMessage },
      ...context,
      { role: "user", content: userMessage.textContent },
    ];

    // Check token limit
    const totalTokens = llmMessages.reduce(
      (sum, msg) => sum + sessionUtils.calculateMessageToken(msg.content),
      0
    );
    if (totalTokens > conversation.bot.specification.context) {
      return res.status(400).json({ message: "Message exceeds token limit" });
    }
    console.log("Sending message with total token count:", totalTokens);
    console.log("Messages sent to LLM:", llmMessages);

    // Handle response based on streaming setting
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
    } else {
      return handleRegularResponse({
        res,
        conversation,
        userMessage,
        llmMessages,
        conversationId,
        bot: conversation.bot,
        session,
      });
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

// Fetch conversation messages
exports.getConversationMessages = async (req, res) => {
  try {
    console.log(
      "[FetchMessages] Fetching messages for conversation:",
      req.params.conversationId
    );
    const messages = await Message.find({
      conversation: req.params.conversationId,
    })
      .sort({ timestamp: 1 })
      .lean();
    console.log("[FetchMessages] Retrieved", messages.length, "messages.");
    res.json(messages);
  } catch (error) {
    console.error("[FetchMessages] Error fetching messages:", error);
    res.status(500).json({ message: "Error fetching messages" });
  } finally {
    console.log("[FetchMessages] Finished processing request for messages.");
  }
};
