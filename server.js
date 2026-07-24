import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";

import chatRoutes from "./routes/chat.routes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import videoSubscriptionRoutes from "./routes/videoSubscriptionRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import chatHistoryRoutes from "./routes/chatHistoryRoutes.js";
import imageRoutes from "./routes/imageRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import razorpayWebhookRoutes from "./routes/razorpayWebhookRoutes.js";

import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

/*
  Static frontend files agar backend ke public folder mein hain
  to yahan se serve hongi.
*/
app.use(express.static("public"));

/*
  CORS middleware
  Localhost + live domain dono allow.
*/
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://ajyus.com",
  "https://www.ajyus.com",
  "http://ajyus.com",
  "http://www.ajyus.com",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      /*
        Origin undefined tab hota hai jab request same server,
        Postman, browser direct URL, mobile app ya Razorpay
        server se aaye.
      */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true);
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-User-Id",
      "X-AJYUS-User-Id",
      "X-Razorpay-Signature"
    ],

    credentials: true
  })
);

/*
  Razorpay webhook route.

  IMPORTANT:
  Is route ko express.json() se pehle hi rehna chahiye,
  kyunki webhook signature verify karne ke liye raw body
  ki zarurat hoti hai.
*/
app.use(
  "/api/webhooks/razorpay",
  razorpayWebhookRoutes
);

// Normal body parser middleware
app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);

// Backend health check
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "AJYUS backend is running."
  });
});

// Direct settings test route
app.get("/api/settings/direct-test", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Server.js ka direct route working hai."
  });
});

/*
  Main API routes
*/
app.use("/api/chat", chatRoutes);

app.use(
  "/api/subscriptions",
  subscriptionRoutes
);

app.use(
  "/api/video-subscriptions",
  videoSubscriptionRoutes
);

app.use(
  "/api/settings",
  settingsRoutes
);

app.use(
  "/api/images",
  imageRoutes
);

app.use(
  "/api/videos",
  videoRoutes
);

app.use(
  "/api/auth",
  authRoutes
);

/*
  Dono routes rakhe hain taaki old frontend aur new frontend
  dono kaam kar sakein.
*/
app.use(
  "/api/history",
  chatHistoryRoutes
);

app.use(
  "/api/chat-history",
  chatHistoryRoutes
);

// Invalid API route
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: "API route nahi mila.",
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Start backend server
const PORT =
  Number(process.env.PORT || env?.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `AJYUS backend port ${PORT} par chal raha hai.`
  );

  connectDatabase()
    .then((connected) => {
      if (connected) {
        console.log(
          "MongoDB database successfully connect ho gaya."
        );
      } else {
        console.error(
          "Server chal raha hai, lekin MongoDB connect nahi hua."
        );
      }
    })
    .catch((error) => {
      console.error(
        "MongoDB background connection error:",
        error.message
      );
    });
});
