import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true
    },

    title: {
      type: String,
      default: "New Chat"
    },

    messages: {
      type: Array,
      default: []
    }
  },
  {
    timestamps: true
  }
);

const Chat =
  mongoose.models.Chat || mongoose.model("Chat", chatSchema);

export default Chat;