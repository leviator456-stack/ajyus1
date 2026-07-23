import {
  generateChatReplyStream
} from "../services/chat.service.js";

function sendStreamEvent(res, event) {
  if (res.destroyed || res.writableEnded) {
    return;
  }

  res.write(`${JSON.stringify(event)}\n`);

  // Immediately push the chunk when compression middleware supports flush
  if (typeof res.flush === "function") {
    res.flush();
  }
}

export async function chatController(req, res) {
  let streamingStarted = false;
  let clientDisconnected = false;

  req.on("aborted", () => {
    clientDisconnected = true;
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
    }
  });

  try {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    const uploadedFiles =
      Array.isArray(req.files)
        ? req.files
        : [];

    if (!message && uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "Please enter a prompt or upload a file."
      });
    }

    const selectedPlan =
      req.selectedPlan;

    const subscription =
      req.subscription;

    if (!selectedPlan || !subscription) {
      return res.status(403).json({
        success: false,
        error:
          "An active subscription is required.",
        redirectTo: "subscription.html"
      });
    }

    const selectedPlanName =
      selectedPlan.name;

    const finalMessage =
      message ||
      "Please analyze the attached file and explain its contents.";

    /*
     * NDJSON streaming headers
     * Every response event will be one JSON object per line.
     */
    res.status(200);

    res.setHeader(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    streamingStarted = true;

    sendStreamEvent(res, {
      type: "start",
      success: true,
      plan: selectedPlanName,
      planId: selectedPlan.id
    });

    const completeReply =
      await generateChatReplyStream(
        finalMessage,
        selectedPlanName,
        uploadedFiles,

        async (textChunk) => {
          if (clientDisconnected) {
            return;
          }

          sendStreamEvent(res, {
            type: "chunk",
            text: textChunk
          });
        }
      );

    if (clientDisconnected) {
      return;
    }

    /*
     * Increase usage only after the complete
     * AI response has been generated successfully.
     */
    subscription.usedChats =
      (subscription.usedChats || 0) + 1;

    await subscription.save();

    const usedChats =
      subscription.usedChats || 0;

    const remainingMessages =
      selectedPlan.chatLimit === -1
        ? -1
        : Math.max(
            selectedPlan.chatLimit -
              usedChats,
            0
          );

    sendStreamEvent(res, {
      type: "done",
      success: true,
      reply: completeReply,
      plan: selectedPlanName,
      planId: selectedPlan.id,
      usedChats,
      chatLimit:
        selectedPlan.chatLimit,
      remainingMessages,
      uploadedFiles:
        uploadedFiles.map((file) => ({
          name: file.originalname,
          type: file.mimetype,
          size: file.size
        }))
    });

    return res.end();
  } catch (error) {
    console.error(
      "Chat AI streaming error:",
      error
    );

    const statusCode =
      error.statusCode || 503;

    const errorMessage =
      error.statusCode === 400
        ? error.message
        : "AI service is temporarily unavailable. Please try again shortly.";

    /*
     * Headers have already been sent after
     * streaming begins, so send an error event
     * instead of returning normal JSON.
     */
    if (streamingStarted || res.headersSent) {
      if (!clientDisconnected) {
        sendStreamEvent(res, {
          type: "error",
          success: false,
          error: errorMessage
        });

        return res.end();
      }

      return;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
}
