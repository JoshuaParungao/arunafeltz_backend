const prisma = require("../config/prisma");

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

  return client.auditLog.create({
    data: {
      actorId: actor?.id || null,
      branchId,
      action,
      entityType,
      entityId,
      description,
      metadata,
      ipAddress,
      userAgent,
    },
  });
};

module.exports = {
  createAuditLog,
};
