import express from "express";
import {
  registerUser,
  loginUser,
  getCurrentUser
} from "../controllers/authController.js";
import { protectRoute } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create a new account
router.post("/register", registerUser);

// Log in to an existing account
router.post("/login", loginUser);

// Get the currently logged-in user
router.get("/me", protectRoute, getCurrentUser);

export default router;
