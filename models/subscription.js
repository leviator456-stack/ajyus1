import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },

    planId: {
      type: String,
      required: true,
      enum: ["basic", "ultra", "ultra_pro"]
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
      enum: ["pending", "active", "expired", "cancelled", "failed"],
      default: "pending",
      index: true
    },

    razorpayOrderId: {
      type: String,
      required: true,
      index: true
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

    usedChats: {
      type: Number,
      default: 0
    },

    usedImages: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;