import { razorpay } from "../config/razorpay.js";

/*
  Payment amount frontend se nahi lenge.
  Plan ki asli price backend par decide hogi.
*/
const PLANS = {
  basic: {
    name: "Basic",
    amount: 49900 // ₹499 = 49,900 paise
  },

  ultra: {
    name: "Ultra",
    amount: 99900 // ₹999 = 99,900 paise
  },

  ultra_pro: {
    name: "Ultra Pro",
    amount: 199900 // ₹1,999 = 1,99,900 paise
  }
};

export async function createRazorpayOrder(req, res) {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "planId required hai."
      });
    }

    const selectedPlan = PLANS[planId];

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan."
      });
    }

    const orderOptions = {
      amount: selectedPlan.amount,
      currency: "INR",
      receipt: `sub_${Date.now()}`,
      notes: {
        planId,
        planName: selectedPlan.name
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    return res.status(201).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      planId,
      planName: selectedPlan.name,
      amount: order.amount,
      currency: order.currency,
      orderId: order.id,
      order
    });
  } catch (error) {
    console.error(
      "Razorpay order create error:",
      error?.error?.description || error.message
    );

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        "Razorpay order create nahi ho saka."
    });
  }
}