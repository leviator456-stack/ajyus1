import express from "express";
import {
  generateVideo,
  getVideoStatus,
} from "../controllers/videoController.js";

import { requireActiveSubscription } from "../middleware/subscription.middleware.js";

const router = express.Router();

// Generate a new AI video
router.post(
  "/generate",
  requireActiveSubscription("video"),
  generateVideo
);

// Check video generation status
router.get(
  "/status/:taskId",
  requireActiveSubscription("video"),
  getVideoStatus
);

export default router;
