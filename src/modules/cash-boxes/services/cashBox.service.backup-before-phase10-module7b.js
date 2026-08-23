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

const parsePagination = (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 20), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
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

const resolveBranchFilter = (actor, branchId) => {
  if (isSuperOwner(actor)) {
    return branchId || undefined;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  if (branchId && branchId !== actor.branchId) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return actor.branchId;
};

const CASH_BOX_LIST_INCLUDE = {
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
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  _count: {
    select: {
      transactions: true,
    },
  },
};

const CASH_BOX_DETAIL_INCLUDE = {
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
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  transactions: {
    orderBy: {
      transactionDate: "desc",
    },
    take: 20,
    include: {
      createdBy: {
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
  },
};

const CASH_TRANSACTION_INCLUDE = {
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
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
};

const getCashBoxes = async (actor, query = {}) => {
  ensureOwnerAdmin(actor);

  const { page, limit, skip } = parsePagination(query);
  const branchId = resolveBranchFilter(actor, query.branchId);

  const where = {};

  if (branchId) {
    where.branchId = branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      {
        boxCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        name: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        remarks: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.cashBox.findMany({
      where,
      include: CASH_BOX_LIST_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.cashBox.count({
      where,
    }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getCashBoxById = async (actor, cashBoxId) => {
  ensureOwnerAdmin(actor);

  const cashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBoxId,
    },
    include: CASH_BOX_DETAIL_INCLUDE,
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

  return cashBox;
};

const getCashTransactions = async (actor, cashBoxId, query = {}) => {
  ensureOwnerAdmin(actor);

  const cashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBoxId,
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

  const { page, limit, skip } = parsePagination(query);

  const where = {
    cashBoxId,
  };

  if (query.type) {
    where.type = query.type;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.search) {
    where.OR = [
      {
        transactionCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        referenceNo: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        sourceCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.cashTransaction.findMany({
      where,
      include: CASH_TRANSACTION_INCLUDE,
      orderBy: {
        transactionDate: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.cashTransaction.count({
      where,
    }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getCashTransactionById = async (actor, transactionId) => {
  ensureOwnerAdmin(actor);

  const transaction = await prisma.cashTransaction.findUnique({
    where: {
      id: transactionId,
    },
    include: CASH_TRANSACTION_INCLUDE,
  });

  if (!transaction) {
    const error = new Error("CASH_TRANSACTION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && transaction.branchId !== actor.branchId) {
    const error = new Error("CASH_TRANSACTION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return transaction;
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
      include: CASH_TRANSACTION_INCLUDE,
    });

    const updatedCashBox = await tx.cashBox.update({
      where: {
        id: cashBox.id,
      },
      data: {
        currentBalance: toMoneyString(balanceAfter),
        updatedById: actor.id,
      },
      include: CASH_BOX_LIST_INCLUDE,
    });

    return {
      transaction,
      cashBox: updatedCashBox,
    };
  });
};

const cancelCashTransaction = async (actor, transactionId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.cashTransaction.findUnique({
      where: {
        id: transactionId,
      },
      include: {
        cashBox: {
          include: {
            branch: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      const error = new Error("CASH_TRANSACTION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (!isSuperOwner(actor) && transaction.branchId !== actor.branchId) {
      const error = new Error("CASH_TRANSACTION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (transaction.status !== "POSTED") {
      const error = new Error("CASH_TRANSACTION_ALREADY_CANCELLED");
      error.statusCode = 400;
      throw error;
    }

    if (transaction.source !== "MANUAL") {
      const error = new Error("CASH_TRANSACTION_SOURCE_NOT_REVERSIBLE");
      error.statusCode = 400;
      throw error;
    }

    const cashBox = transaction.cashBox;

    if (cashBox.status !== "ACTIVE") {
      const error = new Error("CASH_BOX_NOT_ACTIVE");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(Number(transaction.amount));
    const currentBalance = toMoney(Number(cashBox.currentBalance));

    let restoredBalance = currentBalance;

    if (IN_TYPES.has(transaction.type)) {
      restoredBalance = toMoney(currentBalance - amount);

      if (restoredBalance < 0) {
        const error = new Error("CASH_REVERSAL_NEGATIVE_BALANCE");
        error.statusCode = 400;
        throw error;
      }
    }

    if (OUT_TYPES.has(transaction.type)) {
      restoredBalance = toMoney(currentBalance + amount);
    }

    const cancelledTransaction = await tx.cashTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason: payload.cancellationReason,
      },
      include: CASH_TRANSACTION_INCLUDE,
    });

    const updatedCashBox = await tx.cashBox.update({
      where: {
        id: cashBox.id,
      },
      data: {
        currentBalance: toMoneyString(restoredBalance),
        updatedById: actor.id,
      },
      include: CASH_BOX_LIST_INCLUDE,
    });

    return {
      transaction: cancelledTransaction,
      cashBox: updatedCashBox,
    };
  });
};

module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashTransaction,
  cancelCashTransaction,
};
