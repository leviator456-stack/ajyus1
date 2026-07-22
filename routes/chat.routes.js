import { Router } from "express";
import multer from "multer";

import { chatController } from "../controllers/chat.controller.js";
import { requireActiveSubscription } from "../middleware/subscription.middleware.js";

const router = Router();

const allowedMimeTypes = [
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",

  // PDF and text
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",

  // Microsoft documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Only images, PDF, TXT, CSV, Word and Excel files can be uploaded."
        )
      );
    }

    return callback(null, true);
  }
});

function chatUploadMiddleware(req, res, next) {
  upload.array("files", 5)(req, res, error => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "Each uploaded file must not exceed 10 MB."
        });
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,
          error: "You can upload a maximum of 5 files."
        });
      }

      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    return res.status(400).json({
      success: false,
      error: error.message || "File upload failed."
    });
  });
}

router.post(
  "/",
  requireActiveSubscription("chat"),
  chatUploadMiddleware,
  chatController
);

export default router;
