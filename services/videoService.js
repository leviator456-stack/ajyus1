const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const VIDEO_MODEL =
  process.env.GEMINI_VIDEO_MODEL ||
  "veo-3.1-generate-preview";

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY was not found in the environment variables."
    );
  }

  return apiKey;
};

const readApiResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Gemini video API request failed with status ${response.status}.`
    );
  }

  return data;
};

// Start a new video generation task
export const createVideoTask = async ({
  prompt,
  aspectRatio = "16:9",
  duration = 8,
}) => {
  const apiKey = getApiKey();

  const allowedAspectRatios = ["16:9", "9:16"];
  const selectedAspectRatio = allowedAspectRatios.includes(aspectRatio)
    ? aspectRatio
    : "16:9";

  const allowedDurations = [4, 6, 8];
  const selectedDuration = allowedDurations.includes(Number(duration))
    ? Number(duration)
    : 8;

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${VIDEO_MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt,
          },
        ],
        parameters: {
          aspectRatio: selectedAspectRatio,
          durationSeconds: String(selectedDuration),
          resolution: "720p",
          numberOfVideos: 1,
        },
      }),
    }
  );

  const data = await readApiResponse(response);

  if (!data.name) {
    throw new Error(
      "The video generation task ID was not returned."
    );
  }

  return {
    taskId: data.name,
    status: data.done ? "completed" : "processing",
  };
};

// Check an existing video task
export const getVideoTaskStatus = async (taskId) => {
  const apiKey = getApiKey();
  const cleanTaskId = taskId.replace(/^\/+/, "");

  const response = await fetch(
    `${GEMINI_API_BASE}/${cleanTaskId}`,
    {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
      },
    }
  );

  const data = await readApiResponse(response);

  if (data.error) {
    return {
      status: "failed",
      videoUrl: null,
      error:
        data.error.message || "Video generation failed.",
    };
  }

  if (!data.done) {
    return {
      status: "processing",
      videoUrl: null,
      error: null,
    };
  }

  const videoUrl =
    data?.response?.generateVideoResponse
      ?.generatedSamples?.[0]?.video?.uri ||
    data?.response?.generatedVideos?.[0]?.video?.uri ||
    null;

  if (!videoUrl) {
    return {
      status: "failed",
      videoUrl: null,
      error:
        "The video was completed, but its URL was not returned.",
    };
  }

  return {
    status: "completed",
    videoUrl,
    error: null,
  };
};
