import crypto from "crypto";
import razorpay from "../config/razorpay.js";
import VideoSubscription from "../models/VideoSubscription.js";
import { getVideoPlan } from "../config/videoPlans.js";

const getUserId = (req) => {
  return (
    req.headers["x-ajyus-user-id"] ||
    req.headers["x-user-id"] ||
    req.body?.userId
  );
};

// Create Razorpay order for a video plan
export const createVideoOrder = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { planId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID was not found."
      });
    }

    const selectedPlan = getVideoPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "The selected video plan is invalid."
      });
    }

    const receipt = `video_${Date.now()}_${userId}`
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 40);

    const order = await razorpay.orders.create({
      amount: selectedPlan.price * 100,
      currency: "INR",
      receipt,
      notes: {
        userId,
        planId: selectedPlan.id,
        subscriptionType: "video"
      }
    });

    const subscription = await VideoSubscription.create({
      userId,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      amount: selectedPlan.price,
      currency: "INR",
      status: "pending",
      razorpayOrderId: order.id,
      usedVideos: 0
    });

    return res.status(201).json({
      success: true,
      message: "Video subscription order was created.",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency
      },
      plan: selectedPlan,
      subscriptionId: subscription._id
    });
  } catch (error) {
    console.error("Create video order error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        error?.message ||
        "Unable to create the video subscription order."
    });
  }
};

// Verify Razorpay video subscription payment
export const verifyVideoPayment = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      planId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID was not found."
      });
    }

    if (
      !planId ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are incomplete."
      });
    }

    const selectedPlan = getVideoPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "The selected video plan is invalid."
      });
    }

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      await VideoSubscription.findOneAndUpdate(
        {
          userId,
          razorpayOrderId
        },
        {
          $set: {
            status: "failed"
          }
        }
      );

      return res.status(400).json({
        success: false,
        message: "Video payment verification failed."
      });
    }

    const pendingSubscription =
      await VideoSubscription.findOne({
        userId,
        razorpayOrderId,
        planId
      });

    if (!pendingSubscription) {
      return res.status(404).json({
        success: false,
        message: "The video subscription order was not found."
      });
    }

    if (
      pendingSubscription.status === "active" &&
      pendingSubscription.razorpayPaymentId ===
        razorpayPaymentId
    ) {
      return res.status(200).json({
        success: true,
        message: "The video subscription is already active.",
        subscription: pendingSubscription
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);

    endDate.setDate(
      endDate.getDate() + selectedPlan.durationDays
    );

    // Expire any previous active video subscription
    await VideoSubscription.updateMany(
      {
        userId,
        status: "active",
        _id: {
          $ne: pendingSubscription._id
        }
      },
      {
        $set: {
          status: "expired"
        }
      }
    );

    pendingSubscription.status = "active";
    pendingSubscription.razorpayPaymentId =
      razorpayPaymentId;
    pendingSubscription.startDate = startDate;
    pendingSubscription.endDate = endDate;
    pendingSubscription.usedVideos = 0;

    await pendingSubscription.save();

    return res.status(200).json({
      success: true,
      message:
        "Your video subscription has been activated.",
      subscription: pendingSubscription,
      plan: selectedPlan
    });
  } catch (error) {
    console.error("Verify video payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify the video payment."
    });
  }
};

// Get the user's current video subscription
export const getVideoSubscriptionStatus = async (
  req,
  res
) => {
  try {
    const userId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.query?.userId ||
      req.params?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID was not found."
      });
    }

    const now = new Date();

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
      return res.status(200).json({
        success: true,
        active: false,
        message:
          "No active video subscription was found."
      });
    }

    const selectedPlan = getVideoPlan(
      subscription.planId
    );

    const remainingVideos =
      selectedPlan?.videoLimit === -1
        ? -1
        : Math.max(
            0,
            (selectedPlan?.videoLimit || 0) -
              subscription.usedVideos
          );

    return res.status(200).json({
      success: true,
      active: true,
      subscription,
      plan: selectedPlan,
      remainingVideos
    });
  } catch (error) {
    console.error(
      "Get video subscription status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve the video subscription."
    });
  }
};
