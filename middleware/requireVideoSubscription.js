import mongoose from "mongoose";
import VideoSubscription from "../models/VideoSubscription.js";
import { getVideoPlan } from "../config/videoPlans.js";

export const requireVideoSubscription = async (
  req,
  res,
  next
) => {
  try {
    const userId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.body?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID was not found.",
        redirectTo: "video.html"
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const now = new Date();

    // Expire old video subscriptions
    await VideoSubscription.updateMany(
      {
        userId,
        status: "active",
        endDate: {
          $lte: now
        }
      },
      {
        $set: {
          status: "expired"
        }
      }
    );

    // Find the latest active video subscription
    const subscription =
      await VideoSubscription.findOne({
        userId,
        status: "active",
        endDate: {
          $gt: now
        }
      }).sort({
        createdAt: -1
      });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message:
          "An active video subscription is required.",
        redirectTo: "video.html",
        requiresVideoSubscription: true
      });
    }

    const selectedPlan = getVideoPlan(
      subscription.planId
    );

    if (!selectedPlan) {
      return res.status(403).json({
        success: false,
        message:
          "The selected video plan is invalid.",
        redirectTo: "video.html"
      });
    }

    // Apply the limit only when starting a new video
    const isVideoGenerationRequest =
      req.method === "POST" &&
      req.path === "/generate";

    if (
      isVideoGenerationRequest &&
      selectedPlan.videoLimit !== -1 &&
      subscription.usedVideos >=
        selectedPlan.videoLimit
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your video generation limit has been reached.",
        redirectTo: "video.html",
        limitReached: true
      });
    }

    req.videoSubscription = subscription;
    req.selectedVideoPlan = selectedPlan;

    next();
  } catch (error) {
    console.error(
      "Video subscription middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify the video subscription."
    });
  }
};

export default requireVideoSubscription;
