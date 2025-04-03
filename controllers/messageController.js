//messageController.js
const Message = require("../models/message");
const User = require("../models/user");
const { Conversation } = require("../models/conversation");
const { OpenAI } = require("openai"); // Example using OpenAI
const { decrypt } = require("../utils/encryption");
const fs = require("fs");
const appContext = {
  appName: "Aiverse",
  purpose:
    "A messaging platform for interacting with AI bots like ChatGPT, Gemini, and Grok.",
  platform: "A chat-based interface simulating natural human conversation.",
  theme: "modern ai messaging application",
};

const sessionUtils = require("../utils/sessionUtils");
const encoding_for_model = require("@dqbd/tiktoken").encoding_for_model;

const calculateMessageToken = (message) => {
  const encoder = encoding_for_model("gpt-3.5-turbo");

  const tokens = encoder.encode(message);
  encoder.free();
  return tokens.length;
};

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

async function buildChatContext(conversation) {
  console.log("Starting to build chat context...");

  const { historyTokens, maxPastSessions } =
    sessionUtils.calculateTokenAllocation(conversation.bot);
  console.log(
    `Token allocation - historyTokens: ${historyTokens}, maxPastSessions: ${maxPastSessions}`
  );

  const closedSessions = conversation.sessions
    .filter((s) => !s.isActive)
    .sort((a, b) => new Date(a.endTime) - new Date(b.endTime))
    .slice(-maxPastSessions);
  console.log(`Found ${closedSessions.length} closed sessions to include`);

  // Collect all summary messages in order
  const historicalContext = closedSessions.flatMap(
    (session) => session.summary || []
  );
  console.log(
    `Collected ${historicalContext.length} historical context messages`
  );

  let tokenCount = historicalContext.reduce(
    (sum, msg) => sum + calculateMessageToken(msg.content),
    0
  );
  console.log(`Initial historical context token count: ${tokenCount}`);

  while (tokenCount > historyTokens && historicalContext.length > 0) {
    const removedMsg = historicalContext.shift();
    const removedTokens = calculateMessageToken(removedMsg.content);
    tokenCount -= removedTokens;
    console.log(
      `Removed message with ${removedTokens} tokens (new total: ${tokenCount})`
    );
  }

  // Find the current active session
  const currentSession = conversation.sessions.find((s) => s.isActive);
  console.log(
    currentSession ? "Found active session" : "No active session found"
  );

  // Get its sessionContext, default to empty array if no active session
  const currentContext = currentSession ? currentSession.sessionContext : [];
  console.log(`Current session has ${currentContext.length} context messages`);

  // Combine historical summaries and current session context
  const context = [...historicalContext, ...currentContext];
  console.log(`Final context built with ${context.length} total messages`);

  return context;
}

async function buildChatContext1(conversation, currentMessageId) {
  const context = [];
  const currentSession = conversation.sessions.find((s) => s.isActive);

  // // Add historical summaries
  // context.push(
  //   ...conversation.historicalSummaries.map((summary) => ({
  //     role: "system",
  //     content: `Previous conversation summary: ${summary}`,
  //   }))
  // );
  //we need to take recently closed 10 session excluding the current one  whihc one is active
  //from that 10 session we need to take all the message summary array in this format
  //  summary: [
  //   // For AI context
  //   {
  //     role: {
  //       type: String,
  //       enum: ["system", "user", "assistant"],
  //     },
  //     content: String,
  //   },
  // ],
  //and add it in the contexct
  //so that theold message is added ifrst or the new one whhc is preffered by the llm
  //then we need to tkae the currentsession.sessionContext and we need to append all the objectsd from it
  // ite should be in order like ad the ollder message in those 10 session sumary array
  //and the active sessoon sessionContext is contianing most recent message so the  context var should contian all of this in order
  //here i had a previouis implemntaton
  //you  have to fix it accoridn tot hte new conversation schema and sessio nshcmea

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
    defaultHeaders: {
      "HTTP-Referer": "http://aiverseapp.site/", // Optional. Site URL for rankings on openrouter.ai.
      "X-Title": "aiverse", // Optional. Site title for rankings on openrouter.ai.
    },
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
    // Create temporary bot message first
    botMessage = new Message.Text({
      conversation: conversationId,
      sender: "bot",
      textContent: "PLACEHOLDER",
      isTemporary: true,
      sessionId: session.sessionId,
    });
    await botMessage.save();

    // Add user message to conversation immediately
    await sessionUtils.addMessagesToConversation(conversation, [
      userMessage._id,
    ]);
    console.log(
      `[Streaming] Added user message ${userMessage._id} to conversation`
    );
  } catch (botMessageError) {
    console.error("[Streaming] Initial setup failed:", botMessageError);
    await userMessage.remove();
    return res.status(500).json({ message: "Failed to initialize response" });
  }

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

    let firstContentReceived = false;

    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta?.content) {
        const contentChunk = chunk.choices[0].delta.content;

        // Remove placeholder on first content
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

    console.log("Accumulated final bot response:", botMessage.textContent);
    await botMessage.save();

    // Add bot message to conversation after successful streaming
    await sessionUtils.addMessagesToConversation(conversation, [
      botMessage._id,
    ]);
    console.log(
      `[Streaming] Added bot message ${botMessage._id} to conversation`
    );
    res.write(`data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`);
  } catch (streamError) {
    console.error("[Streaming] Error:", streamError);
    // In the error handling block
    await Promise.all([
      botMessage?.deleteOne(), // Changed from remove()
      userMessage.deleteOne(), // Changed from remove()
    ]);
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
      .populate("bot") // Populate bot details
      .populate("sessions"); // Populate session documents

    if (!conversation)
      return res.status(404).json({ message: "Conversation not found" });

    // Session management - ensure active session
    const session = await sessionUtils.getOrCreateActiveSession(conversation);

    if (!session) throw new Error("Failed to get or create active session");

    // 1. Create and save user message
    const userMessage = await createUserMessage(
      conversationId,
      file,
      textContent,
      session
    );
    console.log("User Messae created :", userMessage);

    // 2. Prepare context-aware system message
    const { systemMessage, user } = await prepareSystemContext(
      userId,
      conversation
    );

    // 3. Build conversation context
    const context = await buildChatContext(conversation);
    console.log("Final context created:", context);

    // 4. Prepare LLM messages array
    const llmMessages = [
      { role: "system", content: systemMessage },
      ...context,
      { role: "user", content: userMessage.textContent },
    ];

    const totalTokens = llmMessages.reduce(
      (sum, msg) => sum + calculateMessageToken(msg.content),
      0
    );
    if (totalTokens > conversation.bot.specification.context) {
      return res.status(400).json({ message: "Message exceeds token limit" });
    }
    console.log("Sending message with total toke count:", totalTokens);
    console.log("Messsage sent to llm:", llmMessages);

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
