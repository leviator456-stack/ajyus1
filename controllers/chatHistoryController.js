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

// Save a new chat history or update an existing one
export const saveChatHistory = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.body.sessionId);
    const historyId = req.body.historyId;
    const messages = cleanMessages(req.body.messages);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required."
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid message is required."
      });
    }

    // Update an existing chat
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
          error: "Chat history was not found."
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
        message: "Chat history updated successfully.",
        history: existingHistory
      });
    }

    // Create a new chat
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
      message: "Chat history saved successfully.",
      history
    });
  } catch (error) {
    console.error("Save chat history error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to save chat history."
    });
  }
};

// Get the recent chat list
export const getChatHistories = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required."
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
    console.error("Get chat histories error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to load recent chats."
    });
  }
};

// Get one complete chat
export const getChatHistoryById = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);
    const historyId = req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required."
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
        error: "Chat history was not found."
      });
    }

    return res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    console.error("Get chat history error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to open chat history."
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
        error: "sessionId is required."
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
        error: "Chat history was not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Chat history deleted successfully."
    });
  } catch (error) {
    console.error("Delete chat history error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to delete chat history."
    });
  }
};

// Delete all recent chats
export const clearChatHistories = async (req, res) => {
  try {
    const sessionId = cleanSessionId(req.query.sessionId);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required."
      });
    }

    const result = await ChatHistory.deleteMany({
      sessionId
    });

    return res.status(200).json({
      success: true,
      message: "All chat histories were deleted successfully.",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Clear chat histories error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to clear chat histories."
    });
  }
};
