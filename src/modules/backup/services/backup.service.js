const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");

const ALLOWED_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const TABLES_IN_ORDER = [
  "branch",
  "user",
  "setting",
  "itemCategory",
  "unit",
  "item",
  "inventoryBatch",
  "itemSerial",
  "inventoryMovement",
  "customer",
  "supplier",
  "purchaseOrder",
  "purchaseOrderItem",
  "purchaseReceiving",
  "purchaseReceivingItem",
  "purchaseReceivingSerial",
  "stockTransfer",
  "stockTransferItem",
  "stockTransferSerial",
  "stockTransferDispatchAllocation",
  "stockTransferAllocation",
  "quotation",
  "quotationItem",
  "sale",
  "saleItem",
  "salePayment",
  "creditAccount",
  "creditCollection",
  "creditSchedule",
  "cashBox",
  "cashTransaction",
  "cashHandover",
  "cashHandoverRecipient",
  "serviceJob",
  "servicePayment",
  "warrantyClaim",
  "returnRequest",
  "returnItem",
  "deliveryReceipt",
  "deliveryReceiptItem",
  "incentive",
  "auditLog",
];

const generateDatabaseSnapshot = async (actor = null) => {
  const data = {};
  const counts = {};
  let totalRecords = 0;

  for (const modelKey of TABLES_IN_ORDER) {
    if (prisma[modelKey] && typeof prisma[modelKey].findMany === "function") {
      try {
        const rows = await prisma[modelKey].findMany();
        data[modelKey] = rows;
        counts[modelKey] = rows.length;
        totalRecords += rows.length;
      } catch {
        data[modelKey] = [];
        counts[modelKey] = 0;
      }
    }
  }

  const rawString = JSON.stringify(data);
  const checksum = crypto.createHash("sha256").update(rawString).digest("hex");

  const snapshot = {
    version: "1.0.0",
    system: "Arunafeltz Cloud POS & Business Management",
    exportedAt: new Date().toISOString(),
    exportedBy: actor
      ? {
          id: actor.id,
          username: actor.username,
          fullName: actor.fullName,
          role: actor.role,
        }
      : { system: "Automated Scheduler (PHT)" },
    checksum,
    metadata: {
      totalRecords,
      tableCounts: counts,
    },
    data,
  };

  return snapshot;
};

const restoreDatabaseSnapshot = async ({ backupData, actor, password }) => {
  if (!actor || !ALLOWED_ROLES.has(actor.role)) {
    throw new AppError(
      "Only Super Owner, Branch Owner, or Admin can restore the database.",
      403,
      "FORBIDDEN"
    );
  }

  if (!password) {
    throw new AppError(
      "Password confirmation is required to restore the database.",
      400,
      "PASSWORD_REQUIRED"
    );
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, passwordHash: true },
  });

  if (!userRecord || !userRecord.passwordHash) {
    throw new AppError("Authentication failed", 401, "AUTHENTICATION_FAILED");
  }

  const isPasswordValid = await bcrypt.compare(password, userRecord.passwordHash);
  if (!isPasswordValid) {
    throw new AppError("Incorrect password. Database restore cancelled.", 400, "INVALID_PASSWORD");
  }

  const tablesData = backupData.data;
  if (!tablesData || typeof tablesData !== "object") {
    throw new AppError("Invalid backup file: missing tables data.", 400, "INVALID_BACKUP");
  }

  return await prisma.$transaction(async (tx) => {
    // Delete in reverse dependency order
    const reverseTables = [...TABLES_IN_ORDER].reverse();
    for (const modelKey of reverseTables) {
      if (tx[modelKey] && typeof tx[modelKey].deleteMany === "function") {
        try {
          await tx[modelKey].deleteMany({});
        } catch (e) {
          // ignore if table doesn't exist
        }
      }
    }

    // Insert in forward dependency order
    const restoredCounts = {};
    for (const modelKey of TABLES_IN_ORDER) {
      const rows = tablesData[modelKey];
      if (Array.isArray(rows) && rows.length > 0 && tx[modelKey]) {
        try {
          // Create in chunks of 50 to avoid parameter limits
          const chunkSize = 50;
          for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            await tx[modelKey].createMany({
              data: chunk,
              skipDuplicates: true,
            });
          }
          restoredCounts[modelKey] = rows.length;
        } catch (err) {
          // Attempt individual inserts if batch has constraints
          let inserted = 0;
          for (const row of rows) {
            try {
              await tx[modelKey].create({ data: row });
              inserted += 1;
            } catch {
              // skip unresolvable row
            }
          }
          restoredCounts[modelKey] = inserted;
        }
      } else {
        restoredCounts[modelKey] = 0;
      }
    }

    await createAuditLog(
      {
        actor,
        branchId: actor.branchId || null,
        action: "DATABASE_RESTORED",
        entityType: "Database",
        entityId: "system-database",
        description: `Full database restored from backup dated ${backupData.exportedAt || "unknown"}.`,
        metadata: {
          restoredCounts,
          backupVersion: backupData.version || "1.0.0",
          restoredBy: actor.username,
        },
      },
      tx
    );

    return {
      success: true,
      restoredCounts,
      restoredAt: new Date().toISOString(),
    };
  }, {
    timeout: 60000,
    maxWait: 10000,
  });
};

module.exports = {
  ALLOWED_ROLES,
  generateDatabaseSnapshot,
  restoreDatabaseSnapshot,
};
