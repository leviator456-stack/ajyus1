import crypto from "crypto";

import Subscription from "../models/subscription.js";
import { PLANS } from "../config/plans.js";

function addDays(date, days) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + Number(days || 30)
  );

  return result;
}

function isValidWebhookSignature(
  rawBody,
  receivedSignature
) {
  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret || !receivedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "utf8"
  );

  const receivedBuffer = Buffer.from(
    String(receivedSignature),
    "utf8"
  );

  if (
    expectedBuffer.length !== receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}

export async function handleRazorpayWebhook(
  req,
  res
) {
  try {
    const webhookSignature =
      req.headers["x-razorpay-signature"];

    const webhookEventId =
      req.headers["x-razorpay-event-id"];

    if (!Buffer.isBuffer(req.body)) {
      console.error(
        "Razorpay webhook body is not a raw Buffer."
      );

      return res.status(500).json({
        success: false,
        error: "Webhook body configuration error."
      });
    }

    const signatureIsValid =
      isValidWebhookSignature(
        req.body,
        webhookSignature
      );

    if (!signatureIsValid) {
      console.error(
        "Invalid Razorpay webhook signature."
      );

      return res.status(400).json({
        success: false,
        error: "Invalid webhook signature."
      });
    }

    const webhookEvent = JSON.parse(
      req.body.toString("utf8")
    );

    const eventName = webhookEvent?.event;

    const payment =
      webhookEvent?.payload?.payment?.entity;

    const order =
      webhookEvent?.payload?.order?.entity;

    const razorpayOrderId =
      payment?.order_id || order?.id;

    const razorpayPaymentId =
      payment?.id || null;

    console.log(
      `Razorpay webhook received: ${eventName}`,
      webhookEventId
        ? `Event ID: ${webhookEventId}`
        : ""
    );

    /*
      Successful payment events
    */
    if (
      eventName === "payment.captured" ||
      eventName === "order.paid"
    ) {
      if (!razorpayOrderId) {
        return res.status(200).json({
          success: true,
          message:
            "Webhook received without an order ID."
        });
      }

      const subscription =
        await Subscription.findOne({
          razorpayOrderId
        });

      if (!subscription) {
        console.warn(
          `Subscription not found for order: ${razorpayOrderId}`
        );

        return res.status(200).json({
          success: true,
          message:
            "No matching subscription was found."
        });
      }

      /*
        Subscription pehle se active hai to validity
        dobara extend nahi hogi.
      */
      if (subscription.status === "active") {
        if (
          razorpayPaymentId &&
          !subscription.razorpayPaymentId
        ) {
          subscription.razorpayPaymentId =
            razorpayPaymentId;

          await subscription.save();
        }

        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          message:
            "Subscription is already active."
        });
      }

      /*
        Expired ya cancelled purani subscription ko
        duplicate webhook dobara activate nahi karega.

        Failed payment ke baad captured payment aa sakti
        hai, isliye failed status allow kiya gaya hai.
      */
      if (
        !["pending", "failed"].includes(
          subscription.status
        )
      ) {
        console.warn(
          `Webhook ignored for subscription status: ${subscription.status}`
        );

        return res.status(200).json({
          success: true,
          ignored: true,
          message:
            "Subscription is not eligible for activation."
        });
      }

      const plan =
        PLANS[subscription.planId];

      if (!plan) {
        console.error(
          `Plan configuration not found: ${subscription.planId}`
        );

        return res.status(500).json({
          success: false,
          error:
            "Subscription plan configuration was not found."
        });
      }

      const startDate = new Date();

      const endDate = addDays(
        startDate,
        plan.durationDays || 30
      );

      /*
        User ka purana active chat/image plan expire karo.
      */
      await Subscription.updateMany(
        {
          userId: subscription.userId,
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

      if (razorpayPaymentId) {
        subscription.razorpayPaymentId =
          razorpayPaymentId;
      }

      subscription.startDate = startDate;
      subscription.endDate = endDate;

      subscription.usedChats = 0;
      subscription.usedImages = 0;
      subscription.usedVideos = 0;

      await subscription.save();

      console.log(
        `Subscription activated for order: ${razorpayOrderId}`
      );

      return res.status(200).json({
        success: true,
        message:
          "Subscription activated successfully."
      });
    }

    /*
      Failed payment event
    */
    if (eventName === "payment.failed") {
      if (razorpayOrderId) {
        await Subscription.findOneAndUpdate(
          {
            razorpayOrderId,
            status: "pending"
          },
          {
            $set: {
              status: "failed",

              ...(razorpayPaymentId
                ? {
                    razorpayPaymentId
                  }
                : {})
            }
          }
        );
      }

      return res.status(200).json({
        success: true,
        message: "Failed payment recorded."
      });
    }

    return res.status(200).json({
      success: true,
      message: `Event ${eventName} acknowledged.`
    });
  } catch (error) {
    console.error(
      "Razorpay webhook error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Webhook processing failed."
    });
  }
}
