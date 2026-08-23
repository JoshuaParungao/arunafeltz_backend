const fs = require("fs");

const validationPath = "./src/modules/sales/validations/sale.validation.js";
const controllerPath = "./src/modules/sales/controllers/sale.controller.js";
const servicePath = "./src/modules/sales/services/sale.service.js";

/* =========================
   FIX VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const installmentTermValues")) {
  validation = validation.replace(
    `const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");`,
    `const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");

const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];`
  );
}

if (!validation.includes("const createCreditAccountSchema")) {
  validation = validation.replace(
    `const cancelSaleSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});`,
    `const cancelSaleSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});

const createCreditAccountSchema = z.object({
  body: z.object({
    term: z.enum(installmentTermValues),
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    firstDueDate: z.string().trim().min(1).optional(),
    remarks: optionalString,
  }),
});`
  );
}

validation = validation.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createSaleSchema,
  cancelSaleSchema,
  createCreditAccountSchema,
};`
);

fs.writeFileSync(validationPath, validation);

/* =========================
   FIX SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes(`require("../../settings/services/setting.service")`)) {
  service = service.replace(
    `const prisma = require("../../../config/prisma");`,
    `const prisma = require("../../../config/prisma");
const settingService = require("../../settings/services/setting.service");`
  );
}

if (!service.includes("const INSTALLMENT_TERM_MONTHS")) {
  service = service.replace(
    `const STAFF_ROLES = new Set(["CASHIER", "TECHNICIAN"]);`,
    `const STAFF_ROLES = new Set(["CASHIER", "TECHNICIAN"]);

const INSTALLMENT_TERM_MONTHS = {
  STRAIGHT: 1,
  MONTH_3: 3,
  MONTH_6: 6,
  MONTH_9: 9,
  MONTH_12: 12,
  MONTH_18: 18,
  MONTH_24: 24,
};`
  );
}

if (!service.includes("const parseOptionalDate")) {
  const insertBefore = `const cancelSale = async (actor, saleId, payload) => {`;

  const creditServiceBlock = `
const parseOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    const error = new Error("INVALID_FIRST_DUE_DATE");
    error.statusCode = 400;
    throw error;
  }

  return parsedDate;
};

const generateCreditCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = \`\${yyyy}\${mm}\${dd}\`;
  const prefix = \`CRD-\${branchCode}-\${datePart}-\`;

  const startOfDay = new Date(yyyy, date.getMonth(), date.getDate());
  const endOfDay = new Date(yyyy, date.getMonth(), date.getDate() + 1);

  const count = await tx.creditAccount.count({
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

const createCreditAccountFromSale = async (actor, saleId, payload) => {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: {
        id: saleId,
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
            status: true,
          },
        },
        creditAccount: true,
      },
    });

    if (!sale) {
      const error = new Error("SALE_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessSaleBranch(actor, sale);

    if (sale.status !== "COMPLETED") {
      const error = new Error("SALE_NOT_CREDITABLE");
      error.statusCode = 400;
      throw error;
    }

    if (!sale.customerId || !sale.customer) {
      const error = new Error("SALE_CUSTOMER_REQUIRED_FOR_CREDIT");
      error.statusCode = 400;
      throw error;
    }

    if (sale.customer.status !== "ACTIVE") {
      const error = new Error("CUSTOMER_INACTIVE");
      error.statusCode = 400;
      throw error;
    }

    if (sale.creditAccount) {
      const error = new Error("SALE_ALREADY_HAS_CREDIT_ACCOUNT");
      error.statusCode = 400;
      throw error;
    }

    const cashPromoTotalAmount = toMoney(Number(sale.grandTotal));
    const downpaymentAmount = toMoney(Number(sale.amountPaid));

    if (downpaymentAmount > cashPromoTotalAmount) {
      const error = new Error("CREDIT_DOWNPAYMENT_EXCEEDS_TOTAL");
      error.statusCode = 400;
      throw error;
    }

    const installmentComputation = await settingService.computeInstallmentTest({
      cashPromoTotalAmount,
      cashDownpayment: downpaymentAmount,
      term: payload.term,
    });

    const termBasis = installmentComputation.basisUsed.termBasis;
    const regularPriceTotalAmount = toMoney(installmentComputation.result.regularPriceTotalAmount);
    const balanceAmount = toMoney(installmentComputation.result.balance);
    const months = INSTALLMENT_TERM_MONTHS[payload.term];

    if (!months) {
      const error = new Error("INVALID_INSTALLMENT_TERM");
      error.statusCode = 400;
      throw error;
    }

    const monthlyDueAmount = toMoney(balanceAmount / months);
    const creditCode = await generateCreditCode(tx, sale.branch.code, sale.branchId);
    const firstDueDate = parseOptionalDate(payload.firstDueDate);

    const creditAccount = await tx.creditAccount.create({
      data: {
        creditCode,
        status: balanceAmount <= 0 ? "PAID" : "ACTIVE",
        term: payload.term,
        termBasis: toMoneyString(termBasis),
        cashPromoTotalAmount: toMoneyString(cashPromoTotalAmount),
        regularPriceTotalAmount: toMoneyString(regularPriceTotalAmount),
        downpaymentAmount: toMoneyString(downpaymentAmount),
        balanceAmount: toMoneyString(balanceAmount),
        monthlyDueAmount: toMoneyString(monthlyDueAmount),
        totalCollected: "0.00",
        remainingBalance: toMoneyString(balanceAmount),
        dueDay: payload.dueDay,
        firstDueDate,
        nextDueDate: firstDueDate,
        paidAt: balanceAmount <= 0 ? new Date() : null,
        remarks: payload.remarks || null,
        branchId: sale.branchId,
        customerId: sale.customerId,
        saleId: sale.id,
        createdById: actor.id,
        updatedById: actor.id,
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
            grandTotal: true,
            amountPaid: true,
            paymentStatus: true,
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
      },
    });

    return creditAccount;
  });
};

`;

  service = service.replace(insertBefore, `${creditServiceBlock}${insertBefore}`);
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createSale,
  getSales,
  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   FIX CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const createCreditAccountFromSale")) {
  controller = controller.replace(
    `const cancelSale = async (req, res, next) => {`,
    `const createCreditAccountFromSale = async (req, res, next) => {
  try {
    const creditAccount = await saleService.createCreditAccountFromSale(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Credit account created successfully",
      data: creditAccount,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

const cancelSale = async (req, res, next) => {`
  );
}

if (!controller.includes("SALE_NOT_CREDITABLE")) {
  controller = controller.replace(
    `    SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],`,
    `    SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],
    SALE_NOT_CREDITABLE: [400, "Only completed sales can be converted to credit account."],
    SALE_CUSTOMER_REQUIRED_FOR_CREDIT: [400, "Sale must have a customer before creating credit account."],
    SALE_ALREADY_HAS_CREDIT_ACCOUNT: [400, "Sale already has a credit account."],
    CREDIT_DOWNPAYMENT_EXCEEDS_TOTAL: [400, "Sale amount paid cannot exceed sale grand total."],
    INVALID_INSTALLMENT_TERM: [400, "Invalid installment term."],
    INVALID_FIRST_DUE_DATE: [400, "Invalid first due date."],
    INSTALLMENT_TERM_NOT_CONFIGURED: [400, "Installment term is not configured in settings."],
    INVALID_CASH_DOWNPAYMENT: [400, "Cash downpayment cannot be greater than cash promo total amount."],
    INVALID_SETTING_VALUE: [500, "Invalid installment setting value."],
    REQUIRED_SETTING_MISSING: [500, "Required installment setting is missing."],`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createSale,
  getSales,
  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};`
);

fs.writeFileSync(controllerPath, controller);

console.log("DONE: Module 3 validation, service, and controller forced fixed.");
