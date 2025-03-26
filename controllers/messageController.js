// //messageController.js
// const Message = require("../models/message");
// const User = require("../models/user");
// const Conversation = require("../models/conversation");
// const { OpenAI } = require("openai"); // Example using OpenAI
// const { decrypt } = require("../utils/encryption");
// const fs = require("fs");
// const appContext = JSON.parse(
//   fs.readFileSync("./context/appContext.json", "utf8")
// );

// // Helper function to format file size
// function formatSize(bytes) {
//   if (bytes === 0) return "0 B";
//   const k = 1024;
//   const sizes = ["B", "KB", "MB", "GB", "TB"];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
// }
// async function generateSummary(sessionMessages) {
//   try {
//     const messagesText = sessionMessages
//       .map((m) => `${m.sender}: ${m.textContent}`)
//       .join("\n");
//     const summary = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         {
//           role: "system",
//           content: `Summarize this conversation session in under ${bot.context.sessionSettings.maxSummaryLength} characters:`,
//         },
//         {
//           role: "user",
//           content: messagesText,
//         },
//       ],
//     });
//     return summary.choices[0].message.content;
//   } catch (error) {
//     // Fallback to last 3 messages
//     return sessionMessages
//       .slice(-3)
//       .map((m) => m.textContent)
//       .join("; ");
//   }
// }

// async function buildContext(userId, botId) {
//   const conversation = await Conversation.findOne({
//     user: userId,
//     bot: botId,
//   }).populate({
//     path: "sessions.messages",
//     match: { sessionId: { $eq: currentSessionId } },
//     options: { sort: { timestamp: 1 } },
//   });

//   return {
//     currentMessages: activeSession.messages,
//     previousSummaries: conversation.historicalSummaries.slice(-3),
//     sessionSummary: getLastSessionSummary(conversation),
//   };
// }

// exports.createMessage = async (req, res) => {
//   try {
//     const { textContent, conversationId, userId } = req.body;
//     const file = req.file;

//     // Validate input
//     if (!textContent?.trim() && !file) {
//       console.warn("[Message Handler] Validation failed: No content provided");
//       return res.status(400).json({ message: "Content or file required" });
//     }

//     //001
//     const conversation = await Conversation.findById(conversationId)
//       .populate("bot")
//       .populate({
//         path: "sessions.messages",
//         options: { sort: { timestamp: 1 } },
//       });

//     if (!conversation)
//       return res.status(404).json({ message: "Conversation not found" });

//     //002
//     // 2. Session management
//     const bot = conversation.bot;
//     const sessionTimeout = bot.context.sessionSettings.timeout * 3600000;

//     // Check for expired sessions
//     const activeSession = conversation.sessions.find((s) => s.isActive);
//     if (
//       activeSession &&
//       Date.now() - activeSession.startTime > sessionTimeout
//     ) {
//       await closeSession(conversation, activeSession);
//     }

//     // Create new session if needed
//     if (!conversation.sessions.some((s) => s.isActive)) {
//       conversation.sessions.push({
//         sessionId: uuidv4(),
//         startTime: new Date(),
//         isActive: true,
//       });
//       await conversation.save();
//     }

//     //003
//     // 3. Get current session
//     const currentSession = conversation.sessions.find((s) => s.isActive);

//     // 4. Create user message with session ID
//     let userMessage;
//     try {
//       if (file) {
//         const isImage = file.mimetype.startsWith("image/");
//         const finalTextContent = textContent?.trim() || "Explain the file";

//         if (isImage) {
//           userMessage = new Message.Image({
//             conversation: conversationId,
//             sender: "user",
//             textContent: finalTextContent,
//             images: [
//               { url: `/uploads/${file.filename}`, name: file.originalname },
//             ],
//           });
//         } else {
//           userMessage = new Message.File({
//             conversation: conversationId,
//             sender: "user",
//             textContent: finalTextContent,
//             file: {
//               url: `/uploads/${file.filename}`,
//               name: file.originalname,
//               size: formatSize(file.size),
//             },
//           });
//         }
//       } else {
//         userMessage = new Message.Text({
//           conversation: conversationId,
//           sender: "user",
//           textContent: textContent.trim(),
//         });
//       }
//       userMessage.sessionId = currentSession.sessionId;
//       await userMessage.save();
//     } catch (dbError) {
//       console.error("[Message Handler] Message creation failed:", dbError);
//       return res.status(500).json({ message: "Failed to create message" });
//     }

//     // 5. Build context-aware system message
//     const context = await buildConversationContext(conversation, currentSession, userId);

//     const systemMessage = `
//     ${bot.context.systemMessage}

//     ### Session Context
//     ${context.previousSummaries.length > 0
//       ? `Previous conversations:\n- ${context.previousSummaries.join("\n- ")}`
//       : "No previous conversations"}

//     ### Current Session
//     ${context.currentMessages.slice(-5).map(m => `${m.sender}: ${m.textContent}`).join("\n")}

//     ### User Profile
//     Name: ${context.user.displayName || context.user.username}
//     Interests: ${context.user.preferences.join(", ") || "None"}
//     `;

//     // 6. Get historical messages for context
//     const chatHistory = conversation.sessions.flatMap(s =>
//       s.messages.slice(-3).map(m => ({
//         role: m.sender === "user" ? "user" : "assistant",
//         content: m.textContent
//       }))
//     );

//     // 3. Initialize OpenAI
//     let openai;
//     try {
//       openai = new OpenAI({
//         apiKey: decrypt(bot.apiKey),
//         baseURL: bot.endpoint,
//       });
//     } catch (decryptError) {
//       console.error("[OpenAI] Decryption failed:", decryptError);
//       await userMessage.remove();
//       return res.status(500).json({ message: "API configuration error" });
//     }
//     // console.log("userID");

//     // console.log(userId);
//     // const user = await User.findById(userId);

//     // // *** New: Construct the system message with app context ***
//     // const name = user.displayName || user.username;
//     // const userPreferences =
//     //   user.preferences.length > 0 ? user.preferences.join(", ") : null;

//     // const systemMessage = `
//     // You are in [App: ${appContext.appName}] (Theme: ${appContext.theme}).
//     // Current User: ${name} (Interests: ${userPreferences || "general topics"}).

//     // ### Bot Configuration
//     // Personality: ${bot.context?.personality || "friendly"}
//     // Knowledge Scope: ${
//     //   bot.context?.knowledgeScope?.join(", ") || "general topics"
//     // }
//     // ${
//     //   bot.context?.restrictions?.length
//     //     ? `Restrictions: NEVER discuss ${bot.context.restrictions.join(", ")}\n`
//     //     : ""
//     // }
//     // ${bot.context?.systemMessage || "Default: Helpful assistant."}
//     // `.trim();

//     // console.log("[system Message]:");
//     // console.log(systemMessage);

//     // 4. Handle streaming response
//     if (bot.streamingEnabled) {
//       res.setHeader("Content-Type", "text/event-stream");
//       res.setHeader("Cache-Control", "no-cache");
//       res.setHeader("Connection", "keep-alive");

//       let botMessage;
//       try {
//         botMessage = new Message.Text({
//           conversation: conversationId,
//           sender: "bot",
//           textContent: "PLACEHOLDER",
//           isTemporary: true,
//         });
//         await botMessage.save();
//       } catch (botMessageError) {
//         console.error(
//           "[Streaming] Bot message creation failed:",
//           botMessageError
//         );
//         await userMessage.remove();
//         return res
//           .status(500)
//           .json({ message: "Failed to initialize response" });
//       }

//       await Conversation.findByIdAndUpdate(conversationId, {
//         $push: { messages: { $each: [userMessage._id, botMessage._id] } },
//         $set: { lastMessageTimestamp: new Date() },
//       });

//       res.write(
//         `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
//       );

//       try {
//         const stream = await openai.chat.completions.create({
//           model: bot.model,
//           messages: [
//             { role: "system", content: systemMessage },
//             { role: "user", content: textContent },
//           ],
//           stream: true,
//         });

//         for await (const chunk of stream) {
//           if (chunk.choices?.[0]?.delta?.content) {
//             const contentChunk = chunk.choices[0].delta.content;
//             botMessage.textContent += contentChunk;
//             await botMessage.save();
//             res.write(
//               `data: ${JSON.stringify({
//                 type: "chunk",
//                 content: contentChunk,
//               })}\n\n`
//             );
//           }
//         }

//         botMessage.isTemporary = false;
//         botMessage.textContent = botMessage.textContent.replace(
//           /^PLACEHOLDER\s*/,
//           ""
//         );
//         await botMessage.save();
//         res.write(
//           `data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`
//         );
//       } catch (streamError) {
//         console.error("[Streaming] Error:", streamError);
//         await Promise.all([botMessage?.remove(), userMessage.remove()]);
//         res.write(
//           `data: ${JSON.stringify({
//             type: "error",
//             message: "Error generating response",
//           })}\n\n`
//         );
//       } finally {
//         res.end();
//       }
//     } else {
//       try {
//         const completion = await openai.chat.completions.create({
//           messages: [
//             {
//               role: "system",
//               content: bot.context || "You are a helpful assistant.",
//             },
//             { role: "user", content: textContent },
//           ],
//           model: bot.model,
//         });

//         const botMessage = new Message.Text({
//           conversation: conversationId,
//           sender: "bot",
//           textContent: completion.choices[0].message.content,
//         });

//         await botMessage.save();
//         await Conversation.findByIdAndUpdate(conversationId, {
//           $push: { messages: { $each: [userMessage._id, botMessage._id] } },
//           $set: { lastMessageTimestamp: new Date() },
//         });

//         res.json({
//           userMessage: userMessage.toObject(),
//           botMessage: botMessage.toObject(),
//         });
//       } catch (apiError) {
//         console.error("[Response] API error:", apiError);
//         await userMessage.remove();
//         res.status(500).json({ message: "Error generating response" });
//       }
//     }
//   } catch (error) {
//     console.error("[CreateMessage] Unexpected error:", error);

//     if (res.headersSent) {
//       res.write(
//         `data: ${JSON.stringify({
//           type: "error",
//           message: "Processing error",
//         })}\n\n`
//       );
//       res.end();
//     } else {
//       res.status(500).json({ message: "Error sending message" });
//     }
//   }
// };

// exports.getConversationMessages = async (req, res) => {
//   try {
//     console.log(
//       "[FetchMessages] Fetching messages for conversation:",
//       req.params.conversationId
//     );

//     const messages = await Message.find({
//       conversation: req.params.conversationId,
//     }).sort({ timestamp: 1 });

//     console.log("[FetchMessages] Retrieved", messages.length, "messages.");
//     res.json(messages);
//   } catch (error) {
//     console.error("[FetchMessages] Error fetching messages:", error);
//     res.status(500).json({ message: "Error fetching messages" });
//   } finally {
//     console.log("[FetchMessages] Finished processing request for messages.");
//   }
// };

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
async function createUserMessage(conversationId, file, textContent) {
  let userMessage;

  // if (file) {
  //   const isImage = file.mimetype.startsWith("image/");
  //   const finalTextContent = textContent?.trim() || "Explain the file";

  //   userMessage = isImage
  //     ? new Message.Image(
  //         createFileMessage(conversationId, finalTextContent, file)
  //       )
  //     : new Message.File(
  //         createFileMessage(conversationId, finalTextContent, file)
  //       );
  // } else {
  //   userMessage = new Message.Text({
  //     conversation: conversationId,
  //     sender: "user",
  //     textContent: textContent.trim(),
  //   });
  // }

  // await userMessage.save();
  // return userMessage;
  if (file) {
    const isImage = file.mimetype.startsWith("image/");
    const finalTextContent = textContent?.trim() || "Explain the file";

    if (isImage) {
      userMessage = new Message.Image({
        conversation: conversationId,
        sender: "user",
        textContent: finalTextContent,
        images: [{ url: `/uploads/${file.filename}`, name: file.originalname }],
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
    });
    await botMessage.save();
  } catch (botMessageError) {
    console.error("[Streaming] Bot message creation failed:", botMessageError);
    await userMessage.remove();
    return res.status(500).json({ message: "Failed to initialize response" });
  }

  await conversation.findByIdAndUpdate(conversationId, {
    $push: { messages: { $each: [userMessage._id, botMessage._id] } },
    $set: { lastMessageTimestamp: new Date() },
  });

  res.write(
    `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
  );

  try {
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
  bot
) {
  try {
    const completion = await openai.chat.completions.create({
      messages: llmMessages,
      model: bot.model,
    });

    const botMessage = new Message.Text({
      conversation: conversationId,
      sender: "bot",
      textContent: completion.choices[0].message.content,
    });

    await botMessage.save();
    await conversation.findByIdAndUpdate(conversationId, {
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

exports.createMessage = async (req, res) => {
  try {
    const { textContent, conversationId, userId } = req.body;
    const file = req.file;

    // Validate input
    if (!textContent?.trim() && !file) {
      console.warn("[Message Handler] Validation failed: No content provided");
      return res.status(400).json({ message: "Content or file required" });
    }

    //001
    const conversation = await Conversation.findById(conversationId)
      .populate("bot")
      .populate({
        path: "sessions.messages",
        options: { sort: { timestamp: 1 } },
      });

    if (!conversation)
      return res.status(404).json({ message: "Conversation not found" });

    // Session management - ensure active session
    const session = await sessionUtils.getOrCreateActiveSession(conversation);

    // 1. Create and save user message
    const userMessage = await createUserMessage(
      conversationId,
      file,
      textContent
    );

    // Add user message to session immediately
    await sessionUtils.addMessageToConversation(conversation, userMessage._id);

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
      });
    }

    // Handle non-streaming response
    return handleRegularResponse({
      res,
      conversation,
      userMessage,
      llmMessages,
      bot: conversation.bot,
    });

    // // 2. Fetch conversation and bot configuration
    // const conversation = await Conversation.findById(conversationId).populate(
    //   "bot"
    // );
    // if (!conversation) {
    //   console.error("[Message Handler] Conversation not found - rolling back");
    //   await userMessage.remove();
    //   return res.status(404).json({ message: "Conversation not found" });
    // }

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

    // console.log(userId);
    // const user = await User.findById(userId);

    // *** New: Construct the system message with app context ***
    // const name = user.displayName || user.username;
    // const userPreferences =
    //   user.preferences.length > 0 ? user.preferences.join(", ") : null;
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
    // const systemMessage = `
    // You are in [App: ${appContext.appName}] (Theme: ${appContext.theme}).
    // Current User: ${name} (Interests: ${userPreferences || "general topics"}).

    // ### Bot Configuration
    // Personality: ${bot.context?.personality || "friendly"}
    // Knowledge Scope: ${
    //   bot.context?.knowledgeScope?.join(", ") || "general topics"
    // }
    // ${
    //   bot.context?.restrictions?.length
    //     ? `Restrictions: NEVER discuss ${bot.context.restrictions.join(", ")}\n`
    //     : ""
    // }
    // ${bot.context?.systemMessage || "Default: Helpful assistant."}
    // `.trim();

    // console.log("[system Message]:");
    // console.log(systemMessage);

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
