const prisma = require("../../../config/prisma");

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const OUT_TYPES = new Set(["CASH_OUT", "ADJUSTMENT_OUT"]);
const IN_TYPES = new Set(["CASH_IN", "ADJUSTMENT_IN"]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const ensureOwnerAdmin = (actor) => {
  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    const error = new Error("CASH_BOX_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }
};

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
    const error = new Error("INVALID_CASH_TRANSACTION_DATE");
    error.statusCode = 400;
    throw error;
  }

  return parsedDate;
};

const generateCashTransactionCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `CASH-${branchCode}-${datePart}-`;

  const startOfDay = new Date(yyyy, date.getMonth(), date.getDate());
  const endOfDay = new Date(yyyy, date.getMonth(), date.getDate() + 1);

  const count = await tx.cashTransaction.count({
    where: {
      branchId,
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });

  return `${prefix}${String(count + 1).padStart(4, "0")}`;
};

const createCashTransaction = async (actor, cashBoxId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const cashBox = await tx.cashBox.findUnique({
      where: {
        id: cashBoxId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!cashBox) {
      const error = new Error("CASH_BOX_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (!isSuperOwner(actor) && cashBox.branchId !== actor.branchId) {
      const error = new Error("CASH_BOX_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (cashBox.status !== "ACTIVE") {
      const error = new Error("CASH_BOX_NOT_ACTIVE");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(payload.amount);
    const balanceBefore = toMoney(Number(cashBox.currentBalance));

    let balanceAfter = balanceBefore;

    if (IN_TYPES.has(payload.type)) {
      balanceAfter = toMoney(balanceBefore + amount);
    }

    if (OUT_TYPES.has(payload.type)) {
      if (amount > balanceBefore) {
        const error = new Error("INSUFFICIENT_CASH_BALANCE");
        error.statusCode = 400;
        throw error;
      }

      balanceAfter = toMoney(balanceBefore - amount);
    }

    const transactionCode = await generateCashTransactionCode(
      tx,
      cashBox.branch.code,
      cashBox.branchId
    );

    const transaction = await tx.cashTransaction.create({
      data: {
        transactionCode,
        type: payload.type,
        status: "POSTED",
        source: "MANUAL",
        amount: toMoneyString(amount),
        balanceBefore: toMoneyString(balanceBefore),
        balanceAfter: toMoneyString(balanceAfter),
        description: payload.description,
        referenceNo: payload.referenceNo || null,
        transactionDate: parseOptionalDate(payload.transactionDate),
        cashBoxId: cashBox.id,
        branchId: cashBox.branchId,
        createdById: actor.id,
      },
      include: {
        cashBox: {
          select: {
            id: true,
            boxCode: true,
            name: true,
            currentBalance: true,
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

    const updatedCashBox = await tx.cashBox.update({
      where: {
        id: cashBox.id,
      },
      data: {
        currentBalance: toMoneyString(balanceAfter),
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
      },
    });

    return {
      transaction,
      cashBox: updatedCashBox,
    };
  });
};

module.exports = {
  createCashTransaction,
};
