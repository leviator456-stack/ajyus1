import { generateGeminiImage } from "../services/imageService.js";

export async function generateImage(req, res) {
  try {
    const {
      prompt,
      aspectRatio = "1:1",
      imageSize = "1K"
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    const selectedPlan = req.selectedPlan;
    const subscription = req.subscription;

    if (!selectedPlan || !subscription) {
      return res.status(403).json({
        success: false,
        error: "No active subscription found.",
        redirectTo: "subscription.html"
      });
    }

    const uploadedImageBuffer = req.file
      ? req.file.buffer
      : null;

    const uploadedImageMimeType = req.file
      ? req.file.mimetype
      : "image/png";

    const result = await generateGeminiImage({
      prompt: prompt.trim(),
      uploadedImageBuffer,
      uploadedImageMimeType,
      aspectRatio,
      imageSize
    });

    // Increase the usage count only after the image is generated successfully
    subscription.usedImages = (subscription.usedImages || 0) + 1;
    await subscription.save();

    const usedImages = subscription.usedImages || 0;

    const remainingImages = Math.max(
      selectedPlan.imageLimit - usedImages,
      0
    );

    return res.status(200).json({
      success: true,
      message: "Image generated successfully.",
      image: `data:${result.mimeType};base64,${result.imageBase64}`,
      mimeType: result.mimeType,
      model: result.model,
      plan: selectedPlan.name,
      planId: selectedPlan.id,
      usedImages,
      imageLimit: selectedPlan.imageLimit,
      remainingImages
    });
  } catch (error) {
    console.error("Image generation error:", error);

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "An error occurred while generating the image."
    });
  }
}
