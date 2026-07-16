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
        error: "User ID was not provided."
      });
    }

    const currentDate = new Date();

    // Mark expired subscriptions as expired
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

    // Find the latest active subscription
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
        error: "An active subscription is required to use the chat."
      });
    }

    const selectedPlan = getPlan(subscription.planId);

    if (!selectedPlan) {
      return res.status(404).json({
        success: false,
        error: "The subscription plan is not available."
      });
    }

    const chatUsed = subscription.chatUsed || 0;

    // Check the chat limit for Basic and Ultra plans
    if (
      selectedPlan.unlimitedChats !== true &&
      chatUsed >= selectedPlan.chatLimit
    ) {
      return res.status(429).json({
        success: false,
        error: `The chat limit for the ${selectedPlan.name} plan has been reached.`,
        plan: selectedPlan.id,
        chatLimit: selectedPlan.chatLimit,
        remainingMessages: 0
      });
    }

    // Usage is not increased here
    // The controller will increase usage after a successful AI response
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
      error: "Unable to check the chat plan limit."
    });
  }
}
