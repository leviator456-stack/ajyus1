export function errorHandler(error, req, res, next) {
  console.error("Backend error:", error);

  let statusCode = Number(
    error?.statusCode ||
    error?.status ||
    500
  );

  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    statusCode = 500;
  }

  const originalMessage =
    String(error?.message || "Request failed.");

  const containsTechnicalDetails =
    /gemini|google|api key|model|@google\/genai/i.test(
      originalMessage
    );

  let clientMessage = originalMessage;

  if (
    statusCode >= 500 ||
    containsTechnicalDetails
  ) {
    clientMessage =
      "AJYUS is temporarily unavailable. Please try again.";
  }

  return res.status(statusCode).json({
    success: false,
    error: clientMessage
  });
}
