import mongoose from "mongoose";

import Subscription from "../models/subscription.js";
import { PLANS } from "../config/plans.js";

function getUserId(req) {
  const userId =
    req.headers["x-ajyus-user-id"] ||
    req.headers["x-user-id"] ||
    req.body?.userId ||
    null;

  if (!userId) {
    return null;
  }

  return String(userId).trim();
}

export function requireActiveSubscription(feature = "chat") {
  return async function (req, res, next) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is missing.",
          redirectTo: "subscription.html"
        });
      }

      /*
        Check the MongoDB connection.

        readyState:
        0 = disconnected
        1 = connected
        2 = connecting
        3 = disconnecting
      */
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          success: false,
          error:
            "MongoDB is not connected. Please check the database connection."
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
      }).sort({ createdAt: -1 });

      if (!subscription) {
        return res.status(403).json({
          success: false,
          error:
            "No active subscription was found. Please purchase a plan first.",
          redirectTo: "subscription.html"
        });
      }

      const plan = PLANS[subscription.planId];

      if (!plan) {
        return res.status(403).json({
          success: false,
          error:
            "The plan configuration was not found. Please check your subscription again.",
          redirectTo: "subscription.html"
        });
      }

      // Check chat limit
      if (feature === "chat") {
        const chatLimit = plan.chatLimit;
        const usedChats = subscription.usedChats || 0;

        if (chatLimit !== -1 && usedChats >= chatLimit) {
          return res.status(403).json({
            success: false,
            error:
              "Your chat limit has been reached. Please upgrade your plan.",
            redirectTo: "subscription.html",
            plan: plan.id,
            chatLimit,
            usedChats,
            remainingMessages: 0
          });
        }
      }

      // Check image limit
      if (feature === "image" || feature === "images") {
        const imageLimit = plan.imageLimit;
        const usedImages = subscription.usedImages || 0;

        if (imageLimit !== -1 && usedImages >= imageLimit) {
          return res.status(403).json({
            success: false,
            error:
              "Your image limit has been reached. Please upgrade your plan.",
            redirectTo: "subscription.html",
            plan: plan.id,
            imageLimit,
            usedImages,
            remainingImages: 0
          });
        }
      }

      // Check video limit
      if (feature === "video" || feature === "videos") {
        const videoLimit = plan.videoLimit;
        const usedVideos = subscription.usedVideos || 0;

        if (videoLimit !== -1 && usedVideos >= videoLimit) {
          return res.status(403).json({
            success: false,
            error:
              "Your video generation limit has been reached. Please upgrade your plan.",
            redirectTo: "subscription.html",
            plan: plan.id,
            videoLimit,
            usedVideos,
            remainingVideos: 0
          });
        }
      }

      req.userId = userId;
      req.subscription = subscription;
      req.selectedPlan = plan;
      req.subscriptionFeature = feature;

      return next();
    } catch (error) {
      console.error("Subscription middleware error:", error);

      return res.status(500).json({
        success: false,
        error: "Unable to verify the subscription.",
        details: error.message
      });
    }
  };
}
