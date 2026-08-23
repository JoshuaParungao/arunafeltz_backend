const fs = require("fs");

const filePath = "./src/modules/quotations/services/quotation.service.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateQuotation = async")) {
  console.log("SKIP: updateQuotation already exists.");
  process.exit(0);
}

const functionToAdd = `
const ensureCanAccessQuotationBranch = (actor, quotation) => {
  if (isSuperOwner(actor)) {
    return;
  }

  if (!actor.branchId || quotation.branchId !== actor.branchId) {
    const error = new Error("QUOTATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const normalizeOptionalId = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const updateQuotation = async (actor, quotationId, payload) => {
  return prisma.$transaction(async (tx) => {
    const existingQuotation = await tx.quotation.findUnique({
      where: {
        id: quotationId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!existingQuotation) {
      const error = new Error("QUOTATION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessQuotationBranch(actor, existingQuotation);

    if (existingQuotation.status !== "DRAFT") {
      const error = new Error("QUOTATION_NOT_EDITABLE");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      updatedById: actor.id,
    };

    if (payload.title !== undefined) {
      updateData.title = payload.title || null;
    }

    if (payload.notes !== undefined) {
      updateData.notes = payload.notes || null;
    }

    if (payload.internalNotes !== undefined) {
      updateData.internalNotes = payload.internalNotes || null;
    }

    if (payload.isPcBuild !== undefined) {
      updateData.isPcBuild = Boolean(payload.isPcBuild);
    }

    if (payload.validUntil !== undefined) {
      updateData.validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    }

    const normalizedCustomerId = normalizeOptionalId(payload.customerId);

    if (normalizedCustomerId !== undefined) {
      if (normalizedCustomerId === null) {
        updateData.customerId = null;
      } else {
        await ensureCustomerBelongsToBranch(tx, normalizedCustomerId, existingQuotation.branchId);
        updateData.customerId = normalizedCustomerId;
      }
    }

    const normalizedPreparedById = normalizeOptionalId(payload.preparedById);

    if (normalizedPreparedById !== undefined) {
      if (normalizedPreparedById === null) {
        updateData.preparedById = null;
      } else {
        await ensurePreparedByBelongsToBranch(tx, normalizedPreparedById, existingQuotation.branchId);
        updateData.preparedById = normalizedPreparedById;
      }
    }

    if (payload.items !== undefined) {
      const { quotationItems, subtotal, totalDiscount, grandTotal } =
        await buildQuotationItems(tx, actor, existingQuotation.branchId, payload.items);

      updateData.subtotal = toMoneyString(subtotal);
      updateData.totalDiscount = toMoneyString(totalDiscount);
      updateData.grandTotal = toMoneyString(grandTotal);

      await tx.quotationItem.deleteMany({
        where: {
          quotationId: existingQuotation.id,
        },
      });

      updateData.items = {
        create: quotationItems,
      };
    }

    const quotation = await tx.quotation.update({
      where: {
        id: existingQuotation.id,
      },
      data: updateData,
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerCode: true,
            fullName: true,
            mobileNumber: true,
            email: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        items: {
          orderBy: {
            lineNo: "asc",
          },
        },
      },
    });

    return hideInternalNotesIfNeeded(quotation, actor);
  });
};
`;

content = content.replace(
  "module.exports = {",
  `${functionToAdd}\nmodule.exports = {`
);

content = content.replace(
  "getQuotationById,",
  "getQuotationById,\n  updateQuotation,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.service.js patched with updateQuotation.");
