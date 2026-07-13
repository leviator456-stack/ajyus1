import { Router } from "express";

import { chatController } from "../controllers/chat.controller.js";
import { requireActiveSubscription } from "../middleware/subscription.middleware.js";

const router = Router();

router.post("/", requireActiveSubscription("chat"), chatController);

export default router;