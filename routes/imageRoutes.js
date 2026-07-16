```js
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
          "Only JPG, PNG, and WEBP images can be uploaded."
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
          error: "The uploaded image must be smaller than 10 MB."
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
        "The image could not be uploaded."
    });
  });
}

// Image route test
router.get("/test", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "The AJYUS image route is working."
  });
});

// Text-to-image and image-editing route
router.post(
  "/generate",
  requireActiveSubscription("image"),
  imageUploadMiddleware,
  generateImage
);

export default router;
```
