import Razorpay from "razorpay";
import crypto from "crypto";

import Subscription from "../models/subscription.js";
import { PLANS } from "../config/plans.js";

/*
  The user ID can be read from request headers, body,
  route parameters, or query parameters.

  This reduces the chances of receiving a
  "User ID is missing" error.
*/
function getUserId(req) {
  const userId =
    req.headers["x-ajyus-user-id"] ||
    req.headers["x-user-id"] ||
    req.params?.userId ||
    req.body?.userId ||
    req.body?.userid ||
    req.body?.user_id ||
    req.body?.clientUserId ||
    req.query?.userId ||
    null;

  return typeof userId === "string"
    ? userId.trim()
    : null;
}

function addDays(date, days) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + Number(days || 30)
  );

  return result;
}

function createRazorpayInstance() {
  if (
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    return null;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

function calculateRemaining(limit, used) {
  if (limit === -1) {
    return -1;
  }

  return Math.max(
    Number(limit || 0) - Number(used || 0),
    0
  );
}

function buildSubscriptionResponse(
  subscription,
  plan
) {
  const usedChats = Number(
    subscription.usedChats || 0
  );

  const usedImages = Number(
    subscription.usedImages || 0
  );

  return {
    id: subscription._id,
    userId: subscription.userId,
    planId: subscription.planId,
    planName: subscription.planName,
    amount: subscription.amount,
    currency: subscription.currency,
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,

    chatLimit: plan.chatLimit,
    imageLimit: plan.imageLimit,

    usedChats,
    usedImages,

    remainingChats: calculateRemaining(
      plan.chatLimit,
      usedChats
    ),

    remainingImages: calculateRemaining(
      plan.imageLimit,
      usedImages
    )
  };
}

/*
  Marks active subscriptions as expired
  when their end date has passed.
*/
async function expireOldSubscriptions(userId) {
  const currentDate = new Date();

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
}

/*
  POST /api/subscriptions/create-order
*/
export async function createSubscriptionOrder(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const planId = String(
      req.body?.planId || ""
    ).trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is missing."
      });
    }

    if (!planId || !PLANS[planId]) {
      return res.status(400).json({
        success: false,
        error: "Invalid plan selected."
      });
    }

    const razorpay = createRazorpayInstance();

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        error:
          "Razorpay keys are missing from the backend .env file."
      });
    }

    const plan = PLANS[planId];

    const amountInPaise = Math.round(
      Number(plan.price) * 100
    );

    if (
      !Number.isFinite(amountInPaise) ||
      amountInPaise < 100
    ) {
      return res.status(400).json({
        success: false,
        error: "The plan amount is invalid."
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: plan.currency || "INR",
      receipt: `sub_${Date.now()}`,

      notes: {
        userId,
        planId: plan.id,
        planName: plan.name
      }
    });

    const pendingSubscription =
      await Subscription.create({
        userId,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        currency: plan.currency || "INR",
        status: "pending",
        razorpayOrderId: order.id,
        usedChats: 0,
        usedImages: 0
      });

    return res.status(200).json({
      success: true,
      message:
        "Razorpay order created successfully.",

      razorpayKeyId:
        process.env.RAZORPAY_KEY_ID,

      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },

      subscriptionId:
        pendingSubscription._id,

      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency || "INR",
        durationDays: plan.durationDays,
        chatLimit: plan.chatLimit,
        imageLimit: plan.imageLimit
      }
    });
  } catch (error) {
    console.error(
      "Create subscription order error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.error?.description ||
        error?.message ||
        "Unable to create the subscription order."
    });
  }
}

/*
  POST /api/subscriptions/verify-payment

  After a successful payment:

  1. The Razorpay signature will be verified.
  2. The selected plan will be activated.
  3. The previous active plan will be expired.
  4. The subscription validity will be set.
  5. Redirect information will be returned
     to the frontend.
*/
export async function verifySubscriptionPayment(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is missing."
      });
    }

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Payment verification details are missing."
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        error:
          "Razorpay secret is missing from the backend .env file."
      });
    }

    /*
      If the same payment has already been
      verified, return the active subscription
      instead of failing the request.
    */
    const alreadyActiveSubscription =
      await Subscription.findOne({
        userId,
        razorpayOrderId:
          razorpay_order_id,
        razorpayPaymentId:
          razorpay_payment_id,
        status: "active"
      });

    if (alreadyActiveSubscription) {
      const activePlan =
        PLANS[
          alreadyActiveSubscription.planId
        ];

      if (!activePlan) {
        return res.status(400).json({
          success: false,
          error:
            "Plan configuration for the active subscription was not found."
        });
      }

      return res.status(200).json({
        success: true,
        alreadyVerified: true,

        message:
          "The payment has already been verified. The subscription is active.",

        hasActiveSubscription: true,

        plan: {
          id: activePlan.id,
          name: activePlan.name,
          price: activePlan.price,
          currency: activePlan.currency,
          durationDays:
            activePlan.durationDays,
          chatLimit: activePlan.chatLimit,
          imageLimit: activePlan.imageLimit
        },

        subscription:
          buildSubscriptionResponse(
            alreadyActiveSubscription,
            activePlan
          ),

        redirectTo: "index.html"
      });
    }

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    const receivedSignature = String(
      razorpay_signature
    );

    const generatedBuffer = Buffer.from(
      generatedSignature,
      "utf8"
    );

    const receivedBuffer = Buffer.from(
      receivedSignature,
      "utf8"
    );

    const signatureIsValid =
      generatedBuffer.length ===
        receivedBuffer.length &&
      crypto.timingSafeEqual(
        generatedBuffer,
        receivedBuffer
      );

    if (!signatureIsValid) {
      await Subscription.findOneAndUpdate(
        {
          userId,
          razorpayOrderId:
            razorpay_order_id,
          status: "pending"
        },
        {
          $set: {
            status: "failed"
          }
        }
      );

      return res.status(400).json({
        success: false,
        error:
          "Payment verification failed."
      });
    }

    const subscription =
      await Subscription.findOne({
        userId,
        razorpayOrderId:
          razorpay_order_id,
        status: "pending"
      });

    if (!subscription) {
      return res.status(404).json({
        success: false,

        error:
          "Pending subscription was not found. Check the user ID and Razorpay order ID."
      });
    }

    const plan =
      PLANS[subscription.planId];

    if (!plan) {
      return res.status(400).json({
        success: false,
        error:
          "Plan configuration was not found."
      });
    }

    const startDate = new Date();

    const endDate = addDays(
      startDate,
      plan.durationDays || 30
    );

    /*
      The user's previous active plan will
      be marked as expired.

      The newly selected plan will then
      become active.
    */
    await Subscription.updateMany(
      {
        userId,
        status: "active",

        _id: {
          $ne: subscription._id
        }
      },
      {
        $set: {
          status: "expired"
        }
      }
    );

    subscription.status = "active";

    subscription.razorpayPaymentId =
      razorpay_payment_id;

    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.usedChats = 0;
    subscription.usedImages = 0;

    await subscription.save();

    return res.status(200).json({
      success: true,
      hasActiveSubscription: true,

      message:
        `${plan.name} payment verified. The subscription is now active.`,

      plan: {
        id: plan.id,
        planId: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency || "INR",
        durationDays: plan.durationDays,
        chatLimit: plan.chatLimit,
        imageLimit: plan.imageLimit
      },

      subscription:
        buildSubscriptionResponse(
          subscription,
          plan
        ),

      /*
        subscription.html can use this value
        to redirect the user to the chat page.
      */
      redirectTo: "index.html"
    });
  } catch (error) {
    console.error(
      "Verify subscription payment error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Unable to verify the payment."
    });
  }
}

/*
  GET /api/subscriptions/status

  The user ID can be read from the
  request header or query parameters.
*/
export async function getSubscriptionStatus(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is missing."
      });
    }

    await expireOldSubscriptions(userId);

    const currentDate = new Date();

    const subscription =
      await Subscription.findOne({
        userId,
        status: "active",

        endDate: {
          $gt: currentDate
        }
      }).sort({
        createdAt: -1
      });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        plan: null,
        subscription: null,
        message:
          "No active subscription was found."
      });
    }

    const plan =
      PLANS[subscription.planId];

    if (!plan) {
      return res.status(500).json({
        success: false,

        error:
          "Plan configuration for the active subscription was not found."
      });
    }

    return res.status(200).json({
      success: true,
      hasActiveSubscription: true,

      plan: {
        id: plan.id,
        planId: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency || "INR",
        durationDays: plan.durationDays,
        chatLimit: plan.chatLimit,
        imageLimit: plan.imageLimit
      },

      subscription:
        buildSubscriptionResponse(
          subscription,
          plan
        )
    });
  } catch (error) {
    console.error(
      "Get subscription status error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Unable to check the subscription status."
    });
  }
}

/*
  GET /api/subscriptions/current/:userId

  index.html and image.html can call
  this endpoint.
*/
export async function getCurrentSubscription(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is missing."
      });
    }

    await expireOldSubscriptions(userId);

    const currentDate = new Date();

    const subscription =
      await Subscription.findOne({
        userId,
        status: "active",

        endDate: {
          $gt: currentDate
        }
      }).sort({
        createdAt: -1
      });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        plan: null,
        subscription: null,
        message:
          "No active subscription was found."
      });
    }

    const plan =
      PLANS[subscription.planId];

    if (!plan) {
      return res.status(500).json({
        success: false,

        error:
          "Plan configuration for the subscription was not found."
      });
    }

    return res.status(200).json({
      success: true,
      hasActiveSubscription: true,

      plan: {
        id: plan.id,
        planId: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency || "INR",
        durationDays: plan.durationDays,
        chatLimit: plan.chatLimit,
        imageLimit: plan.imageLimit
      },

      subscription:
        buildSubscriptionResponse(
          subscription,
          plan
        )
    });
  } catch (error) {
    console.error(
      "Get current subscription error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Unable to check the current subscription."
    });
  }
}
