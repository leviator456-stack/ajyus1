import Chat from "../models/chat.js";

export const clearChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required."
      });
    }

    const result = await Chat.deleteMany({ sessionId });

    return res.status(200).json({
      success: true,
      message: "Chat history cleared successfully.",
      deletedChats: result.deletedCount
    });
  } catch (error) {
    console.error("Clear chat history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to clear chat history."
    });
  }
};
