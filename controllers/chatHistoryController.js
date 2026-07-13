import mongoose from "mongoose";
import ChatHistory from "../models/chatHistory.js";

const cleanSessionId = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const cleanMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim()
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
      createdAt: message.createdAt
        ? new Date(message.createdAt)
        : new Date()
    }));
};

const createHistoryTitle = (messages) => {
  const firstUserMessage = messages.find(
    (message) => message.role === "user"
  );

  if (!firstUserMessage) {
    return "New Chat";
  }

  const title = firstUserMessage.content
    .replace(/\s+/g, " ")
    .trim();

  if (title.length <= 50) {
    return title;
  }

  return `${title.slice(0, 50)}...`;
};

// Save new history or update existing history
export const saveChatHistory = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.body.sessionId);
    const historyId = req.body.historyId;
    const messages = cleanMessages(req.body.messages);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId zaroori hai."
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Kam se kam ek valid message zaroori hai."
      });
    }

    // Existing chat update
    if (historyId) {
      if (!mongoose.Types.ObjectId.isValid(historyId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid history ID."
        });
      }

      const existingHistory = await ChatHistory.findOne({
        _id: historyId,
        sessionId
      });

      if (!existingHistory) {
        return res.status(404).json({
          success: false,
          error: "Chat history nahi mili."
        });
      }

      existingHistory.messages = messages;
      existingHistory.lastMessageAt = new Date();

      if (
        typeof req.body.title === "string" &&
        req.body.title.trim()
      ) {
        existingHistory.title = req.body.title.trim().slice(0, 120);
      } else if (
        !existingHistory.title ||
        existingHistory.title === "New Chat"
      ) {
        existingHistory.title = createHistoryTitle(messages);
      }

      await existingHistory.save();

      return res.status(200).json({
        success: true,
        message: "Chat history update ho gayi.",
        history: existingHistory
      });
    }

    // New chat create
    const title =
      typeof req.body.title === "string" &&
      req.body.title.trim()
        ? req.body.title.trim().slice(0, 120)
        : createHistoryTitle(messages);

    const history = await ChatHistory.create({
      sessionId,
      title,
      messages,
      lastMessageAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: "Chat history save ho gayi.",
      history
    });
  } catch (error) {
    console.error("Save chat history error:", error);

    return res.status(500).json({
      success: false,
      error: "Chat history save nahi ho paayi."
    });
  }
};

// Recents list
export const getChatHistories = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId zaroori hai."
      });
    }

    const histories = await ChatHistory.find({
      sessionId
    })
      .sort({
        lastMessageAt: -1,
        updatedAt: -1
      })
      .select(
        "title messages lastMessageAt createdAt updatedAt"
      )
      .lean();

    const recents = histories.map((history) => {
      const lastMessage =
        history.messages[history.messages.length - 1];

      return {
        _id: history._id,
        title: history.title,
        preview: lastMessage?.content || "",
        messageCount: history.messages.length,
        lastMessageAt: history.lastMessageAt,
        createdAt: history.createdAt,
        updatedAt: history.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      count: recents.length,
      histories: recents
    });
  } catch (error) {
    console.error("Get histories error:", error);

    return res.status(500).json({
      success: false,
      error: "Recents load nahi ho paaye."
    });
  }
};

// Open one complete chat
export const getChatHistoryById = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);
    const historyId = req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId zaroori hai."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(historyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid history ID."
      });
    }

    const history = await ChatHistory.findOne({
      _id: historyId,
      sessionId
    });

    if (!history) {
      return res.status(404).json({
        success: false,
        error: "Chat history nahi mili."
      });
    }

    return res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    console.error("Get single history error:", error);

    return res.status(500).json({
      success: false,
      error: "Chat history open nahi ho paayi."
    });
  }
};

// Delete one chat
export const deleteChatHistory = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);
    const historyId = req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId zaroori hai."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(historyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid history ID."
      });
    }

    const deletedHistory = await ChatHistory.findOneAndDelete({
      _id: historyId,
      sessionId
    });

    if (!deletedHistory) {
      return res.status(404).json({
        success: false,
        error: "Chat history nahi mili."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Chat history delete ho gayi."
    });
  } catch (error) {
    console.error("Delete history error:", error);

    return res.status(500).json({
      success: false,
      error: "Chat history delete nahi ho paayi."
    });
  }
};

// Delete all recents
export const clearChatHistories = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId zaroori hai."
      });
    }

    const result = await ChatHistory.deleteMany({
      sessionId
    });

    return res.status(200).json({
      success: true,
      message: "Saari chat history delete ho gayi.",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Clear histories error:", error);

    return res.status(500).json({
      success: false,
      error: "Chat histories clear nahi ho paayi."
    });
  }
};