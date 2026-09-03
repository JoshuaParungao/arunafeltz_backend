const app = require("./app");
const env = require("./config/env");
const logger = require("./utils/logger");
const prisma = require("./config/prisma");
const { initBackupScheduler } = require("./modules/backup/services/backupScheduler.service");
const { ensureDefaultSettings } = require("./modules/settings/services/setting.service");
const bcrypt = require("bcryptjs");

const ensureSchemaMigrations = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "warrantyDuration" TEXT;
      ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "warrantyDuration" TEXT;
      ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleEnabled" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleRatePercent" DECIMAL(7,4);
      ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildEnabled" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildRatePercent" DECIMAL(7,4);
    `);
    logger.info("Database schema self-check completed");
  } catch (err) {
    logger.warn("Database schema self-check warning", { error: err.message });
  }
};

const ensureDeveloperAccount = async () => {
  try {
    const username = "calix";
    const plainPassword = "calixdaven";
    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: "calix" },
          { email: "calix@arunafeltz.local" }
        ]
      }
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: "calix",
          firstName: "Calix",
          lastName: "Developer",
          fullName: "Calix",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
          branchId: null,
        }
      });
      logger.info("Developer account calix verified/updated");
    } else {
      await prisma.user.create({
        data: {
          username: "calix",
          email: "calix@arunafeltz.local",
          firstName: "Calix",
          lastName: "Developer",
          fullName: "Calix",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
          branchId: null,
        }
      });
      logger.info("Developer account calix created successfully");
    }
  } catch (err) {
    logger.warn("Developer account sync warning", { error: err.message });
  }
};

const server = app.listen(env.port, () => {
  logger.info("Arunafeltz Backend API started", {
    port: env.port,
    environment: env.nodeEnv,
  });
  initBackupScheduler();
  ensureSchemaMigrations();
  ensureDeveloperAccount();
  ensureDefaultSettings().catch((err) => {
    logger.warn("Initial settings sync warning", { error: err.message });
  });
});

let isShuttingDown = false;

const shutdown = (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Backend shutdown started", { signal });

  const forceTimer = setTimeout(() => {
    logger.error("Backend shutdown timed out", { signal });
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async (closeError) => {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error("Database disconnect failed", { message: disconnectError.message });
      exitCode = 1;
    }

    if (closeError) {
      logger.error("HTTP server close failed", { message: closeError.message });
      exitCode = 1;
    }
    process.exit(exitCode);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", {
    message: error.message,
    stack: error.stack,
  });

  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });

  process.exit(1);
});
