import express from "express";

import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionStatus,
  getCurrentSubscription
} from "../controllers/subscriptionController.js";

import {
  protectRoute
} from "../middleware/authMiddleware.js";

const router = express.Router();

/*
  Current active subscription
  GET /api/subscriptions/current/:userId
*/
router.get(
  "/current/:userId",
  getCurrentSubscription
);

/*
  Subscription status
  GET /api/subscriptions/status
*/
router.get(
  "/status",
  getSubscriptionStatus
);

/*
  Razorpay Order API
  User must be registered and logged in.
  POST /api/subscriptions/create-order
*/
router.post(
  "/create-order",
  protectRoute,
  createSubscriptionOrder
);

/*
  Payment signature verify and subscription activate.
  User must be registered and logged in.
  POST /api/subscriptions/verify-payment
*/
router.post(
  "/verify-payment",
  protectRoute,
  verifySubscriptionPayment
);

export default router;
