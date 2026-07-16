import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY was not found in the environment variables."
    );
  }

  return new GoogleGenAI({ apiKey });
}

export async function generateGeminiImage({
  prompt,
  uploadedImageBuffer = null,
  uploadedImageMimeType = "image/png"
}) {
  const cleanPrompt = String(prompt || "").trim();

  if (!cleanPrompt) {
    throw new Error("A prompt is required to generate an image.");
  }

  const ai = getGeminiClient();

  const parts = [];

  if (uploadedImageBuffer) {
    parts.push({
      inlineData: {
        mimeType: uploadedImageMimeType,
        data: uploadedImageBuffer.toString("base64")
      }
    });
  }

  parts.push({
    text: cleanPrompt
  });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: "user",
        parts
      }
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  });

  const responseParts =
    response?.candidates?.[0]?.content?.parts || [];

  const imagePart = responseParts.find(
    (part) => part?.inlineData?.data
  );

  if (!imagePart) {
    throw new Error("The Gemini API did not return an image.");
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
    model: IMAGE_MODEL
  };
}
