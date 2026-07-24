import express from "express";
import {
  handleRazorpayWebhook
} from "../controllers/razorpayWebhookController.js";

const router = express.Router();

/*
 * Razorpay signature verification ke liye
 * request body raw Buffer honi chahiye.
 */
router.post(
  "/",
  express.raw({
    type: "application/json"
  }),
  handleRazorpayWebhook
);

export default router;
