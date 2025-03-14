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

    console.log("[Message Handler] Received request:", {
      textContent,
      conversationId,
      tempUserMessageId,
      tempBotMessageId,
      hasFile: !!file,
    });

    // Validate input
    if (!textContent?.trim() && !file) {
      console.warn(
        "[Message Handler] Validation failed: No text content or file provided."
      );
      return res
        .status(400)
        .json({ message: "Either text content or a file is required" });
    }

    // 1. Create user message
    let userMessage;
    try {
      console.log("[Message Handler] Creating user message...");

      if (file) {
        const isImage = file.mimetype.startsWith("image/");
        const finalTextContent =
          textContent?.trim() || "Explain the image or file";

        console.log(
          `[Message Handler] File detected: ${file.originalname} (Size: ${file.size} bytes, Type: ${file.mimetype})`
        );

        if (isImage) {
          console.log("[Message Handler] Processing image upload...");
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
          console.log("[Message Handler] Processing non-image file upload...");
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
        console.log("[Message Handler] Creating a text-only message...");
        userMessage = new Message.Text({
          conversation: conversationId,
          sender: "user",
          textContent: textContent.trim(),
        });
      }

      await userMessage.save();
      console.log(
        "[Message Handler] User message saved successfully:",
        userMessage._id
      );
    } catch (dbError) {
      console.error("[Message Handler] Message creation failed:", dbError);
      return res.status(500).json({ message: "Failed to create message" });
    }

    // 2. Fetch conversation and bot configuration
    console.log(
      "[Message Handler] Fetching conversation and bot configuration..."
    );
    const conversation = await Conversation.findById(conversationId).populate(
      "bot"
    );

    if (!conversation) {
      console.error(
        "[Message Handler] Conversation not found. Removing created message..."
      );
      await userMessage.remove();
      return res.status(404).json({ message: "Conversation not found" });
    }

    const bot = conversation.bot;
    console.log(
      `[Message Handler] Conversation found with bot: ${bot.name} (ID: ${bot._id})`
    );

    // 3. Initialize OpenAI with error handling for decryption
    console.log("[OpenAI] Initializing API client...");
    let openai;
    try {
      openai = new OpenAI({
        apiKey: decrypt(bot.apiKey),
        baseURL: bot.endpoint,
      });
      console.log("[OpenAI] API client initialized successfully.");
    } catch (decryptError) {
      console.error("[OpenAI] Decryption failed:", decryptError);
      await userMessage.remove();
      return res.status(500).json({ message: "API configuration error" });
    }

    // 4. Handle streaming response
    if (bot.streamingEnabled) {
      console.log("[Streaming] Streaming is enabled. Preparing response...");
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      let botMessage;

      try {
        console.log("[Streaming] Creating initial bot message...");
        // Create initial bot message
        botMessage = new Message.Text({
          conversation: conversationId,
          sender: "bot",
          textContent: "PLACEHOLDER", // or any placeholder text

          isTemporary: true,
        });
        await botMessage.save();
        console.log("[Streaming] Bot message created with ID:", botMessage._id);
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

      // console.log("[Streaming] Updating conversation with new messages...");
      // // Update conversation after both messages are successfully created
      // await Conversation.findByIdAndUpdate(conversationId, {
      //   $push: { messages: { $each: [userMessage._id, botMessage._id] } },
      //   $set: { lastMessageTimestamp: new Date() },
      // });
      // console.log("[Streaming] Conversation updated successfully.");

      // Send the initial event with both messages
      res.write(
        `data: ${JSON.stringify({ type: "init", userMessage, botMessage })}\n\n`
      );
      console.log("[Streaming] Sent initialization event.");

      // Immediately update the conversation so that the frontend sees the new messages
      await Conversation.findByIdAndUpdate(conversationId, {
        $push: { messages: { $each: [userMessage._id, botMessage._id] } },
        $set: { lastMessageTimestamp: new Date() },
      });
      console.log("[Streaming] Conversation updated with new messages.");

      const stream = await openai.chat.completions.create({
        model: bot.model,
        messages: [
          {
            role: "system",
            content: bot.context || "You are a helpful assistant.",
          },
          { role: "user", content: textContent },
        ],
        stream: true,
      });

      // for await (const chunk of stream) {
      //   console.log(chunk);
      //   console.log(chunk.choices[0].delta);
      //   console.log("****************");
      // }
      // Process each streaming chunk
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

      // Finalize the bot message once streaming is complete
      botMessage.isTemporary = false;
      botMessage.textContent = botMessage.textContent.replace(
        /^PLACEHOLDER\s*/,
        ""
      );
      await botMessage.save();
      res.write(
        `data: ${JSON.stringify({ type: "complete", botMessage })}\n\n`
      );
      res.end();

      console.log("[Streaming] Bot message saved and response completed.");

      // console.log("[Streaming] Streaming is enabled. Preparing response...");
      // res.setHeader("Content-Type", "text/event-stream");
      // res.setHeader("Cache-Control", "no-cache");
      // res.setHeader("Connection", "keep-alive");
      // let botMessage;
      // try {
      //   console.log("[Streaming] Creating initial bot message...");
      //   // Create initial bot message
      //   botMessage = new Message.Text({
      //     conversation: conversationId,
      //     sender: "bot",
      //     textContent: "",
      //   });
      //   await botMessage.save();
      //   console.log("[Streaming] Bot message created with ID:", botMessage._id);
      // } catch (botMessageError) {
      //   console.error(
      //     "[Streaming] Bot message creation failed:",
      //     botMessageError
      //   );
      //   await userMessage.remove();
      //   return res
      //     .status(500)
      //     .json({ message: "Failed to initialize response" });
      // }
      // try {
      //   console.log("[Streaming] Updating conversation with new messages...");
      //   // Update conversation after both messages are successfully created
      //   await Conversation.findByIdAndUpdate(conversationId, {
      //     $push: { messages: { $each: [userMessage._id, botMessage._id] } },
      //     $set: { lastMessageTimestamp: new Date() },
      //   });
      //   console.log("[Streaming] Conversation updated successfully.");
      //   // Send initialization event
      //   res.write(
      //     `data: ${JSON.stringify({
      //       type: "init",
      //       tempUserMessageId,
      //       userMessage: userMessage.toObject(),
      //       tempBotMessageId,
      //       botMessage: botMessage.toObject(),
      //     })}\n\n`
      //   );
      //   console.log(
      //     "[Streaming] Sent initialization event. Starting OpenAI response streaming..."
      //   );
      //   // Stream OpenAI response
      //   const stream = await openai.chat.completions.create({
      //     messages: [
      //       {
      //         role: "system",
      //         content: bot.context || "You are a helpful assistant.",
      //       },
      //       { role: "user", content: finalTextContent },
      //     ],
      //     model: bot.model,
      //     stream: true,
      //   });
      //   let fullContent = "";
      //   for await (const chunk of stream) {
      //     const content = chunk.choices[0]?.delta?.content || "";
      //     if (content) {
      //       fullContent += content;
      //       console.log(
      //         `[Streaming] Received chunk: ${content.length} characters`
      //       );
      //       res.write(
      //         `data: ${JSON.stringify({
      //           type: "chunk",
      //           botMessageId: botMessage._id.toString(),
      //           content: content,
      //         })}\n\n`
      //       );
      //     }
      //   }
      //   console.log(
      //     "[Streaming] OpenAI response complete. Updating final bot message..."
      //   );
      //   // Update final bot message
      //   botMessage.textContent = fullContent;
      //   await botMessage.save();
      //   console.log("[Streaming] Bot message updated successfully.");
      //   // Send completion event
      //   res.write(
      //     `data: ${JSON.stringify({
      //       type: "complete",
      //       botMessage: botMessage.toObject(),
      //     })}\n\n`
      //   );
      //   console.log("[Streaming] Sent completion event. Streaming finished.");
      // } catch (streamError) {
      //   console.error(
      //     "[Streaming] Error occurred while streaming response:",
      //     streamError
      //   );
      //   console.log("[Streaming] Cleaning up failed messages...");
      //   // Clean up failed messages
      //   await Promise.all([botMessage?.remove(), userMessage.remove()]);
      //   console.log("[Streaming] Sending error response to client...");
      //   res.write(
      //     `data: ${JSON.stringify({
      //       type: "error",
      //       message: "Error generating response",
      //     })}\n\n`
      //   );
      // } finally {
      //   console.log("[Streaming] Closing response stream.");
      //   res.end();
      // }
    } else {
      console.log(
        "[Response] Streaming is disabled. Using non-streaming response method..."
      );
      try {
        console.log("[Response] Sending request to OpenAI...");
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

        console.log("[Response] Received OpenAI response.");

        const botContent = completion.choices[0].message.content;
        console.log(
          "[Response] Bot response content length:",
          botContent.length
        );

        const botMessage = new Message.Text({
          conversation: conversationId,
          sender: "bot",
          textContent: botContent,
        });

        console.log("[Response] Saving bot message...");
        await botMessage.save();

        console.log("[Response] Updating conversation with new messages...");
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: { messages: { $each: [userMessage._id, botMessage._id] } },
          $set: { lastMessageTimestamp: new Date() },
        });

        console.log("[Response] Sending final response to client.");
        res.json({
          userMessage: userMessage.toObject(),
          botMessage: botMessage.toObject(),
        });
      } catch (apiError) {
        console.error("[Response] API request failed:", apiError);

        console.log("[Response] Removing user message due to error...");
        await userMessage.remove();

        console.log("[Response] Sending error response to client.");
        res.status(500).json({ message: "Error generating response" });
      }
    }
  } catch (error) {
    console.error("[CreateMessage] Error occurred:", error);

    if (res.headersSent) {
      console.log(
        "[CreateMessage] Headers already sent. Sending error via SSE..."
      );
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Error processing message",
        })}\n\n`
      );
      console.log("[CreateMessage] Closing SSE connection.");
      res.end();
    } else {
      console.log("[CreateMessage] Sending error response as JSON...");
      res.status(500).json({ message: "Error sending message" });
    }
  } finally {
    console.log(
      "[CreateMessage] Execution completed. Cleaning up if necessary."
    );
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
