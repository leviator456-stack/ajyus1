import { GoogleGenAI } from "@google/genai";

const CODER_MODEL =
  process.env.GEMINI_CODER_MODEL ||
  "gemini-3.1-flash-lite";

export async function generateCoderResponse(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const finalPrompt = `
You are AJYUS Coder, a professional AI software developer.

The user will describe a website, application, feature, or code change.

Return ONLY valid JSON in this exact format:

{
  "message": "Short explanation of the work completed",
  "files": [
    {
      "path": "index.html",
      "action": "create",
      "content": "Complete file code"
    }
  ]
}

Rules:
- Do not return markdown.
- Do not use triple backticks.
- Return complete working file code.
- action must be either "create" or "update".
- File paths must be relative paths.
- Never include passwords, API keys, secrets, or environment values.
- Use professional and production-quality code.
- For a frontend website, create index.html, style.css and script.js when appropriate.

User request:
${prompt}
`;

  const response = await ai.models.generateContent({
    model: CODER_MODEL,
    contents: finalPrompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  const rawResponse = response.text?.trim();

  if (!rawResponse) {
    throw new Error("AI returned an empty response.");
  }

  let result;

  try {
    result = JSON.parse(rawResponse);
  } catch {
    console.error("Invalid coder JSON:", rawResponse);
    throw new Error("AI returned invalid JSON.");
  }

  if (!Array.isArray(result.files)) {
    result.files = [];
  }

  return {
    message:
      typeof result.message === "string"
        ? result.message
        : "Code generated successfully.",
    files: result.files
  };
}
