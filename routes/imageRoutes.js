import express from "express";
import multer from "multer";

import { generateImage } from "../controllers/imageController.js";
import { requireActiveSubscription } from "../middleware/subscription.middleware.js";

const router = express.Router();

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Sirf JPG, PNG aur WEBP images upload kar sakte hain."
        )
      );
    }

    callback(null, true);
  }
});

function imageUploadMiddleware(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "Uploaded image 10 MB se chhoti honi chahiye."
        });
      }

      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    return res.status(400).json({
      success: false,
      error:
        error.message ||
        "Image upload nahi ho paayi."
    });
  });
}

// Image route test
router.get("/test", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "AJYUS image route working hai."
  });
});

// Text-to-image aur image editing route
router.post(
  "/generate",
  requireActiveSubscription("image"),
  imageUploadMiddleware,
  generateImage
);

export default router;