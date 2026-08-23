const fs = require("fs");

const validationPath = "./src/modules/credit-accounts/validations/creditAccount.validation.js";
const servicePath = "./src/modules/credit-accounts/services/creditAccount.service.js";
const controllerPath = "./src/modules/credit-accounts/controllers/creditAccount.controller.js";

/* =========================
   FIX VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const collectionPaymentMethodValues")) {
  validation = validation.replace(
    `const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];`,
    `const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];

const collectionPaymentMethodValues = [
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "CARD",
  "OTHER",
];

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));`
  );
}

if (!validation.includes("const createCreditCollectionSchema")) {
  validation = validation.replace(
    `const creditAccountIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
});`,
    `const creditAccountIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
});

const createCreditCollectionSchema = z.object({
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
});`
  );
}

validation = validation.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
};`
);

fs.writeFileSync(validationPath, validation);

/* =========================
   FIX SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const toMoney =")) {
  service = service.replace(
    `const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";`,
    `const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const parseOptionalDate = (value) => {
  if (!value) {
    return new Date();
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    const error = new Error("INVALID_COLLECTION_PAID_AT");
    error.statusCode = 400;
    throw error;
  }

  return parsedDate;
};`
  );
}

if (!service.includes("const createCreditCollection")) {
  service = service.replace(
    `const getCreditAccountById = async (actor, creditAccountId) => {`,
    `const generateCollectionCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = \`\${yyyy}\${mm}\${dd}\`;
  const prefix = \`COLL-\${branchCode}-\${datePart}-\`;

  const startOfDay = new Date(yyyy, date.getMonth(), date.getDate());
  const endOfDay = new Date(yyyy, date.getMonth(), date.getDate() + 1);

  const count = await tx.creditCollection.count({
    where: {
      branchId,
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });

  return \`\${prefix}\${String(count + 1).padStart(4, "0")}\`;
};

const createCreditCollection = async (actor, creditAccountId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const creditAccount = await tx.creditAccount.findUnique({
      where: {
        id: creditAccountId,
      },
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
    });

    if (!creditAccount) {
      const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (!isSuperOwner(actor) && creditAccount.branchId !== actor.branchId) {
      const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (creditAccount.status !== "ACTIVE") {
      const error = new Error("CREDIT_ACCOUNT_NOT_COLLECTIBLE");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(payload.amount);
    const previousBalance = toMoney(Number(creditAccount.remainingBalance));

    if (amount > previousBalance) {
      const error = new Error("COLLECTION_AMOUNT_EXCEEDS_BALANCE");
      error.statusCode = 400;
      throw error;
    }

    const newBalance = toMoney(previousBalance - amount);
    const previousTotalCollected = toMoney(Number(creditAccount.totalCollected));
    const newTotalCollected = toMoney(previousTotalCollected + amount);
    const collectionCode = await generateCollectionCode(
      tx,
      creditAccount.branch.code,
      creditAccount.branchId
    );

    const paidAt = parseOptionalDate(payload.paidAt);
    const accountIsPaid = newBalance <= 0;

    const collection = await tx.creditCollection.create({
      data: {
        collectionCode,
        status: "POSTED",
        amount: toMoneyString(amount),
        previousBalance: toMoneyString(previousBalance),
        newBalance: toMoneyString(newBalance),
        paymentMethod: payload.paymentMethod || "CASH",
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || null,
        paidAt,
        creditAccountId: creditAccount.id,
        branchId: creditAccount.branchId,
        customerId: creditAccount.customerId,
        collectedById: actor.id,
        createdById: actor.id,
      },
      include: {
        creditAccount: {
          select: {
            id: true,
            creditCode: true,
            status: true,
            remainingBalance: true,
            totalCollected: true,
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
      },
    });

    const updatedCreditAccount = await tx.creditAccount.update({
      where: {
        id: creditAccount.id,
      },
      data: {
        totalCollected: toMoneyString(newTotalCollected),
        remainingBalance: toMoneyString(newBalance),
        status: accountIsPaid ? "PAID" : "ACTIVE",
        paidAt: accountIsPaid ? paidAt : null,
        updatedById: actor.id,
      },
      include: CREDIT_ACCOUNT_DETAIL_INCLUDE,
    });

    return {
      collection,
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
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   FIX CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CREDIT_ACCOUNT_NOT_COLLECTIBLE")) {
  controller = controller.replace(
    `    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],`,
    `    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],
    CREDIT_ACCOUNT_NOT_COLLECTIBLE: [400, "Only active credit accounts can receive collections."],
    COLLECTION_AMOUNT_EXCEEDS_BALANCE: [400, "Collection amount cannot exceed remaining balance."],
    INVALID_COLLECTION_PAID_AT: [400, "Invalid collection paid date."],`
  );
}

if (!controller.includes("const createCreditCollection")) {
  controller = controller.replace(
    `const getCreditAccountById = async (req, res, next) => {`,
    `const createCreditCollection = async (req, res, next) => {
  try {
    const result = await creditAccountService.createCreditCollection(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Credit collection posted successfully",
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
};`
);

fs.writeFileSync(controllerPath, controller);

console.log("DONE: Module 5 validation, service, and controller forced fixed.");
