const fs = require("fs");
const path = require("path");

const root = process.cwd();

const writeFile = (filePath, content) => {
  fs.writeFileSync(path.join(root, filePath), content);
};

writeFile(
  "src/utils/auditLogger.js",
`const prisma = require("../config/prisma");

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
`
);

const supplierServicePath = path.join(
  root,
  "src/modules/suppliers/services/supplier.service.js"
);

let content = fs.readFileSync(supplierServicePath, "utf8");

if (!content.includes('const { createAuditLog } = require("../../../utils/auditLogger");')) {
  content = content.replace(
    'const AppError = require("../../../utils/appError");',
    'const AppError = require("../../../utils/appError");\nconst { createAuditLog } = require("../../../utils/auditLogger");'
  );
}

const oldCreateSupplier = `const createSupplier = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const branchId = branch ? branch.id : null;

  const supplierCode = payload.supplierCode
    ? payload.supplierCode.trim().toUpperCase()
    : await generateSupplierCode(branch);

  await assertSupplierCodeIsUnique(branchId, supplierCode);

  return prisma.supplier.create({
    data: {
      supplierCode,
      name: payload.name.trim(),
      contactPerson: normalizeOptionalString(payload.contactPerson),
      contactNo: normalizeOptionalString(payload.contactNo),
      email: normalizeOptionalString(payload.email),
      address: normalizeOptionalString(payload.address),
      tin: normalizeOptionalString(payload.tin),
      notes: normalizeOptionalString(payload.notes),
      status: "ACTIVE",
      branchId,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: SUPPLIER_SELECT,
  });
};`;

const newCreateSupplier = `const createSupplier = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const branchId = branch ? branch.id : null;

  const supplierCode = payload.supplierCode
    ? payload.supplierCode.trim().toUpperCase()
    : await generateSupplierCode(branch);

  await assertSupplierCodeIsUnique(branchId, supplierCode);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        supplierCode,
        name: payload.name.trim(),
        contactPerson: normalizeOptionalString(payload.contactPerson),
        contactNo: normalizeOptionalString(payload.contactNo),
        email: normalizeOptionalString(payload.email),
        address: normalizeOptionalString(payload.address),
        tin: normalizeOptionalString(payload.tin),
        notes: normalizeOptionalString(payload.notes),
        status: "ACTIVE",
        branchId,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: \`Supplier \${supplier.supplierCode} created\`,
        metadata: {
          supplierCode: supplier.supplierCode,
          name: supplier.name,
          branchId: supplier.branchId,
          status: supplier.status,
        },
      },
      tx
    );

    return supplier;
  });
};`;

if (!content.includes(oldCreateSupplier)) {
  throw new Error("createSupplier exact block not found. Patch stopped.");
}

content = content.replace(oldCreateSupplier, newCreateSupplier);

const oldUpdateSupplier = `  return prisma.supplier.update({
    where: {
      id: existingSupplier.id,
    },
    data: updateData,
    select: SUPPLIER_SELECT,
  });
};`;

const newUpdateSupplier = `  const changedFields = Object.keys(updateData).filter(
    (field) => field !== "updatedById"
  );

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.update({
      where: {
        id: existingSupplier.id,
      },
      data: updateData,
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_UPDATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: \`Supplier \${supplier.supplierCode} updated\`,
        metadata: {
          supplierCode: supplier.supplierCode,
          previous: {
            supplierCode: existingSupplier.supplierCode,
            name: existingSupplier.name,
            contactPerson: existingSupplier.contactPerson,
            contactNo: existingSupplier.contactNo,
            email: existingSupplier.email,
            address: existingSupplier.address,
            tin: existingSupplier.tin,
            notes: existingSupplier.notes,
          },
          current: {
            supplierCode: supplier.supplierCode,
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            contactNo: supplier.contactNo,
            email: supplier.email,
            address: supplier.address,
            tin: supplier.tin,
            notes: supplier.notes,
          },
          changedFields,
        },
      },
      tx
    );

    return supplier;
  });
};`;

const firstUpdateIndex = content.indexOf(oldUpdateSupplier);

if (firstUpdateIndex === -1) {
  throw new Error("updateSupplierById exact update block not found. Patch stopped.");
}

content =
  content.slice(0, firstUpdateIndex) +
  newUpdateSupplier +
  content.slice(firstUpdateIndex + oldUpdateSupplier.length);

const oldUpdateStatus = `  return prisma.supplier.update({
    where: {
      id: existingSupplier.id,
    },
    data: {
      status,
      updatedById: actor.id,
    },
    select: SUPPLIER_SELECT,
  });
};`;

const newUpdateStatus = `  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.update({
      where: {
        id: existingSupplier.id,
      },
      data: {
        status,
        updatedById: actor.id,
      },
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_STATUS_UPDATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: \`Supplier \${supplier.supplierCode} status updated to \${supplier.status}\`,
        metadata: {
          supplierCode: supplier.supplierCode,
          previousStatus: existingSupplier.status,
          currentStatus: supplier.status,
        },
      },
      tx
    );

    return supplier;
  });
};`;

if (!content.includes(oldUpdateStatus)) {
  throw new Error("updateSupplierStatusById exact update block not found. Patch stopped.");
}

content = content.replace(oldUpdateStatus, newUpdateStatus);

fs.writeFileSync(supplierServicePath, content);

console.log("DONE: Phase 14C audit logger utility and supplier audit hooks patched.");
