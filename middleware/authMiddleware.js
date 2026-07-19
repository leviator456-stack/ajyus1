import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function protectRoute(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization;

    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        error: "Please log in to continue."
      });
    }

    const token = authorizationHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Authentication token was not found."
      });
    }

    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(
      decodedToken.userId
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "The user associated with this account was not found."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);

    if (
      error?.name === "JsonWebTokenError" ||
      error?.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        error: "Your login session is invalid or has expired."
      });
    }

    return res.status(500).json({
      success: false,
      error: "Unable to authenticate the request."
    });
  }
}
