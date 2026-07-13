import express from "express";

import {
  saveChatHistory,
  getChatHistories,
  getChatHistoryById,
  deleteChatHistory,
  clearChatHistories
} from "../controllers/chatHistoryController.js";

const router = express.Router();

router.post("/save", saveChatHistory);

router.get("/", getChatHistories);

router.get("/:id", getChatHistoryById);

router.delete("/", clearChatHistories);

router.delete("/:id", deleteChatHistory);

export default router;