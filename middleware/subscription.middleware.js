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
          error: "User ID missing hai.",
          redirectTo: "subscription.html"
        });
      }

      /*
        MongoDB connection check
        readyState:
        0 = disconnected
        1 = connected
        2 = connecting
        3 = disconnecting
      */
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          success: false,
          error: "MongoDB connect nahi hai. Pehle database connection check karo."
        });
      }

      const currentDate = new Date();

      // Expired subscriptions ko expire mark karo
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

      // Latest active subscription find karo
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
          error: "Active subscription nahi mili. Pehle plan kharidein.",
          redirectTo: "subscription.html"
        });
      }

      const plan = PLANS[subscription.planId];

      if (!plan) {
        return res.status(403).json({
          success: false,
          error: "Plan config nahi mila. Subscription dobara check karein.",
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
            error: "Aapka chat limit complete ho gaya hai. Plan upgrade karein.",
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
            error: "Aapka image limit complete ho gaya hai. Plan upgrade karein.",
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
        error: "Subscription check nahi ho paaya.",
        details: error.message
      });
    }
  };
}
