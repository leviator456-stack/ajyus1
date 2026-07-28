import express from "express";
import { generateCoderResponse } from "../services/coder.service.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
  try {
    const prompt =
      typeof req.body?.prompt === "string"
        ? req.body.prompt.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Please enter a coding prompt."
      });
    }

    const result = await generateCoderResponse(prompt);

    return res.status(200).json({
      success: true,
      message: result.message,
      files: result.files
    });
  } catch (error) {
    console.error("Coder route error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to generate code."
    });
  }
});

export default router;
