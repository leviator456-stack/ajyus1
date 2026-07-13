import { getPlan } from "../config/plans.js";
import Subscription from "../models/Subscription.js";

export async function planLimit(req, res, next) {
  try {
    const bodyUserId =
      typeof req.body?.userId === "string"
        ? req.body.userId.trim()
        : "";

    const headerUserId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"].trim()
        : "";

    const userId = bodyUserId || headerUserId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID nahi mili."
      });
    }

    const currentDate = new Date();

    // Expired subscriptions ko expired mark karo
    await Subscription.updateMany(
      {
        userId,
        status: "active",
        endDate: {
          $lte: currentDate
        }
      },
      {
        $set: {
          status: "expired"
        }
      }
    );

    // Latest active subscription dhundo
    const subscription = await Subscription.findOne({
      userId,
      status: "active",
      endDate: {
        $gt: currentDate
      }
    }).sort({
      createdAt: -1
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: "Chat use karne ke liye active subscription zaroori hai."
      });
    }

    const selectedPlan = getPlan(subscription.planId);

    if (!selectedPlan) {
      return res.status(404).json({
        success: false,
        error: "Subscription plan available nahi hai."
      });
    }

    const chatUsed = subscription.chatUsed || 0;

    // Basic aur Ultra ki limit check karo
    if (
      selectedPlan.unlimitedChats !== true &&
      chatUsed >= selectedPlan.chatLimit
    ) {
      return res.status(429).json({
        success: false,
        error: `${selectedPlan.name} plan ki chat limit poori ho gayi hai.`,
        plan: selectedPlan.id,
        chatLimit: selectedPlan.chatLimit,
        remainingMessages: 0
      });
    }

    // Abhi usage increase nahi hoga
    // Successful AI reply ke baad controller mein increase hoga
    req.userId = userId;
    req.subscription = subscription;
    req.selectedPlanName = selectedPlan.id;
    req.selectedPlan = selectedPlan;

    req.remainingMessages =
      selectedPlan.unlimitedChats === true
        ? null
        : Math.max(selectedPlan.chatLimit - chatUsed, 0);

    next();
  } catch (error) {
    console.error("Plan limit middleware error:", error);

    return res.status(500).json({
      success: false,
      error: "Chat plan limit check nahi ho payi."
    });
  }
}