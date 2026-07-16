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

      if (feature === "chat") {
        const chatLimit = plan.chatLimit;

        if (
          chatLimit !== -1 &&
          (subscription.usedChats || 0) >= chatLimit
        ) {
          return res.status(403).json({
            success: false,
            error:
              "Your chat limit has been reached. Please upgrade your plan.",
            redirectTo: "subscription.html",
            plan: plan.id,
            chatLimit,
            usedChats: subscription.usedChats || 0,
            remainingMessages: 0
          });
        }
      }

      if (feature === "image") {
        const imageLimit = plan.imageLimit;

        if ((subscription.usedImages || 0) >= imageLimit) {
          return res.status(403).json({
            success: false,
            error:
              "Your image limit has been reached. Please upgrade your plan.",
            redirectTo: "subscription.html",
            plan: plan.id,
            imageLimit,
            usedImages: subscription.usedImages || 0,
            remainingImages: 0
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
