const conversation = require("../models/conversation");
const { v4: uuidv4 } = require("uuid");

//2 hour in ms
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000;

async function generateSummary(messages) {
  console.log(
    `[DEBUG] Starting summary generation for ${messages.length} messages`
  );
  // Sort messages chronologically and extract text content
  const sortedMessages = messages
    .sort((a, b) => new Date(a.timestamp.$date) - new Date(b.timestamp.$date))
    .map((msg) => `${msg.sender}: ${msg.textContent}`);

  // Prepare conversation history for the LLM
  const conversationHistory = sortedMessages.join("\n");

  let openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API,
    baseURL: "https://openrouter.ai/api/v1",
  });

  try {
    console.log(
      `[INFO] Calling OpenAI for summary (${sortedMessages.length} messages)`
    );
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
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
  console.log(
    `[INFO] Closing session ${session.sessionId} for conversation ${conversation._id}`
  );
  session.isActive = false;
  session.endTime = new Date();

  // Generate summary only if there are messages
  if (session.messages.length > 0) {
    console.log(
      `[DEBUG] Processing ${session.messages.length} messages for summary`
    );
    const messages = await Message.find({ _id: { $in: session.messages } });
    session.summary = await generateSummary(messages);
    console.log(
      `[INFO] Generated session summary: ${session.summary.substring(0, 50)}...`
    );
    conversation.historicalSummaries.push(session.summary);
  }

  try {
    console.log(
      `[DEBUG] Saving closed session for conversation ${conversation._id}`
    );
    await conversation.save();
    console.log(`[INFO] Successfully closed session ${session.sessionId}`);
  } catch (saveError) {
    console.error(
      `[ERROR] Failed to save closed session: ${saveError.message}`,
      {
        conversationId: conversation._id,
        sessionId: session.sessionId,
      }
    );
    throw saveError;
  }
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
