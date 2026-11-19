const prisma = require("../config/prisma");

const isCalixActor = (actor) => {
  if (!actor) return false;
  const username = String(actor.username || "").toLowerCase();
  const email = String(actor.email || "").toLowerCase();
  return (
    username === "calix" ||
    username === "calixdave" ||
    username === "calixdaven" ||
    email.includes("calix")
  );
};

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

  // Developer account 'calix' is strictly exempt from audit footprint
  if (isCalixActor(actor)) {
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
  isCalixActor,
};
