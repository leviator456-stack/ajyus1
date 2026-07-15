import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY .env file mein nahi mili.");
  }

  return new GoogleGenAI({
    apiKey
  });
}

export async function generateGeminiImage({
  prompt,
  uploadedImageBuffer = null,
  uploadedImageMimeType = "image/png",
  aspectRatio = "1:1",
  imageSize = "1K"
}) {
  const cleanPrompt = String(prompt || "").trim();

  if (!cleanPrompt) {
    throw new Error("Image generate karne ke liye prompt zaroori hai.");
  }

  const ai = getGeminiClient();

  let input = cleanPrompt;

  // Agar user ne image upload ki hai to image editing mode chalega
  if (uploadedImageBuffer) {
    input = [
      {
        type: "text",
        text: cleanPrompt
      },
      {
        type: "image",
        mime_type: uploadedImageMimeType,
        data: uploadedImageBuffer.toString("base64")
      }
    ];
  }

  const interaction = await ai.interactions.create({
    model: IMAGE_MODEL,
    input,
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: aspectRatio,
      image_size: imageSize
    }
  });

  const generatedImage = interaction.output_image;

  if (!generatedImage?.data) {
    throw new Error("Gemini API ne image return nahi ki.");
  }

  return {
    imageBase64: generatedImage.data,
    mimeType: "image/jpeg",
    model: IMAGE_MODEL
  };
}
