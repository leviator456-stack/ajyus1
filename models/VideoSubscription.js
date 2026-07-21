import mongoose from "mongoose";

const videoSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },

    planId: {
      type: String,
      required: true,
      enum: ["video_basic", "video_pro", "video_ultra"]
    },

    planName: {
      type: String,
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: "INR"
    },

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "expired",
        "cancelled",
        "failed"
      ],
      default: "pending"
    },

    razorpayOrderId: {
      type: String,
      default: null
    },

    razorpayPaymentId: {
      type: String,
      default: null
    },

    startDate: {
      type: Date,
      default: null
    },

    endDate: {
      type: Date,
      default: null
    },

    usedVideos: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const VideoSubscription =
  mongoose.models.VideoSubscription ||
  mongoose.model(
    "VideoSubscription",
    videoSubscriptionSchema
  );

export default VideoSubscription;
