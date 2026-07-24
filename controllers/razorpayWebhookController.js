import crypto from "crypto";
import Subscription from "../models/subscription.js";

const THIRTY_DAYS_IN_MS =
  30 * 24 * 60 * 60 * 1000;

const isValidWebhookSignature = (
  rawBody,
  receivedSignature
) => {
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
    receivedSignature,
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
};

export const handleRazorpayWebhook = async (
  req,
  res
) => {
  try {
    const webhookSignature =
      req.headers["x-razorpay-signature"];

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
      `Razorpay webhook received: ${eventName}`
    );

    /*
     * Successful payment:
     * Activate the pending AJYUS subscription.
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
            "No matching subscription found."
        });
      }

      /*
       * Do not extend the subscription again if
       * verify-payment already activated it.
       */
      if (subscription.status !== "active") {
        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() +
            THIRTY_DAYS_IN_MS
        );

        subscription.status = "active";
        subscription.startDate = startDate;
        subscription.endDate = endDate;
      }

      if (
        razorpayPaymentId &&
        !subscription.razorpayPaymentId
      ) {
        subscription.razorpayPaymentId =
          razorpayPaymentId;
      }

      await subscription.save();

      console.log(
        `Subscription activated for order: ${razorpayOrderId}`
      );

      return res.status(200).json({
        success: true,
        message: "Subscription activated."
      });
    }

    /*
     * Failed payment:
     * Only mark a pending subscription as failed.
     * Never deactivate an already active subscription.
     */
    if (eventName === "payment.failed") {
      if (razorpayOrderId) {
        await Subscription.findOneAndUpdate(
          {
            razorpayOrderId,
            status: "pending"
          },
          {
            status: "failed",
            ...(razorpayPaymentId
              ? {
                  razorpayPaymentId
                }
              : {})
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
};
