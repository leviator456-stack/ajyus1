import express from "express";

import {
  generateVideo,
  getVideoStatus
} from "../controllers/videoController.js";

import requireVideoSubscription from "../middleware/requireVideoSubscription.js";

const router = express.Router();

// Generate a new AI video
router.post(
  "/generate",
  requireVideoSubscription,
  generateVideo
);

// Check video generation status
router.get(
  "/status/:taskId",
  requireVideoSubscription,
  getVideoStatus
);

export default router;
