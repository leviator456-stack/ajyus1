import { getPlan } from "../config/plans.js";
import Subscription from "../models/Subscription.js";

export async function imageLimit(req, res, next) {
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

    // User ka latest active subscription dhundo
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
        error:
          "Image generate karne ke liye active subscription zaroori hai."
      });
    }

    const selectedPlan = getPlan(subscription.planId);

    if (!selectedPlan) {
      return res.status(404).json({
        success: false,
        error: "Subscription plan available nahi hai."
      });
    }

    const imageUsed = subscription.imageUsed || 0;

    if (imageUsed >= selectedPlan.imageLimit) {
      return res.status(429).json({
        success: false,
        error: `${selectedPlan.name} plan ki image limit poori ho gayi hai.`,
        plan: selectedPlan.id,
        imageLimit: selectedPlan.imageLimit,
        remainingImages: 0
      });
    }

    // Successful image banne ke baad controller usage badhayega
    req.userId = userId;
    req.subscription = subscription;
    req.selectedPlanName = selectedPlan.id;
    req.selectedPlan = selectedPlan;
    req.remainingImages = Math.max(
      selectedPlan.imageLimit - imageUsed,
      0
    );

    next();
  } catch (error) {
    console.error("Image limit middleware error:", error);

    return res.status(500).json({
      success: false,
      error: "Image plan limit check nahi ho payi."
    });
  }
}