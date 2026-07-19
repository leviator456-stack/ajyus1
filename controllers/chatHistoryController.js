import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import ChatHistory from "../models/chatHistory.js";

const cleanValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const cleanSessionId = (value) => {
  return cleanValue(value);
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

const createAuthenticationError = (message) => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

const getAuthenticatedUserId = (req) => {
  const middlewareUserId = cleanValue(
    req.user?._id ||
    req.user?.id
  );

  if (middlewareUserId) {
    return middlewareUserId;
  }

  const authorizationHeader = cleanValue(
    req.headers.authorization
  );

  if (!authorizationHeader) {
    return "";
  }

  if (!authorizationHeader.startsWith("Bearer ")) {
    throw createAuthenticationError(
      "Your login session is invalid."
    );
  }

  const token = authorizationHeader
    .slice(7)
    .trim();

  if (!token) {
    throw createAuthenticationError(
      "Authentication token was not found."
    );
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const userId = cleanValue(decodedToken?.userId);

    if (!userId) {
      throw createAuthenticationError(
        "The login token does not contain a valid user."
      );
    }

    return userId;
  } catch (error) {
    if (error?.statusCode === 401) {
      throw error;
    }

    throw createAuthenticationError(
      "Your login session is invalid or has expired."
    );
  }
};

const getRequestIdentity = (req) => {
  const sessionId = cleanSessionId(
    req.body?.sessionId ||
    req.query?.sessionId
  );

  const userId = getAuthenticatedUserId(req);

  return {
    sessionId,
    userId
  };
};

const getGuestOwnerFilter = (sessionId) => {
  return {
    sessionId,
    $or: [
      { userId: "" },
      { userId: null },
      { userId: { $exists: false } }
    ]
  };
};

const getOwnerFilter = ({ sessionId, userId }) => {
  if (userId) {
    return { userId };
  }

  return getGuestOwnerFilter(sessionId);
};

const connectOldSessionChatsToAccount = async ({
  sessionId,
  userId
}) => {
  if (!sessionId || !userId) {
    return;
  }

  await ChatHistory.updateMany(
    {
      sessionId,
      $or: [
        { userId: "" },
        { userId: null },
        { userId: { $exists: false } }
      ]
    },
    {
      $set: {
        userId
      }
    }
  );
};

const sendControllerError = (
  res,
  error,
  logMessage,
  publicMessage
) => {
  console.error(logMessage, error);

  if (error?.statusCode === 401) {
    return res.status(401).json({
      success: false,
      error: error.message
    });
  }

  return res.status(500).json({
    success: false,
    error: publicMessage
  });
};

// Save a new chat history or update an existing one
export const saveChatHistory = async (req, res) => {
  try {
    const { sessionId, userId } =
      getRequestIdentity(req);

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

    if (userId) {
      await connectOldSessionChatsToAccount({
        sessionId,
        userId
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

      const existingHistory =
        await ChatHistory.findOne({
          _id: historyId,
          ...getOwnerFilter({
            sessionId,
            userId
          })
        });

      if (!existingHistory) {
        return res.status(404).json({
          success: false,
          error: "Chat history was not found."
        });
      }

      existingHistory.messages = messages;
      existingHistory.lastMessageAt = new Date();

      if (userId) {
        existingHistory.userId = userId;
      }

      if (
        typeof req.body.title === "string" &&
        req.body.title.trim()
      ) {
        existingHistory.title = req.body.title
          .trim()
          .slice(0, 120);
      } else if (
        !existingHistory.title ||
        existingHistory.title === "New Chat"
      ) {
        existingHistory.title =
          createHistoryTitle(messages);
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
      userId: userId || "",
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
    return sendControllerError(
      res,
      error,
      "Save chat history error:",
      "Unable to save chat history."
    );
  }
};

// Get the recent chat list
export const getChatHistories = async (req, res) => {
  try {
    const { sessionId, userId } =
      getRequestIdentity(req);

    if (!sessionId && !userId) {
      return res.status(400).json({
        success: false,
        error: "A user account or sessionId is required."
      });
    }

    if (userId) {
      await connectOldSessionChatsToAccount({
        sessionId,
        userId
      });
    }

    const histories = await ChatHistory.find(
      getOwnerFilter({
        sessionId,
        userId
      })
    )
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
        history.messages[
          history.messages.length - 1
        ];

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
    return sendControllerError(
      res,
      error,
      "Get chat histories error:",
      "Unable to load recent chats."
    );
  }
};

// Get one complete chat
export const getChatHistoryById = async (req, res) => {
  try {
    const { sessionId, userId } =
      getRequestIdentity(req);

    const historyId = req.params.id;

    if (!sessionId && !userId) {
      return res.status(400).json({
        success: false,
        error: "A user account or sessionId is required."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(historyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid history ID."
      });
    }

    if (userId) {
      await connectOldSessionChatsToAccount({
        sessionId,
        userId
      });
    }

    const history = await ChatHistory.findOne({
      _id: historyId,
      ...getOwnerFilter({
        sessionId,
        userId
      })
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
    return sendControllerError(
      res,
      error,
      "Get chat history error:",
      "Unable to open chat history."
    );
  }
};

// Delete one chat
export const deleteChatHistory = async (req, res) => {
  try {
    const { sessionId, userId } =
      getRequestIdentity(req);

    const historyId = req.params.id;

    if (!sessionId && !userId) {
      return res.status(400).json({
        success: false,
        error: "A user account or sessionId is required."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(historyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid history ID."
      });
    }

    if (userId) {
      await connectOldSessionChatsToAccount({
        sessionId,
        userId
      });
    }

    const deletedHistory =
      await ChatHistory.findOneAndDelete({
        _id: historyId,
        ...getOwnerFilter({
          sessionId,
          userId
        })
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
    return sendControllerError(
      res,
      error,
      "Delete chat history error:",
      "Unable to delete chat history."
    );
  }
};

// Delete all recent chats
export const clearChatHistories = async (req, res) => {
  try {
    const { sessionId, userId } =
      getRequestIdentity(req);

    if (!sessionId && !userId) {
      return res.status(400).json({
        success: false,
        error: "A user account or sessionId is required."
      });
    }

    if (userId) {
      await connectOldSessionChatsToAccount({
        sessionId,
        userId
      });
    }

    const result = await ChatHistory.deleteMany(
      getOwnerFilter({
        sessionId,
        userId
      })
    );

    return res.status(200).json({
      success: true,
      message:
        "All chat histories were deleted successfully.",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Clear chat histories error:",
      "Unable to clear chat histories."
    );
  }
};
