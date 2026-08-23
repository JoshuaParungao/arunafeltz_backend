const fs = require("fs");

const validationPath = "./src/modules/credit-accounts/validations/creditAccount.validation.js";
const servicePath = "./src/modules/credit-accounts/services/creditAccount.service.js";
const controllerPath = "./src/modules/credit-accounts/controllers/creditAccount.controller.js";
const routePath = "./src/modules/credit-accounts/routes/creditAccount.routes.js";

/* =========================
   VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("cancelCreditCollectionSchema")) {
  validation = validation.replace(
    `const createCreditCollectionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
  body: z.object({
    amount: z.coerce.number().positive("Collection amount must be greater than zero"),
    paymentMethod: z.enum(collectionPaymentMethodValues).default("CASH"),
    referenceNo: optionalString,
    remarks: optionalString,
    paidAt: z.string().trim().min(1).optional(),
  }),
});`,
    `const createCreditCollectionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
  body: z.object({
    amount: z.coerce.number().positive("Collection amount must be greater than zero"),
    paymentMethod: z.enum(collectionPaymentMethodValues).default("CASH"),
    referenceNo: optionalString,
    remarks: optionalString,
    paidAt: z.string().trim().min(1).optional(),
  }),
});

const cancelCreditCollectionSchema = z.object({
  params: z.object({
    collectionId: z.string().trim().min(1, "Collection ID is required"),
  }),
  body: z.object({
    cancellationReason: z
      .string()
      .trim()
      .min(3, "Cancellation reason is required"),
  }),
});`
  );
}

validation = validation.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
  cancelCreditCollectionSchema,
};`
);

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const cancelCreditCollection")) {
  service = service.replace(
    `const getCreditAccountById = async (actor, creditAccountId) => {`,
    `const cancelCreditCollection = async (actor, collectionId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const collection = await tx.creditCollection.findUnique({
      where: {
        id: collectionId,
      },
      include: {
        creditAccount: {
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
              },
            },
            sale: {
              select: {
                id: true,
                receiptCode: true,
              },
            },
          },
        },
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
          },
        },
      },
    });

    if (!collection) {
      const error = new Error("CREDIT_COLLECTION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (!isSuperOwner(actor) && collection.branchId !== actor.branchId) {
      const error = new Error("CREDIT_COLLECTION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (collection.status !== "POSTED") {
      const error = new Error("CREDIT_COLLECTION_ALREADY_CANCELLED");
      error.statusCode = 400;
      throw error;
    }

    const creditAccount = collection.creditAccount;

    if (!["ACTIVE", "PAID"].includes(creditAccount.status)) {
      const error = new Error("CREDIT_ACCOUNT_NOT_REVERSIBLE");
      error.statusCode = 400;
      throw error;
    }

    const collectionAmount = toMoney(Number(collection.amount));
    const currentRemainingBalance = toMoney(Number(creditAccount.remainingBalance));
    const currentTotalCollected = toMoney(Number(creditAccount.totalCollected));

    const restoredRemainingBalance = toMoney(currentRemainingBalance + collectionAmount);
    const restoredTotalCollected = toMoney(Math.max(currentTotalCollected - collectionAmount, 0));
    const restoredStatus = restoredRemainingBalance > 0 ? "ACTIVE" : "PAID";

    const cancelledCollection = await tx.creditCollection.update({
      where: {
        id: collection.id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason: payload.cancellationReason,
      },
      include: {
        creditAccount: {
          select: {
            id: true,
            creditCode: true,
            status: true,
          },
        },
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
          },
        },
        collectedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    const updatedCreditAccount = await tx.creditAccount.update({
      where: {
        id: creditAccount.id,
      },
      data: {
        totalCollected: toMoneyString(restoredTotalCollected),
        remainingBalance: toMoneyString(restoredRemainingBalance),
        status: restoredStatus,
        paidAt: restoredStatus === "PAID" ? creditAccount.paidAt : null,
        updatedById: actor.id,
      },
      include: CREDIT_ACCOUNT_DETAIL_INCLUDE,
    });

    return {
      collection: cancelledCollection,
      creditAccount: updatedCreditAccount,
    };
  });
};

const getCreditAccountById = async (actor, creditAccountId) => {`
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
  cancelCreditCollection,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CREDIT_COLLECTION_NOT_FOUND")) {
  controller = controller.replace(
    `    INVALID_COLLECTION_PAID_AT: [400, "Invalid collection paid date."],`,
    `    INVALID_COLLECTION_PAID_AT: [400, "Invalid collection paid date."],
    CREDIT_COLLECTION_NOT_FOUND: [404, "Credit collection not found."],
    CREDIT_COLLECTION_ALREADY_CANCELLED: [400, "Credit collection is already cancelled."],
    CREDIT_ACCOUNT_NOT_REVERSIBLE: [400, "Credit account is not reversible."],`
  );
}

if (!controller.includes("const cancelCreditCollection")) {
  controller = controller.replace(
    `const getCreditAccountById = async (req, res, next) => {`,
    `const cancelCreditCollection = async (req, res, next) => {
  try {
    const result = await creditAccountService.cancelCreditCollection(
      req.user,
      req.params.collectionId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Credit collection cancelled successfully",
      data: result,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const getCreditAccountById = async (req, res, next) => {`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
  cancelCreditCollection,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("cancelCreditCollectionSchema")) {
  route = route.replace(
    `  createCreditCollectionSchema,`,
    `  createCreditCollectionSchema,
  cancelCreditCollectionSchema,`
  );
}

if (!route.includes("/collections/:collectionId/cancel")) {
  route = route.replace(
    `router.get(
  "/",
  validate(listCreditAccountsSchema),
  creditAccountController.getCreditAccounts
);`,
    `router.get(
  "/",
  validate(listCreditAccountsSchema),
  creditAccountController.getCreditAccounts
);

router.post(
  "/collections/:collectionId/cancel",
  validate(cancelCreditCollectionSchema),
  creditAccountController.cancelCreditCollection
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 9 Module 6 cancel/reverse collection patched.");
