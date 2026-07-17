import { generateChatReply } from "../services/chat.service.js";

export async function chatController(req, res, next) {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,a
        error: "enter prompt."
      });
    }

    const selectedPlan = req.selectedPlan;
    const subscription = req.subscription;

    if (!selectedPlan || !subscription) {
      return res.status(403).json({
        success: false,
        error: "Active subscription nahi mili.",
        redirectTo: "subscription.html"
      });
    }

    const selectedPlanName = selectedPlan.name;

    // Pehle AI reply generate hogi
    const reply = await generateChatReply(
      message.trim(),
      selectedPlanName
    );

    // Successful reply ke baad hi usage count increase hoga
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
    next(error);
  }
} 
