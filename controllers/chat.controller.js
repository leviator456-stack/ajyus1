import { generateChatReply } from "../services/chat.service.js";

export async function chatController(req, res) {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter a prompt."
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

    const selectedPlanName = selectedPlan.name;

    const reply = await generateChatReply(
      message.trim(),
      selectedPlanName
    );

    // Increase usage only after a successful AI response
    subscription.usedChats = (subscription.usedChats || 0) + 1;
    await subscription.save();

    const usedChats = subscription.usedChats || 0;

    const remainingMessages =
      selectedPlan.chatLimit === -1
        ? -1
        : Math.max(selectedPlan.chatLimit - usedChats, 0);

    return res.status(200).json({
      success: true,
      plan: selectedPlanName,
      planId: selectedPlan.id,
      usedChats,
      chatLimit: selectedPlan.chatLimit,
      remainingMessages,
      reply
    });
  } catch (error) {
    // The original Gemini error will only appear in Railway logs
    console.error("Chat AI API error:", error);

    // Customers will see only this safe message
    return res.status(503).json({
      success: false,
      error: "AI service is temporarily unavailable. Please try again shortly."
    });
  }
}
