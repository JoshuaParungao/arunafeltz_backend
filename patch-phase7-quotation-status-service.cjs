const fs = require("fs");

const filePath = "./src/modules/quotations/services/quotation.service.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateQuotationStatus = async")) {
  console.log("SKIP: updateQuotationStatus already exists.");
  process.exit(0);
}

const functionToAdd = `
const assertValidQuotationStatusTransition = (currentStatus, nextStatus) => {
  const allowedTransitions = {
    DRAFT: ["SENT", "CANCELLED"],
    SENT: ["APPROVED", "CANCELLED"],
    APPROVED: [],
    CANCELLED: [],
    CONVERTED: [],
  };

  const allowedNextStatuses = allowedTransitions[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    const error = new Error("INVALID_QUOTATION_STATUS_TRANSITION");
    error.statusCode = 400;
    throw error;
  }
};

const updateQuotationStatus = async (actor, quotationId, payload) => {
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
    assertValidQuotationStatusTransition(existingQuotation.status, payload.status);

    const now = new Date();

    const updateData = {
      status: payload.status,
      updatedById: actor.id,
    };

    if (payload.status === "SENT") {
      updateData.sentAt = now;
    }

    if (payload.status === "APPROVED") {
      updateData.approvedAt = now;
    }

    if (payload.status === "CANCELLED") {
      updateData.cancelledAt = now;
      updateData.internalNotes = payload.remarks
        ? existingQuotation.internalNotes
          ? \`\${existingQuotation.internalNotes}\\nCancellation remarks: \${payload.remarks}\`
          : \`Cancellation remarks: \${payload.remarks}\`
        : existingQuotation.internalNotes;
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
  "updateQuotation,",
  "updateQuotation,\n  updateQuotationStatus,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.service.js patched with updateQuotationStatus.");
