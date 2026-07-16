export function errorHandler(error, req, res, next) {
  console.error("Backend error:", error);

  let statusCode = error.statusCode || 500;
  let message = error.message || "Server Error.";

  if (message.includes("API key")) {
    statusCode = 503;
  }

  return res.status(statusCode).json({
    success: false,
    error: message
  });
}
