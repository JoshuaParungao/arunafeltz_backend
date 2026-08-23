const env = require("../config/env");
const logger = require("../utils/logger");

const globalErrorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    logger.error("Server error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message,
      stack: error.stack,
    });
  } else {
    logger.warn("Client error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code,
      message: error.message,
    });
  }

  const response = {
    success: false,
    error: {
      code: error.code || "INTERNAL_SERVER_ERROR",
      message:
        error.isOperational === true
          ? error.message
          : "Something went wrong. Please try again later.",
    },
  };

  if (env.nodeEnv === "development") {
    response.error.details = {
      name: error.name,
      stack: error.stack,
    };
  }

  return res.status(statusCode).json(response);
};

module.exports = globalErrorHandler;
