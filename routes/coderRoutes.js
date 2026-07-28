import express from "express";

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

    return res.status(200).json({
      success: true,
      message: "AJYUS Coder API is ready.",
      prompt
    });
  } catch (error) {
    console.error("Coder route error:", error);

    return res.status(500).json({
      success: false,
      error: "Something went wrong."
    });
  }
});

export default router;
