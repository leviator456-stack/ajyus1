import {
  generateChatReplyStream
} from "../services/chat.service.js";

export async function chatController(req, res) {
  let streamStarted = false;

  try {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    const uploadedFiles =
      Array.isArray(req.files)
        ? req.files
        : [];

    if (
      !message &&
      uploadedFiles.length === 0
    ) {
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

    if (
      !selectedPlan ||
      !subscription
    ) {
      return res.status(403).json({
        success: false,
        error:
          "An active subscription is required.",
        redirectTo:
          "subscription.html"
      });
    }

    const selectedPlanName =
      selectedPlan.name;

    const finalMessage =
      message ||
      "Please analyze the attached file and explain its contents.";

    /*
     * Tell the browser that this response
     * will arrive in small live text chunks.
     */
    res.status(200);

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
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

    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    if (
      typeof res.flushHeaders ===
      "function"
    ) {
      res.flushHeaders();
    }

    streamStarted = true;

    await generateChatReplyStream(
      finalMessage,
      selectedPlanName,
      uploadedFiles,

      async (textChunk) => {
        if (
          !textChunk ||
          res.destroyed ||
          res.writableEnded
        ) {
          return;
        }

        res.write(textChunk);

        /*
         * Some Express compression setups
         * provide res.flush().
         */
        if (
          typeof res.flush ===
          "function"
        ) {
          res.flush();
        }
      }
    );

    /*
     * Increase usage only after the AI
     * successfully completes its answer.
     */
    try {
      subscription.usedChats =
        (subscription.usedChats || 0) + 1;

      await subscription.save();
    } catch (usageError) {
      console.error(
        "Chat usage update error:",
        usageError
      );
    }

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    console.error(
      "Chat AI streaming error:",
      error
    );

    /*
     * When some text has already reached
     * the browser, JSON cannot be returned.
     */
    if (
      streamStarted ||
      res.headersSent
    ) {
      if (
        !res.destroyed &&
        !res.writableEnded
      ) {
        res.write(
          "\n\nAJYUS could not complete this response. Please try again."
        );

        res.end();
      }

      return;
    }

    return res.status(
      error.statusCode || 503
    ).json({
      success: false,

      error:
        error.statusCode === 400
          ? error.message
          : "AI service is temporarily unavailable. Please try again shortly."
    });
  }
}
