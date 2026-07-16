```js
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
    throw new Error(
      "A prompt is required to generate an image."
    );
  }

  const ai = getGeminiClient();

  let input = cleanPrompt;

  // Use image-editing mode when the user uploads an image
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
    throw new Error(
      "The Gemini API did not return an image."
    );
  }

  return {
    imageBase64: generatedImage.data,
    mimeType: "image/jpeg",
    model: IMAGE_MODEL
  };
}
```
