import express from "express";

import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionStatus,
  getCurrentSubscription
} from "../controllers/subscriptionController.js";

const router = express.Router();

/*
  Current active subscription
  GET /api/subscriptions/current/:userId
*/
router.get("/current/:userId", getCurrentSubscription);

/*
  Subscription status
  GET /api/subscriptions/status
*/
router.get("/status", getSubscriptionStatus);

/*
  Razorpay Order API
  POST /api/subscriptions/create-order
*/
router.post("/create-order", createSubscriptionOrder);

/*
  Payment signature verify and subscription activate
  POST /api/subscriptions/verify-payment
*/
router.post("/verify-payment", verifySubscriptionPayment);

export default router;