import express from "express";

import {
  createVideoOrder,
  verifyVideoPayment,
  getVideoSubscriptionStatus
} from "../controllers/videoSubscriptionController.js";

const router = express.Router();

// Video plan ka Razorpay order create karega
router.post("/create-order", createVideoOrder);

// Successful payment verify karega
router.post("/verify-payment", verifyVideoPayment);

// Current user's video subscription check karega
router.get("/status", getVideoSubscriptionStatus);

// User ID ke through subscription check karega
router.get(
  "/current/:userId",
  getVideoSubscriptionStatus
);

export default router;
