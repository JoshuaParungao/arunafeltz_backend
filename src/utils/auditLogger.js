const prisma = require("../config/prisma");

const isCalixActor = () => false;

const createAuditLog = async (
  {
    actor,
    branchId = null,
    action,
    entityType,
    entityId = null,
    description = null,
    metadata = null,
    ipAddress = null,
    userAgent = null,
  },
  client = prisma
) => {
  if (!action || !entityType) {
    return null;
  }

  const effectiveBranchId = branchId || actor?.branchId || actor?.branch?.id || null;

  try {
    return await client.auditLog.create({
      data: {
        actorId: actor?.id || null,
        branchId: effectiveBranchId,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        description,
        metadata: metadata || undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error("Failed to create audit log:", err.message);
    return null;
  }
};

module.exports = {
  createAuditLog,
  isCalixActor,
};
