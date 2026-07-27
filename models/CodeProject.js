import mongoose from "mongoose";

const codeProjectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    ownerId: {
      type: String,
      required: true,
      index: true
    },

    projectName: {
      type: String,
      required: true,
      trim: true,
      default: "My Website"
    },

    files: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    framework: {
      type: String,
      default: "html-css-javascript"
    },

    status: {
      type: String,
      enum: [
        "draft",
        "ready",
        "deploying",
        "deployed",
        "failed"
      ],
      default: "draft"
    },

    frontendUrl: {
      type: String,
      default: ""
    },

    backendUrl: {
      type: String,
      default: ""
    },

    customDomain: {
      type: String,
      default: ""
    },

    lastSavedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

const CodeProject =
  mongoose.models.CodeProject ||
  mongoose.model(
    "CodeProject",
    codeProjectSchema
  );

export default CodeProject;
