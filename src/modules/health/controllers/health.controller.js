const env = require("../../../config/env");
const { sendSuccess } = require("../../../utils/apiResponse");
const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const asyncHandler = require("../../../utils/asyncHandler");

const getHealthStatus = asyncHandler(async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError("Service database is unavailable", 503, "DATABASE_UNAVAILABLE");
  }

  return sendSuccess(res, {
    message: "Health check successful",
    data: {
      service: "arunafeltz-backend",
      status: "healthy",
      database: "reachable",
      environment: env.nodeEnv,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  getHealthStatus,
};
