const conversation = require("../models/conversation");
const { v4: uuidv4 } = require("uuid");
const Message = require("../models/message");
const { OpenAI } = require("openai"); // Example using OpenAI
const { Messages } = require("openai/resources/beta/threads/messages");
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");

//some bot param
/*
  specification: {
    //input token capacity of the modle
    context: {
      type: Number,
      required: true,
    },
    //output caparcity or max toke generation
    maxOutput: {
      type: Number,
      required: true,
    },
    //  cost per m input token
    inputCost: {
      type: Number,
      default: 0,
    },
    //cost per m output token
    outputCost: {
      type: Number,
      default: 0,
    },
    latency: {
      // Changed to camelCase (recommended convention)
      type: Number,
      default: 1.36, // Fixed typo 'defalt' -> 'default'
    },
    throughput: {
      type: Number,
    },
  },
  messageTokenLimit: {
    type: Number,
    default: 10000,
  },
*/
//2 hour in ms
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000;

const calculateMessageToke = (message) => {
  const encoding = new Tiktoken(
    cl100k_base.bpe_ranks,
    cl100k_base.special_tokens,
    cl100k_base.pat_str
  );
  const tokens = encoding.encode(message);
  encoding.free();
  return tokens.length;
};

const generateLLMResponse = async (messages, maxToken) => {
  // 1. Format messages with correct role spelling and basic cleaning
  const formattedMessages = messages.map((message) => {
    return {
      role: message.sender === "bot" ? "assistant" : "user", // Fixed spelling
      content: removeMd(message.textContent)
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, "") // Remove all emojis
        .replace(/\\n/g, " ") // Convert newlines to spaces
        .replace(/\\"/g, '"') // Fix escaped quotes
        .slice(0, 300), // Clean truncation,
    };
  });

  // 3. Create strict prompt with clear examples
  const prompt = {
    role: "user",
    content: `Summarize this conversation into 3-8 key points. Follow these rules:
    - 1 user point → 1 assistant summary (paired)
    - Use "user" for original requests and "assistant" for summarized answers
    - Maximum 10 objects (5 user/assistant pairs)
    - Keep "content" under 2 sentences
    
    Example output: 
    ${JSON.stringify(
      [
        { role: "user", content: "Asked about quantum computing applications" },
        {
          role: "assistant",
          content: "Explained current uses in finance and drug discovery",
        },
      ],
      null,
      2
    )}
    
    Conversation to summarize:
    ${JSON.stringify(formattedMessages, null, 2)}`,
  };

  let openai = new OpenAI({
    apiKey:
      "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",
    baseURL: "https://openrouter.ai/api/v1",
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-v3-base:free",
      messages: [prompt],
      temperature: 0.3,
      max_tokens: maxToken,
    });

    const summary = completion.choices[0].message.content.trim();

    return summary;
  } catch (error) {
    console.error("[ERROR] Summary generation failed:", {
      error: error.message,
    });
  }
};

async function generateSummary(messages, bot) {
  const tokenAvailableForContext = bot.context - bot.messageTokenLimit;
  //we need to calculate for currentsesion summary how muich token we can allocate
  //it can be minimum a certain token thresold
  // this thresold should be able to give proper meesgae context to the bot for a certain
  //we can allocate
  // maxCurrentSessionContext=tokenAvailableForContext*.02<10000 : min(tokenAvailableForContexttokenAvailableForContext,10000)
  console.log(
    `[DEBUG] Starting summary generation for ${messages.length} messages`
  );
  // Sort messages chronologically and extract text content
  const sortedMessages = messages
    .sort((a, b) => new Date(a.timestamp.$date) - new Date(b.timestamp.$date))
    .map(
      (msg) =>
        `${msg.sender === "bot" ? "assistant" : "user"}: ${msg.textContent}`
    );

  // Prepare conversation history for the LLM
  const conversationHistory = sortedMessages.join("\n");
  console.log("Generatign summary for this message ", conversationHistory);
  let openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API,
    baseURL: "https://openrouter.ai/api/v1",
  });

  try {
    console.log(
      `[INFO] Calling OpenAI for summary (${sortedMessages.length} messages)`
    );
    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-v3-base:free",
      messages: [
        {
          role: "system",
          content: `Generate a concise third-person summary of this conversation between a user and bot. 
        Highlight main topics, questions, and solutions. Keep it under 3 sentences. 
        Use natural narrative format. Example: "The user... The bot responded..."`,
        },
        {
          role: "user",
          content: `Conversation history:\n${conversationHistory}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const summary = completion.choices[0].message.content.trim();
    console.log(
      `[INFO] Successfully generated summary (${summary.length} chars)`
    );
    return summary;
  } catch (error) {
    console.error("[ERROR] Summary generation failed:", {
      error: error.message,
      messageCount: messages.length,
      conversationLength: conversationHistory.length,
    });
    // Fallback to simple concatenation
    return `Conversation highlights: ${sortedMessages
      .slice(0, 3)
      .join("; ")}...`;
  }
}

async function getOrCreateActiveSession(conversation) {
  console.log(
    `[DEBUG] Checking active sessions for conversation ${conversation._id}`
  );
  const now = new Date();
  let activeSession = conversation.sessions.find((s) => s.isActive);

  if (activeSession) {
    const timeSinceLastActivity = now - activeSession.startTime;
    console.log(
      `[INFO] Found active session ${activeSession.sessionId} (${timeSinceLastActivity}ms since last activity)`
    );

    if (timeSinceLastActivity < SESSION_TIMEOUT) {
      console.log(
        `[DEBUG] Returning existing active session ${activeSession.sessionId}`
      );
      return activeSession;
    }
    console.log(
      `[INFO] Session ${activeSession.sessionId} expired (${timeSinceLastActivity}ms > ${SESSION_TIMEOUT}ms timeout)`
    );
    // Session expired - close it
    await closeSession(conversation, activeSession);
  }

  const generatedId = uuidv4();
  console.log("Generated sessionId:", generatedId);

  // Create new session
  const newSession = {
    sessionId: generatedId,
    messages: [],
    summary: null,
    startTime: now,
    endTime: null,
    isActive: true,
  };

  conversation.sessions.push(newSession);
  await conversation.save();
  console.log("New seassion created wiht seassion id", generatedId);
  return newSession;
}

async function closeSession(conversation, session) {
  session.isActive = false;
  session.endTime = new Date();

  // Generate summary only if there are messages
  if (session.messages.length > 0) {
    const messages = await Message.find({ _id: { $in: session.messages } });
    const bot = conversation.bot;
    session.summary = await generateSummary(messages, bot);
    console.log("Generated summary ", session.summary);
    conversation.historicalSummaries.push(session.summary);
  }

  await conversation.save();
}

async function addMessagesToConversation(conversation, messageIds) {
  console.log(
    `[DEBUG] Adding messages ${messageIds.join(", ")} to conversation ${
      conversation._id
    }`
  );

  try {
    // Get or create active session (handles expiration checks)
    const activeSession = await getOrCreateActiveSession(conversation);

    // Update conversation's messages array with all message IDs
    conversation.messages.push(...messageIds);

    // Update session's messages array with all message IDs
    activeSession.messages.push(...messageIds);

    // Update timestamps
    conversation.lastMessageTimestamp = new Date();
    conversation.lastActivity = new Date();

    // Save all changes in a single operation
    await conversation.save();

    console.log(
      `[INFO] Successfully added messages ${messageIds.join(
        ", "
      )} to conversation ${conversation._id} and session ${
        activeSession.sessionId
      }`
    );
    return conversation;
  } catch (error) {
    console.error(`[ERROR] Failed to add messages:`, error.message);
    throw new Error(`Message addition failed: ${error.message}`);
  }
}

module.exports = {
  getOrCreateActiveSession,
  addMessagesToConversation,
  closeSession,
};
