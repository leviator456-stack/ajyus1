import { generateChatReply } from "../services/chat.service.js";

export async function chatController(req, res) {
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
        error: "Please enter a prompt or upload a file."
      });
    }

    const selectedPlan = req.selectedPlan;
    const subscription = req.subscription;

    if (!selectedPlan || !subscription) {
      return res.status(403).json({
        success: false,
        error: "An active subscription is required.",
        redirectTo: "subscription.html"
      });
    }

    const selectedPlanName =
      selectedPlan.name;

    const finalMessage =
      message ||
      "Please analyze the attached file and explain its contents.";

    const reply = await generateChatReply(
      finalMessage,
      selectedPlanName,
      uploadedFiles
    );

    // Increase usage only after a successful AI response
    subscription.usedChats =
      (subscription.usedChats || 0) + 1;

    await subscription.save();

    const usedChats =
      subscription.usedChats || 0;

    const remainingMessages =
      selectedPlan.chatLimit === -1
        ? -1
        : Math.max(
            selectedPlan.chatLimit - usedChats,
            0
          );

    return res.status(200).json({
      success: true,
      plan: selectedPlanName,
      planId: selectedPlan.id,
      usedChats,
      chatLimit: selectedPlan.chatLimit,
      remainingMessages,
      uploadedFiles: uploadedFiles.map(
        file => ({
          name: file.originalname,
          type: file.mimetype,
          size: file.size
        })
      ),
      reply
    });
  } catch (error) {
    console.error(
      "Chat AI API error:",
      error
    );

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
