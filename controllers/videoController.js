import { Readable } from "node:stream";

import {
  createVideoTask,
  getVideoTaskStatus
} from "../services/videoService.js";

// Start AI video generation
export const generateVideo = async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 8
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: "A video prompt is required."
      });
    }

    if (!req.subscription || !req.selectedPlan) {
      return res.status(403).json({
        success: false,
        message: "An active subscription is required.",
        redirectTo: "subscription.html"
      });
    }

    const videoTask = await createVideoTask({
      prompt: prompt.trim(),
      aspectRatio,
      duration
    });

    // Increase video usage after Google accepts the generation request
    req.subscription.usedVideos =
      (req.subscription.usedVideos || 0) + 1;

    await req.subscription.save();

    const videoLimit = req.selectedPlan.videoLimit;

    const remainingVideos =
      videoLimit === -1
        ? -1
        : Math.max(
            videoLimit - req.subscription.usedVideos,
            0
          );

    return res.status(202).json({
      success: true,
      message: "Video generation has started.",
      taskId: videoTask.taskId,
      status: videoTask.status,
      usedVideos: req.subscription.usedVideos,
      remainingVideos
    });
  } catch (error) {
    console.error("Video generation error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Video generation could not be started."
    });
  }
};

// Check video generation status or securely download the video
export const getVideoStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const shouldDownload = req.query.download === "1";

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Video task ID is required."
      });
    }

    const videoStatus = await getVideoTaskStatus(taskId);

    /*
      The frontend calls the same status endpoint with ?download=1
      after the video is complete.

      This keeps GEMINI_API_KEY hidden on the backend.
    */
    if (shouldDownload) {
      if (videoStatus.status === "processing") {
        return res.status(409).json({
          success: false,
          message: "The video is still being generated."
        });
      }

      if (
        videoStatus.status !== "completed" ||
        !videoStatus.videoUrl
      ) {
        return res.status(422).json({
          success: false,
          message:
            videoStatus.error ||
            "The generated video is not available."
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message:
            "GEMINI_API_KEY was not found in the environment variables."
        });
      }

      const videoResponse = await fetch(videoStatus.videoUrl, {
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey
        },
        redirect: "follow"
      });

      if (!videoResponse.ok) {
        const errorData = await videoResponse
          .json()
          .catch(() => ({}));

        throw new Error(
          errorData?.error?.message ||
            `Generated video download failed with status ${videoResponse.status}.`
        );
      }

      if (!videoResponse.body) {
        throw new Error(
          "The generated video file was empty."
        );
      }

      const contentType =
        videoResponse.headers.get("content-type") ||
        "video/mp4";

      const contentLength =
        videoResponse.headers.get("content-length");

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        'inline; filename="ajyus-video.mp4"'
      );
      res.setHeader("Cache-Control", "private, no-store");

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      const videoStream = Readable.fromWeb(
        videoResponse.body
      );

      videoStream.on("error", (streamError) => {
        console.error(
          "Video streaming error:",
          streamError
        );

        if (!res.destroyed) {
          res.destroy(streamError);
        }
      });

      videoStream.pipe(res);
      return;
    }

    return res.status(200).json({
      success: true,
      taskId,
      status: videoStatus.status,
      videoReady:
        videoStatus.status === "completed" &&
        Boolean(videoStatus.videoUrl),
      error: videoStatus.error || null
    });
  } catch (error) {
    console.error("Video status error:", error);

    if (res.headersSent) {
      return res.destroy(error);
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Video status could not be checked."
    });
  }
};
