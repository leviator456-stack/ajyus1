import express from "express";
import { clearChatHistory } from "../controllers/settingsController.js";

const router = express.Router();

router.delete("/clear-chat-history", clearChatHistory);

export default router;
