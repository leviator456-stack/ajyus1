import express from "express";
import { clearChatHistory } from "../controllers/settingsController.js";

const router = express.Router();

router.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Settings route working hai."
  });
});

router.delete("/clear-chat-history", clearChatHistory);

export default router;