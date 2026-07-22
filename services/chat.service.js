import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";

const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const TEXT_REQUEST_TIMEOUT_MS = 30000;
const FILE_REQUEST_TIMEOUT_MS = 60000;

const SYSTEM_INSTRUCTION = `
You are AJYUS, a helpful AI assistant.
Answer clearly, accurately, and professionally.
Always identify yourself as AJYUS.
Do not mention or reveal the underlying AI provider, model name, API, SDK, or internal technical implementation.
Do not claim to be Google, Gemini, OpenAI, ChatGPT, or any other third-party assistant.
If the user asks which model or provider powers you, reply:
"I am AJYUS, an AI assistant. Technical provider details are not displayed in the chat interface."
`;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryableError(error) {
  const status = Number(
    error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      0
  );

  const code = String(
    error?.code || ""
  ).toUpperCase();

  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    code === "AJYUS_TIMEOUT" ||
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network")
  );
}

function isAuthenticationError(error) {
  const status = Number(
    error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      0
  );

  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    message.includes("api key") ||
    message.includes("authentication")
  );
}

async function withTimeout(
  promise,
  timeoutMs,
  model
) {
  let timeoutId;

  const timeoutPromise = new Promise(
    (_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(
          `Gemini model ${model} request timed out.`
        );

        error.code = "AJYUS_TIMEOUT";
        reject(error);
      }, timeoutMs);
    }
  );

  try {
    return await Promise.race([
      promise,
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getValidUploadedFiles(uploadedFiles) {
  if (!Array.isArray(uploadedFiles)) {
    return [];
  }

  return uploadedFiles.filter((file) => {
    return (
      file &&
      Buffer.isBuffer(file.buffer) &&
      typeof file.mimetype === "string" &&
      file.mimetype.trim()
    );
  });
}

function buildInteractionInput(
  message,
  uploadedFiles
) {
  const validFiles =
    getValidUploadedFiles(uploadedFiles);

  if (!validFiles.length) {
    return message;
  }

  const fileInputs = validFiles.map(
    (file) => {
      const mimeType =
        file.mimetype.trim();

      return {
        type: mimeType.startsWith("image/")
          ? "image"
          : "document",

        data: file.buffer.toString(
          "base64"
        ),

        mime_type: mimeType
      };
    }
  );

  const fileNames = validFiles
    .map((file, index) => {
      return (
        file.originalname ||
        `attachment-${index + 1}`
      );
    })
    .join(", ");

  return [
    ...fileInputs,

    {
      type: "text",

      text:
        `${message}\n\n` +
        `The user attached these files: ${fileNames}. ` +
        "Use the attached files when answering the request."
    }
  ];
}

async function requestGeminiReply(
  ai,
  model,
  message,
  uploadedFiles = []
) {
  const validFiles =
    getValidUploadedFiles(uploadedFiles);

  const interaction = await withTimeout(
    ai.interactions.create({
      model,

      input: buildInteractionInput(
        message,
        validFiles
      ),

      system_instruction:
        SYSTEM_INSTRUCTION
    }),

    validFiles.length
      ? FILE_REQUEST_TIMEOUT_MS
      : TEXT_REQUEST_TIMEOUT_MS,

    model
  );

  const reply =
    interaction.output_text?.trim();

  if (!reply) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return reply;
}

async function requestWithRetry(
  ai,
  model,
  message,
  uploadedFiles,
  maximumAttempts
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    try {
      return await requestGeminiReply(
        ai,
        model,
        message,
        uploadedFiles
      );
    } catch (error) {
      lastError = error;

      if (
        !isRetryableError(error) ||
        attempt === maximumAttempts
      ) {
        throw error;
      }

      console.warn(
        `Gemini model ${model} failed. ` +
          `Retrying attempt ${attempt + 1}.`
      );

      await wait(500);
    }
  }

  throw lastError;
}

export async function generateChatReply(
  message,
  planName = "free",
  uploadedFiles = []
) {
  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    throw new Error(
      "A message is required."
    );
  }

  if (!env.geminiApiKey) {
    throw new Error(
      "The Gemini API key is not configured."
    );
  }

  const selectedPlan =
    getPlan(planName);

  if (!selectedPlan?.model) {
    throw new Error(
      "A valid subscription plan was not found."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey
  });

  const cleanMessage =
    message.trim();

  const validFiles =
    getValidUploadedFiles(uploadedFiles);

  const primaryModel =
    selectedPlan.model;

  try {
    return await requestWithRetry(
      ai,
      primaryModel,
      cleanMessage,
      validFiles,
      2
    );
  } catch (primaryError) {
    if (
      isAuthenticationError(
        primaryError
      )
    ) {
      throw primaryError;
    }

    console.warn(
      `Switching from ${primaryModel} ` +
        `to ${FALLBACK_MODEL}.`
    );

    try {
      return await requestWithRetry(
        ai,
        FALLBACK_MODEL,
        cleanMessage,
        validFiles,
        1
      );
    } catch (fallbackError) {
      console.error(
        "Gemini primary and fallback models failed:",
        fallbackError
      );

      const temporaryError =
        new Error(
          "AJYUS is temporarily busy. Please try again in a moment."
        );

      temporaryError.statusCode = 503;

      throw temporaryError;
    }
  }
}
