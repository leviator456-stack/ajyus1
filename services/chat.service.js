import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";

const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION =
  "You are AJYUS, a helpful AI assistant. Answer clearly and professionally.";

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryableGeminiError(error) {
  const status = Number(
    error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      error?.cause?.status
  );

  const code = String(
    error?.code ??
      error?.error?.status ??
      error?.cause?.code ??
      ""
  ).toUpperCase();

  const message = String(error?.message || "").toLowerCase();

  const retryableStatuses = [
    408,
    429,
    500,
    502,
    503,
    504
  ];

  const retryableCodes = [
    "RESOURCE_EXHAUSTED",
    "INTERNAL",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED"
  ];

  const retryableMessages = [
    "high demand",
    "overloaded",
    "temporarily unavailable",
    "resource exhausted",
    "rate limit",
    "timeout",
    "timed out",
    "network error",
    "fetch failed"
  ];

  return (
    retryableStatuses.includes(status) ||
    retryableCodes.includes(code) ||
    retryableMessages.some((text) => message.includes(text))
  );
}

async function requestGeminiReply(ai, model, message) {
  const interaction = await ai.interactions.create({
    model,
    input: message,
    system_instruction: SYSTEM_INSTRUCTION
  });

  const reply = interaction.output_text?.trim();

  if (!reply) {
    throw new Error("Gemini returned an empty response.");
  }

  return reply;
}

async function requestWithRetry(
  ai,
  model,
  message,
  maximumAttempts = 4
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
        message
      );
    } catch (error) {
      lastError = error;

      const shouldRetry =
        isRetryableGeminiError(error) &&
        attempt < maximumAttempts;

      if (!shouldRetry) {
        throw error;
      }

      const baseDelay =
        1000 * 2 ** (attempt - 1);

      const randomDelay =
        Math.floor(Math.random() * 300);

      const delay =
        baseDelay + randomDelay;

      console.warn(
        `Gemini model ${model} failed. ` +
          `Retrying attempt ${attempt + 1} ` +
          `in ${delay}ms.`
      );

      await wait(delay);
    }
  }

  throw lastError;
}

export async function generateChatReply(
  message,
  planName = "free"
) {
  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    throw new Error("A message is required.");
  }

  if (!env.geminiApiKey) {
    throw new Error(
      "The Gemini API key is not configured."
    );
  }

  const selectedPlan = getPlan(planName);

  if (!selectedPlan || !selectedPlan.model) {
    throw new Error(
      "A valid subscription plan was not found."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey
  });

  const cleanMessage = message.trim();
  const primaryModel = selectedPlan.model;

  try {
    return await requestWithRetry(
      ai,
      primaryModel,
      cleanMessage,
      4
    );
  } catch (primaryError) {
    if (
      !isRetryableGeminiError(primaryError) ||
      primaryModel === FALLBACK_MODEL
    ) {
      throw primaryError;
    }

    console.warn(
      `Primary model ${primaryModel} is unavailable. ` +
        `Switching to ${FALLBACK_MODEL}.`
    );

    try {
      return await requestWithRetry(
        ai,
        FALLBACK_MODEL,
        cleanMessage,
        3
      );
    } catch (fallbackError) {
      console.error(
        "Primary and fallback Gemini models failed:",
        fallbackError
      );

      const temporaryError = new Error(
        "AJYUS is temporarily busy. Please try again in a moment."
      );

      temporaryError.statusCode = 503;

      throw temporaryError;
    }
  }
}
