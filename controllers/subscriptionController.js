import Razorpay from "razorpay";
import crypto from "crypto";

import Subscription from "../models/Subscription.js";
import { PLANS } from "../config/plans.js";

/*
  User ID headers, body ya route parameter se milegi.
  Isse "User ID missing" error ke chances kam ho jayenge.
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

  return typeof userId === "string" ? userId.trim() : null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days || 30));
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

  return Math.max(Number(limit || 0) - Number(used || 0), 0);
}

function buildSubscriptionResponse(subscription, plan) {
  const usedChats = Number(subscription.usedChats || 0);
  const usedImages = Number(subscription.usedImages || 0);

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
  Expired active subscriptions ko expired mark karta hai.
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
export async function createSubscriptionOrder(req, res) {
  try {
    const userId = getUserId(req);
    const planId = String(req.body?.planId || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID missing hai."
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
        error: "Razorpay keys backend .env mein missing hain."
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
        error: "Plan amount valid nahi hai."
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

    const pendingSubscription = await Subscription.create({
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
      message: "Razorpay order create ho gaya.",

      razorpayKeyId: process.env.RAZORPAY_KEY_ID,

      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },

      subscriptionId: pendingSubscription._id,

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
        "Subscription order create nahi ho paaya."
    });
  }
}

/*
  POST /api/subscriptions/verify-payment

  Payment successful hone par:
  1. Signature verify hogi
  2. Chosen plan active hoga
  3. Purana active plan expired hoga
  4. 30 din ki validity set hogi
  5. Frontend ko index.html redirect information milegi
*/
export async function verifySubscriptionPayment(req, res) {
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
        error: "User ID missing hai."
      });
    }

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        error: "Payment verification details missing hain."
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        error: "Razorpay secret backend .env mein missing hai."
      });
    }

    /*
      Agar same payment pehle verify ho chuki hai,
      to dobara fail karne ke bajaye active plan return karo.
    */
    const alreadyActiveSubscription =
      await Subscription.findOne({
        userId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        status: "active"
      });

    if (alreadyActiveSubscription) {
      const activePlan =
        PLANS[alreadyActiveSubscription.planId];

      if (!activePlan) {
        return res.status(400).json({
          success: false,
          error: "Active subscription ka plan config nahi mila."
        });
      }

      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message:
          "Payment pehle hi verify ho chuki hai. Subscription active hai.",

        hasActiveSubscription: true,

        plan: {
          id: activePlan.id,
          name: activePlan.name,
          price: activePlan.price,
          currency: activePlan.currency,
          durationDays: activePlan.durationDays,
          chatLimit: activePlan.chatLimit,
          imageLimit: activePlan.imageLimit
        },

        subscription: buildSubscriptionResponse(
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

    const receivedSignature =
      String(razorpay_signature);

    const generatedBuffer = Buffer.from(
      generatedSignature,
      "utf8"
    );

    const receivedBuffer = Buffer.from(
      receivedSignature,
      "utf8"
    );

    const signatureIsValid =
      generatedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(
        generatedBuffer,
        receivedBuffer
      );

    if (!signatureIsValid) {
      await Subscription.findOneAndUpdate(
        {
          userId,
          razorpayOrderId: razorpay_order_id,
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
        error: "Payment verification failed."
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      razorpayOrderId: razorpay_order_id,
      status: "pending"
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error:
          "Pending subscription nahi mili. User ID aur Razorpay order check karein."
      });
    }

    const plan = PLANS[subscription.planId];

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: "Plan config nahi mila."
      });
    }

    const startDate = new Date();
    const endDate = addDays(
      startDate,
      plan.durationDays || 30
    );

    /*
      User ka purana active plan expire hoga.
      Naya chosen plan active hoga.
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
        `${plan.name} payment verified. Subscription active ho gayi.`,

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

      subscription: buildSubscriptionResponse(
        subscription,
        plan
      ),

      /*
        subscription.html is value ko use karke
        user ko chat page par redirect karega.
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
        "Payment verify nahi ho paayi."
    });
  }
}

/*
  GET /api/subscriptions/status

  User ID header/query se milegi.
*/
export async function getSubscriptionStatus(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID missing hai."
      });
    }

    await expireOldSubscriptions(userId);

    const currentDate = new Date();

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
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        plan: null,
        subscription: null,
        message: "Active subscription nahi hai."
      });
    }

    const plan = PLANS[subscription.planId];

    if (!plan) {
      return res.status(500).json({
        success: false,
        error: "Active subscription ka plan config nahi mila."
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

      subscription: buildSubscriptionResponse(
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
        "Subscription status check nahi ho paaya."
    });
  }
}

/*
  GET /api/subscriptions/current/:userId

  index.html aur image.html isi endpoint ko call kar sakte hain.
*/
export async function getCurrentSubscription(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID missing hai."
      });
    }

    await expireOldSubscriptions(userId);

    const currentDate = new Date();

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
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        plan: null,
        subscription: null,
        message: "Active subscription nahi hai."
      });
    }

    const plan = PLANS[subscription.planId];

    if (!plan) {
      return res.status(500).json({
        success: false,
        error: "Subscription ka plan config nahi mila."
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

      subscription: buildSubscriptionResponse(
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
        "Current subscription check nahi ho paayi."
    });
  }
}