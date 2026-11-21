const prisma = require("../config/prisma");
const logger = require("./logger");

const ALLOWED_RESTORE_FIELDS = new Set([
  "itemName",
  "description",
  "barcode",
  "brand",
  "modelName",
  "status",
  "isSerialized",
  "hasWarranty",
  "categoryId",
  "unitId",
  "costPrice",
  "price1",
  "price2",
  "price3",
  "price4",
  "price5",
  "minimumStock",
  "reorderLevel",
]);

const restoreUserEditsFromAuditLog = async () => {
  try {
    logger.info("Starting automated restoration of user edits from AuditLog...");

    // Find all item update audit logs in chronological order
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: "ITEM_UPDATED",
        entityType: "Item",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (auditLogs.length === 0) {
      logger.info("No ITEM_UPDATED audit logs found to restore.");
      return { count: 0 };
    }

    logger.info(`Found ${auditLogs.length} ITEM_UPDATED audit logs to replay.`);

    let restoredCount = 0;
    let failedCount = 0;

    for (const log of auditLogs) {
      try {
        let metadata = log.metadata;
        if (typeof metadata === "string") {
          try {
            metadata = JSON.parse(metadata);
          } catch (e) {
            metadata = {};
          }
        }

        const changes = metadata?.changes || {};
        const updateData = {};

        for (const [field, change] of Object.entries(changes)) {
          if (!ALLOWED_RESTORE_FIELDS.has(field)) continue;
          const toVal = change?.to;
          if (toVal === undefined) continue;

          if (field === "hasWarranty" || field === "isSerialized") {
            updateData[field] = Boolean(toVal);
          } else if (
            [
              "costPrice",
              "price1",
              "price2",
              "price3",
              "price4",
              "price5",
              "minimumStock",
              "reorderLevel",
            ].includes(field)
          ) {
            if (toVal !== null && toVal !== "" && toVal !== undefined) {
              const num = Number(toVal);
              if (!Number.isNaN(num)) {
                updateData[field] = num;
              }
            }
          } else if (
            [
              "itemName",
              "description",
              "barcode",
              "brand",
              "modelName",
              "status",
              "categoryId",
              "unitId",
            ].includes(field)
          ) {
            updateData[field] = toVal === null ? null : String(toVal);
          }
        }

        // Fallback: If metadata.changes had no fields, try parsing from description
        if (Object.keys(updateData).length === 0 && log.description) {
          const parts = log.description.split(",");
          for (const part of parts) {
            const match = part.match(/(\w+):\s*(.*?)\s*->\s*(.*)/);
            if (match) {
              const field = match[1].trim();
              const toVal = match[3].trim();
              if (ALLOWED_RESTORE_FIELDS.has(field)) {
                if (field === "hasWarranty" || field === "isSerialized") {
                  updateData[field] = toVal === "true";
                } else if (
                  [
                    "costPrice",
                    "price1",
                    "price2",
                    "price3",
                    "price4",
                    "price5",
                    "minimumStock",
                    "reorderLevel",
                  ].includes(field)
                ) {
                  const num = Number(toVal);
                  if (!Number.isNaN(num)) updateData[field] = num;
                } else {
                  updateData[field] = toVal === "none" ? null : toVal;
                }
              }
            }
          }
        }

        if (Object.keys(updateData).length === 0) {
          continue;
        }

        // Apply update to the item
        if (log.entityId) {
          const itemExists = await prisma.item.findUnique({
            where: { id: log.entityId },
            select: { id: true, itemCode: true },
          });

          if (itemExists) {
            await prisma.item.update({
              where: { id: log.entityId },
              data: updateData,
            });

            // Also mirror metadata & warranty & prices across branches for matching itemCode
            if (itemExists.itemCode) {
              const sharedData = { ...updateData };
              delete sharedData.categoryId;
              delete sharedData.unitId;

              if (Object.keys(sharedData).length > 0) {
                await prisma.item.updateMany({
                  where: {
                    itemCode: itemExists.itemCode,
                    id: { not: itemExists.id },
                  },
                  data: sharedData,
                });
              }
            }

            restoredCount++;
          } else if (metadata?.itemCode) {
            const sharedData = { ...updateData };
            delete sharedData.categoryId;
            delete sharedData.unitId;

            if (Object.keys(sharedData).length > 0) {
              await prisma.item.updateMany({
                where: { itemCode: metadata.itemCode },
                data: sharedData,
              });
              restoredCount++;
            }
          }
        }
      } catch (itemErr) {
        logger.warn(`Failed restoring item from audit log ${log.id}: ${itemErr.message}`);
        failedCount++;
      }
    }

    logger.info(
      `Restoration from audit log finished: successfully restored ${restoredCount} records (${failedCount} failed).`
    );
    return { restoredCount, failedCount };
  } catch (err) {
    logger.error("Failed during audit log restoration process", { error: err.message });
    throw err;
  }
};

module.exports = {
  restoreUserEditsFromAuditLog,
};
