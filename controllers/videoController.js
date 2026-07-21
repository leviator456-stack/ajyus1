import {
  createVideoTask,
  getVideoTaskStatus,
} from "../services/videoService.js";

// Start AI video generation
export const generateVideo = async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 5,
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: "A video prompt is required.",
      });
    }

    if (!req.subscription || !req.selectedPlan) {
      return res.status(403).json({
        success: false,
        message: "An active subscription is required.",
        redirectTo: "subscription.html",
      });
    }

    const videoTask = await createVideoTask({
      prompt: prompt.trim(),
      aspectRatio,
      duration,
    });

    // Count the video after the generation request is accepted
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
      remainingVideos,
    });
  } catch (error) {
    console.error("Video generation error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Video generation could not be started.",
    });
  }
};

// Check video generation status
export const getVideoStatus = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Video task ID is required.",
      });
    }

    const videoStatus = await getVideoTaskStatus(taskId);

    return res.status(200).json({
      success: true,
      taskId,
      status: videoStatus.status,
      videoUrl: videoStatus.videoUrl || null,
      error: videoStatus.error || null,
    });
  } catch (error) {
    console.error("Video status error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Video status could not be checked.",
    });
  }
};
