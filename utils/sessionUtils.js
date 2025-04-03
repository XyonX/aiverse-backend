const { Conversation, Session } = require("../models/conversation");
const { v4: uuidv4 } = require("uuid");
const Message = require("../models/message");
const { OpenAI } = require("openai"); // Example using OpenAI
const { Messages } = require("openai/resources/beta/threads/messages");
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");
const removeMd = require("remove-markdown");

//2 hour in ms
const SESSION_TIMEOUT = 6 * 60 * 60 * 1000;

const calculateMessageToken = (message) => {
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
  // const prompt = {
  //   role: "user",
  //   content: `Summarize this conversation into 3-8 key points. Follow these rules:
  //   - 1 user point → 1 assistant summary (paired)
  //   - Use "user" for original requests and "assistant" for summarized answers
  //   - Maximum 10 objects (5 user/assistant pairs)
  //   - Keep "content" under 2 sentences
  //   - Stay within ${maxToken} tokens total

  //   Example output:
  //   ${JSON.stringify(
  //     [
  //       { role: "user", content: "Asked about quantum computing applications" },
  //       {
  //         role: "assistant",
  //         content: "Explained current uses in finance and drug discovery",
  //       },
  //     ],
  //     null,
  //     2
  //   )}

  //   Conversation to summarize:
  //   ${JSON.stringify(messages, null, 2)}`,
  // };
  const prompt = {
    role: "user",
    content: `ONLY output a JSON array with conversation summary. STRICTLY follow:
    - Start with [ and end with ]
    - No text/comments outside the array
    - 1 user point → 1 assistant summary (paired)
    - Use "user"/"assistant" roles
    - Max 10 objects (5 pairs)
    - Keep content under 2 sentences
    - Stay within ${maxToken} tokens
  
    Example output ONLY: 
    [
      {"role": "user", "content": "Topic question"},
      {"role": "assistant", "content": "Summary response"}
    ]
  
    Conversation to summarize:
    ${JSON.stringify(messages, null, 2)}
  
    REMINDERS:
    - Your response must be ONLY valid JSON starting with [ 
    - No extra text before/after the array
    - Never use markdown or code blocks
    - Never explain your response`,
  };

  let openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API,
    baseURL: "https://openrouter.ai/api/v1",
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat-v3-0324:free",
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

async function generateSummary(messages, maxToken) {
  console.log("max token receiverd", maxToken);
  const summaryString = await generateLLMResponse(messages, maxToken);
  console.log("generated summary", summaryString);
  //converting into array for storing in the db
  const result = JSON.parse(summaryString);
  return result;
}
function calculateTokenAllocation(bot) {
  const maxContext = bot.specification.context;
  const messageTokenLimit = bot.messageTokenLimit;
  const remainingTokens = maxContext - messageTokenLimit;

  // Default percentages
  let sessionPercent = 0.6;
  let historyPercent = 0.4;

  // Minimum thresholds (adjust based on your needs)
  const MIN_SESSION_TOKENS = 10000; // Minimum 10k for session context
  const MIN_HISTORY_TOKENS = 2000; // Minimum 2k for historical context
  const MIN_SUMMARY_TOKENS = 500; // Minimum for a summary
  const MAX_SUMMARY_TOKENS = 4000; // Maximum for a summary (per your example)

  // Calculate allocations
  let sessionTokens = Math.floor(remainingTokens * sessionPercent);
  let historyTokens = Math.floor(remainingTokens * historyPercent);

  // Enforce minimum thresholds
  if (sessionTokens < MIN_SESSION_TOKENS) {
    sessionTokens = MIN_SESSION_TOKENS;
    historyTokens = Math.max(
      remainingTokens - sessionTokens,
      MIN_HISTORY_TOKENS
    );
  }

  // Ensure we don’t exceed remaining tokens
  if (sessionTokens + historyTokens > remainingTokens) {
    const excess = sessionTokens + historyTokens - remainingTokens;
    historyTokens = Math.max(historyTokens - excess, MIN_HISTORY_TOKENS);
  }

  // Calculate summary token length (30% of sessionTokens)
  let summarizeTokenLength = Math.floor(sessionTokens * 0.2);
  // Enforce min and max for summary token length
  summarizeTokenLength = Math.max(
    MIN_SUMMARY_TOKENS,
    Math.min(summarizeTokenLength, MAX_SUMMARY_TOKENS)
  );

  // Calculate how many past sessions can fit in historyTokens
  const maxPastSessions = Math.floor(historyTokens / summarizeTokenLength);

  return {
    sessionTokens, // Tokens for current session context
    historyTokens, // Tokens for historical summaries
    messageTokenLimit, // Reserved tokens (e.g., for current message)
    summarizeTokenLength, // Max tokens per summary (exported as requested)
    maxPastSessions, // Number of past sessions that can be included
  };
}

async function getOrCreateActiveSession(conversation) {
  const bot = conversation.bot;
  const { sessionTokens, historyTokens, messageTokenLimit } =
    calculateTokenAllocation(bot);

  console.log(
    `[DEBUG] Checking active sessions for conversation ${conversation._id}`
  );
  const now = new Date();
  // let activeSession = conversation.sessions.find((s) => s.isActive);
  const activeSession = await Session.findOne({
    conversation: conversation._id,
    isActive: true,
  }).exec();

  if (activeSession) {
    const timeSinceLastActivity = now - activeSession.startTime;
    console.log(
      `[INFO] Found active session ${activeSession.sessionId} (${timeSinceLastActivity}ms since last activity)`
    );

    if (
      timeSinceLastActivity < SESSION_TIMEOUT &&
      activeSession.tokenCount < sessionTokens
    ) {
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
  const newSession = new Session({
    sessionId: uuidv4(),
    conversation: conversation._id,
    startTime: now,
    isActive: true,
    tokenCount: 0,
  });

  await newSession.save();
  conversation.activeSession = newSession._id;
  conversation.sessions.push(newSession._id);
  await conversation.save();
  console.log("New seassion created wiht seassion id", generatedId);
  return newSession;
}

async function closeSession(conversation, session) {
  session.isActive = false;
  session.endTime = new Date();
  if (session.sessionContext.length > 0) {
    const { summarizeTokenLength } = calculateTokenAllocation(conversation.bot);
    session.summary = await generateSummary(
      session.sessionContext,
      summarizeTokenLength
    );
    console.log(
      `Summargy geenrated for  ${session.sessionContext.length} seassion messages at ${summarizeTokenLength} token limit `
    );
  }
  await session.save();
}

// async function addMessagesToConversation(conversation, messageIds) {
//   // console.log(
//   //   `[DEBUG] Adding messages ${messageIds.join(", ")} to conversation ${
//   //     conversation._id
//   //   }`
//   // );
//   // try {
//   //   // Get or create active session (handles expiration checks)
//   //   const activeSession = await getOrCreateActiveSession(conversation);
//   //   const { sessionTokens } = calculateTokenAllocation(conversation.bot);
//   //   let tokenCount = activeSession.tokenCount;
//   //   const messages = await Message.find({ _id: { $in: messageIds } }).exec();
//   //   const formattedMessages = messages.map((message) => {
//   //     const cleanMessage = removeMd(message.textContent);
//   //     const messageToken = calculateMessageToken(cleanMessage);
//   //     tokenCount = tokenCount + messageToken;
//   //     return {
//   //       role: message.sender === "bot" ? "assistant" : "user", // Fixed spelling
//   //       content: cleanMessage
//   //         .replace(/[\u{1F600}-\u{1F6FF}]/gu, "") // Remove all emojis
//   //         .replace(/\\n/g, " ") // Convert newlines to spaces
//   //         .replace(/\\"/g, '"') // Fix escaped quotes
//   //         .slice(0, 300), // Clean truncation,
//   //     };
//   //   });
//   //   activeSession.tokenCount = tokenCount;
//   //   // Update session's messages array with all message IDs
//   //   activeSession.sessionContext.push(...formattedMessages);
//   //   // Update timestamps
//   //   conversation.lastMessageTimestamp = new Date();
//   //   conversation.lastActivity = new Date();
//   //   // Save all changes in a single operation
//   //   await conversation.save();
//   //   console.log(
//   //     `[INFO] Successfully added messages ${messageIds.join(
//   //       ", "
//   //     )} to conversation ${conversation._id} and session ${
//   //       activeSession.sessionId
//   //     }`
//   //   );
//   //   return conversation;
//   // } catch (error) {
//   //   console.error(`[ERROR] Failed to add messages:`, error.message);
//   //   throw new Error(`Message addition failed: ${error.message}`);
//   // }
// }
async function addMessagesToConversation(conversation, messageIds) {
  console.log(
    `[addMessagesToConversation] Starting process for conversation ${conversation._id} with ${messageIds.length} message(s)`
  );
  console.debug(`Message IDs: ${JSON.stringify(messageIds)}`);

  try {
    // Session management
    console.log(
      `[Session] Getting or creating active session for conversation ${conversation._id}`
    );
    const activeSession = await getOrCreateActiveSession(
      conversation,
      conversation.bot
    );
    console.log(
      `[Session] Active session ${activeSession._id} found with ${activeSession.tokenCount} tokens`
    );

    const { sessionTokens } = calculateTokenAllocation(conversation.bot);
    console.log(`[Token] Session token limit: ${sessionTokens}`);
    let tokenCount = activeSession.tokenCount;
    console.log(`[Token] Current token count: ${tokenCount}`);

    // Fetch messages
    console.log(
      `[Message] Fetching ${messageIds.length} messages from database`
    );
    const messages = await Message.find({ _id: { $in: messageIds } }).exec();
    console.log(`[Message] Retrieved ${messages.length} messages`);

    // Process each message
    for (const [index, message] of messages.entries()) {
      console.log(
        `[Processing] Message ${index + 1}/${messages.length} (ID: ${
          message._id
        })`
      );

      // Clean message content
      const cleanMessage = message.textContent
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
        .replace(/\\n/g, " ")
        .replace(/\\"/g, '"');
      console.debug(
        `[Content] Original: ${message.textContent.substring(
          0,
          50
        )}... | Cleaned: ${cleanMessage.substring(0, 50)}...`
      );

      // Token calculation
      const messageToken = calculateMessageToken(cleanMessage);
      console.log(
        `[Token] Message tokens: ${messageToken} | Current total: ${tokenCount}`
      );

      // Session token management
      if (tokenCount + messageToken > sessionTokens) {
        console.log(
          `[Token] Exceeding limit (${
            tokenCount + messageToken
          } > ${sessionTokens}). Creating new session.`
        );
        await closeSession(conversation, activeSession);
        const newSession = await getOrCreateActiveSession(
          conversation,
          conversation.bot
        );
        console.log(`[Session] New session created: ${newSession._id}`);

        activeSession.sessionContext = [];
        activeSession.tokenCount = 0;
        tokenCount = 0;
        console.log(`[Token] Token count reset to 0`);
      }

      // Add message to context
      const role = message.sender === "bot" ? "assistant" : "user";
      activeSession.sessionContext.push({ role, content: cleanMessage });
      tokenCount += messageToken;
      console.log(
        `[Context] Added message as ${role} | New token count: ${tokenCount}`
      );
    }

    // Final updates
    activeSession.tokenCount = tokenCount;
    conversation.messages.push(...messageIds);
    conversation.lastMessageTimestamp = new Date();
    conversation.lastActivity = new Date();

    console.log(`[Save] Saving session and conversation updates`);
    await activeSession.save();
    await conversation.save();

    console.log(
      `[Success] Added ${messages.length} messages to conversation ${conversation._id}`
    );
    return conversation;
  } catch (error) {
    console.error(
      `[Error] Failed to add messages to conversation ${conversation._id}:`,
      error
    );
    throw error; // Re-throw to allow handling by caller
  }
}

module.exports = {
  getOrCreateActiveSession,
  addMessagesToConversation,
  closeSession,
  calculateTokenAllocation,
  calculateMessageToken,
};
