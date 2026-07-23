import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";

const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const TEXT_REQUEST_TIMEOUT_MS = 30000;
const FILE_REQUEST_TIMEOUT_MS = 60000;

const RETRY_DELAY_MS = 500;

const SYSTEM_INSTRUCTION = `
You are AJYUS, a helpful AI assistant.
Answer clearly, accurately, and professionally.
Always identify yourself as AJYUS.
Do not mention or reveal the underlying AI provider, model name, API, SDK, or internal technical implementation.
Do not claim to be Google, Gemini, OpenAI, ChatGPT, or any other third-party assistant.
If the user asks which model or provider powers you, reply:
"I am AJYUS, an AI assistant. Technical provider details are not displayed in the chat interface."
`;

const GENERATION_CONFIG = {
  // Keeps normal chat responses fast while preserving good answer quality.
  thinking_level: "low"
};

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getErrorStatus(error) {
  return Number(
    error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      0
  );
}

function isRetryableError(error) {
  const status = getErrorStatus(error);

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
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("connection")
  );
}

function isAuthenticationError(error) {
  const status = getErrorStatus(error);

  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    message.includes("api key") ||
    message.includes("authentication") ||
    message.includes("permission denied")
  );
}

function createTimeoutError(model) {
  const error = new Error(
    `Gemini model ${model} request timed out.`
  );

  error.code = "AJYUS_TIMEOUT";

  return error;
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
        reject(createTimeoutError(model));
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

function getInteractionFileType(mimeType) {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "document";
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
        type: getInteractionFileType(
          mimeType
        ),

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

function getRequestTimeout(uploadedFiles) {
  return uploadedFiles.length
    ? FILE_REQUEST_TIMEOUT_MS
    : TEXT_REQUEST_TIMEOUT_MS;
}

function buildInteractionRequest(
  model,
  message,
  uploadedFiles,
  stream = false
) {
  return {
    model,

    input: buildInteractionInput(
      message,
      uploadedFiles
    ),

    system_instruction:
      SYSTEM_INSTRUCTION,

    generation_config:
      GENERATION_CONFIG,

    // AJYUS currently sends each request independently.
    // This prevents unnecessary server-side conversation storage.
    store: false,

    ...(stream ? { stream: true } : {})
  };
}

function validateChatRequest(
  message,
  planName
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

  return selectedPlan;
}

function createAIClient() {
  return new GoogleGenAI({
    apiKey: env.geminiApiKey
  });
}

function createTemporaryBusyError() {
  const error = new Error(
    "AJYUS is temporarily busy. Please try again in a moment."
  );

  error.statusCode = 503;

  return error;
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
    ai.interactions.create(
      buildInteractionRequest(
        model,
        message,
        validFiles,
        false
      )
    ),

    getRequestTimeout(validFiles),

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

      await wait(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

export async function generateChatReply(
  message,
  planName = "free",
  uploadedFiles = []
) {
  const selectedPlan =
    validateChatRequest(
      message,
      planName
    );

  const ai = createAIClient();

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

    if (primaryModel === FALLBACK_MODEL) {
      console.error(
        "Gemini model request failed:",
        primaryError
      );

      throw createTemporaryBusyError();
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

      throw createTemporaryBusyError();
    }
  }
}

async function getNextStreamEvent(
  iterator,
  timeoutMs,
  model
) {
  return withTimeout(
    iterator.next(),
    timeoutMs,
    model
  );
}

async function requestGeminiStream(
  ai,
  model,
  message,
  uploadedFiles = [],
  onChunk
) {
  const validFiles =
    getValidUploadedFiles(uploadedFiles);

  const timeoutMs =
    getRequestTimeout(validFiles);

  let hasStreamedOutput = false;
  let completeReply = "";

  try {
    const stream = await withTimeout(
      ai.interactions.create(
        buildInteractionRequest(
          model,
          message,
          validFiles,
          true
        )
      ),

      timeoutMs,

      model
    );

    const iterator =
      stream[Symbol.asyncIterator]();

    while (true) {
      // The timeout resets whenever a new stream event arrives.
      // This also protects AJYUS if the stream freezes midway.
      const result =
        await getNextStreamEvent(
          iterator,
          timeoutMs,
          model
        );

      if (result.done) {
        break;
      }

      const event = result.value;

      if (event?.event_type === "error") {
        const streamError = new Error(
          event?.error?.message ||
            "AJYUS streaming request failed."
        );

        streamError.code =
          event?.error?.code ||
          "AJYUS_STREAM_ERROR";

        throw streamError;
      }

      if (
        event?.event_type !== "step.delta" ||
        event?.delta?.type !== "text"
      ) {
        continue;
      }

      const textChunk =
        typeof event.delta.text === "string"
          ? event.delta.text
          : "";

      if (!textChunk) {
        continue;
      }

      hasStreamedOutput = true;
      completeReply += textChunk;

      await onChunk(textChunk);
    }

    if (!completeReply.trim()) {
      throw new Error(
        "Gemini returned an empty streaming response."
      );
    }

    return completeReply.trim();
  } catch (error) {
    error.hasStreamedOutput =
      hasStreamedOutput;

    throw error;
  }
}

async function requestStreamWithRetry(
  ai,
  model,
  message,
  uploadedFiles,
  onChunk,
  maximumAttempts
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    try {
      return await requestGeminiStream(
        ai,
        model,
        message,
        uploadedFiles,
        onChunk
      );
    } catch (error) {
      lastError = error;

      // Never retry after text has already reached the user.
      // Retrying at that point would duplicate the response.
      if (
        error?.hasStreamedOutput ||
        !isRetryableError(error) ||
        attempt === maximumAttempts
      ) {
        throw error;
      }

      console.warn(
        `Gemini streaming model ${model} failed. ` +
          `Retrying attempt ${attempt + 1}.`
      );

      await wait(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

export async function generateChatReplyStream(
  message,
  planName = "free",
  uploadedFiles = [],
  onChunk
) {
  const selectedPlan =
    validateChatRequest(
      message,
      planName
    );

  if (typeof onChunk !== "function") {
    throw new Error(
      "A streaming callback is required."
    );
  }

  const ai = createAIClient();

  const cleanMessage =
    message.trim();

  const validFiles =
    getValidUploadedFiles(uploadedFiles);

  const primaryModel =
    selectedPlan.model;

  try {
    return await requestStreamWithRetry(
      ai,
      primaryModel,
      cleanMessage,
      validFiles,
      onChunk,
      2
    );
  } catch (primaryError) {
    if (
      isAuthenticationError(
        primaryError
      ) ||
      primaryError?.hasStreamedOutput
    ) {
      throw primaryError;
    }

    if (primaryModel === FALLBACK_MODEL) {
      console.error(
        "Gemini streaming request failed:",
        primaryError
      );

      throw createTemporaryBusyError();
    }

    console.warn(
      `Switching streaming from ${primaryModel} ` +
        `to ${FALLBACK_MODEL}.`
    );

    try {
      return await requestStreamWithRetry(
        ai,
        FALLBACK_MODEL,
        cleanMessage,
        validFiles,
        onChunk,
        1
      );
    } catch (fallbackError) {
      console.error(
        "Gemini streaming primary and fallback models failed:",
        fallbackError
      );

      if (fallbackError?.hasStreamedOutput) {
        throw fallbackError;
      }

      throw createTemporaryBusyError();
    }
  }
}
