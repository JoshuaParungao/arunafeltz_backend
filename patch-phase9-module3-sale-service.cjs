const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createCreditAccountFromSale")) {
  console.log("SKIP: createCreditAccountFromSale already exists.");
  process.exit(0);
}

content = content.replace(
  `const prisma = require("../../../config/prisma");
`,
  `const prisma = require("../../../config/prisma");
const settingService = require("../../settings/services/setting.service");
`
);

content = content.replace(
  `const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};
`,
  `const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const INSTALLMENT_TERM_MONTHS = {
  STRAIGHT: 1,
  MONTH_3: 3,
  MONTH_6: 6,
  MONTH_9: 9,
  MONTH_12: 12,
  MONTH_18: 18,
  MONTH_24: 24,
};
`
);

content = content.replace(
  `const cancelSale = async (actor, saleId, payload) => {
`,
  `const parseOptionalDate = (value) => {
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

    const termBasis = toMoney(installmentComputation.basisUsed.termBasis);
    const regularPriceTotalAmount = toMoney(
      installmentComputation.result.regularPriceTotalAmount
    );
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

const cancelSale = async (actor, saleId, payload) => {
`
);

content = content.replace(
  `  getSaleById,
  cancelSale,
};
`,
  `  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: sale.service.js patched for createCreditAccountFromSale.");
