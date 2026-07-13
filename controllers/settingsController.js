import Chat from "../models/chat.js";

export const clearChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID nahi mili."
      });
    }

    const result = await Chat.deleteMany({ sessionId });

    return res.status(200).json({
      success: true,
      message: "Chat history successfully clear ho gayi.",
      deletedChats: result.deletedCount
    });
  } catch (error) {
    console.error("Clear chat history error:", error);

    return res.status(500).json({
      success: false,
      message: "Chat history clear nahi ho paayi."
    });
  }
};