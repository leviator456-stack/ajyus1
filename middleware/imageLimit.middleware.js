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

    // Find the user's latest active subscription
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
          "An active subscription is required to generate images."
      });
    }

    const selectedPlan = getPlan(subscription.planId);

    if (!selectedPlan) {
      return res.status(404).json({
        success: false,
        error: "The subscription plan is not available."
      });
    }

    const imageUsed = subscription.imageUsed || 0;

    if (imageUsed >= selectedPlan.imageLimit) {
      return res.status(429).json({
        success: false,
        error: `The image limit for the ${selectedPlan.name} plan has been reached.`,
        plan: selectedPlan.id,
        imageLimit: selectedPlan.imageLimit,
        remainingImages: 0
      });
    }

    // The controller will increase usage after successful image generation
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
      error: "Unable to check the image plan limit."
    });
  }
}
