const { businessDateCode } = require("../../../utils/businessDate");

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const generateCashTransactionCode = async (tx, branchCode, branchId) => {
  const prefix = `CASH-${branchCode}-${businessDateCode()}-`;

  const latestTransaction = await tx.cashTransaction.findFirst({
    where: {
      branchId,
      transactionCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      transactionCode: "desc",
    },
    select: {
      transactionCode: true,
    },
  });

  let nextNumber = 1;

  if (latestTransaction) {
    const latestNumberText = latestTransaction.transactionCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const getDefaultCashBox = async (tx, branch) => {
  const candidate = await tx.cashBox.findFirst({
    where: {
      branchId: branch.id,
      boxCode: `CASHBOX-${branch.code}`,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (!candidate) {
    const error = new Error("DEFAULT_CASH_BOX_NOT_FOUND");
    error.statusCode = 400;
    throw error;
  }

  await tx.$queryRaw`SELECT "id" FROM "CashBox" WHERE "id" = ${candidate.id} FOR UPDATE`;

  const cashBox = await tx.cashBox.findUnique({
    where: {
      id: candidate.id,
    },
  });

  if (!cashBox || cashBox.status !== "ACTIVE") {
    const error = new Error("DEFAULT_CASH_BOX_NOT_FOUND");
    error.statusCode = 400;
    throw error;
  }

  return cashBox;
};

const postSystemCashIn = async (tx, actor, branch, payload) => {
  const amount = toMoney(payload.amount);

  if (amount <= 0) {
    return null;
  }

  const cashBox = await getDefaultCashBox(tx, branch);

  if (payload.sourceId) {
    const existing = await tx.cashTransaction.findFirst({
      where: {
        source: payload.source,
        type: payload.type,
        sourceId: payload.sourceId,
      },
      include: {
        cashBox: true,
      },
    });

    if (existing) {
      const isSameEvent =
        existing.status === "POSTED" &&
        existing.branchId === branch.id &&
        toMoney(Number(existing.amount)) === amount &&
        (existing.sourceCode || null) === (payload.sourceCode || null);

      if (!isSameEvent) {
        const error = new Error("CASH_SOURCE_CONFLICT");
        error.statusCode = 409;
        throw error;
      }

      return {
        transaction: existing,
        cashBox: existing.cashBox,
      };
    }
  }

  const balanceBefore = toMoney(Number(cashBox.currentBalance));
  const balanceAfter = toMoney(balanceBefore + amount);

  const transactionCode = await generateCashTransactionCode(tx, branch.code, branch.id);

  const transaction = await tx.cashTransaction.create({
    data: {
      transactionCode,
      type: payload.type,
      status: "POSTED",
      source: payload.source,
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(balanceBefore),
      balanceAfter: toMoneyString(balanceAfter),
      description: payload.description,
      referenceNo: payload.referenceNo || null,
      sourceId: payload.sourceId || null,
      sourceCode: payload.sourceCode || null,
      transactionDate: payload.transactionDate || new Date(),
      cashBoxId: cashBox.id,
      branchId: branch.id,
      createdById: actor.id,
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
  });

  return {
    transaction,
    cashBox: updatedCashBox,
  };
};

const postSystemCashOut = async (tx, actor, branch, payload) => {
  const amount = toMoney(payload.amount);

  if (amount <= 0) {
    return null;
  }

  const existing = await tx.cashTransaction.findFirst({
    where: {
      source: payload.source,
      sourceId: payload.sourceId,
      type: "CASH_OUT",
      status: "POSTED",
    },
    include: {
      cashBox: true,
    },
  });

  if (existing) {
    return {
      transaction: existing,
      cashBox: existing.cashBox,
    };
  }

  const cashBox = await getDefaultCashBox(tx, branch);
  const balanceBefore = toMoney(Number(cashBox.currentBalance));
  const balanceAfter = toMoney(balanceBefore - amount);

  if (balanceAfter < 0) {
    const error = new Error("INSUFFICIENT_CASH_FOR_REFUND");
    error.statusCode = 400;
    throw error;
  }

  const transactionCode = await generateCashTransactionCode(
    tx,
    branch.code,
    branch.id
  );

  const transaction = await tx.cashTransaction.create({
    data: {
      transactionCode,
      type: "CASH_OUT",
      status: "POSTED",
      source: payload.source,
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(balanceBefore),
      balanceAfter: toMoneyString(balanceAfter),
      description: payload.description,
      referenceNo: payload.referenceNo || null,
      sourceId: payload.sourceId || null,
      sourceCode: payload.sourceCode || null,
      transactionDate: payload.transactionDate || new Date(),
      cashBoxId: cashBox.id,
      branchId: branch.id,
      createdById: actor.id,
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
  });

  return {
    transaction,
    cashBox: updatedCashBox,
  };
};


const reverseSystemCashIn = async (tx, actor, payload) => {
  const candidate = await tx.cashTransaction.findFirst({
    where: {
      source: payload.source,
      sourceId: payload.sourceId,
      type: payload.type,
      status: "POSTED",
    },
    select: {
      id: true,
    },
  });

  if (!candidate) {
    return null;
  }

  await tx.$queryRaw`SELECT "id" FROM "CashTransaction" WHERE "id" = ${candidate.id} FOR UPDATE`;

  const cashTransaction = await tx.cashTransaction.findUnique({
    where: {
      id: candidate.id,
    },
    include: {
      cashBox: true,
    },
  });

  if (!cashTransaction || cashTransaction.status !== "POSTED") {
    return null;
  }

  await tx.$queryRaw`SELECT "id" FROM "CashBox" WHERE "id" = ${cashTransaction.cashBoxId} FOR UPDATE`;

  const lockedCashBox = await tx.cashBox.findUnique({
    where: {
      id: cashTransaction.cashBoxId,
    },
  });

  const cashBox = lockedCashBox;

  if (!cashBox || cashBox.status !== "ACTIVE") {
    const error = new Error("CASH_BOX_NOT_ACTIVE");
    error.statusCode = 400;
    throw error;
  }

  const amount = toMoney(Number(cashTransaction.amount));
  const balanceBefore = toMoney(Number(cashBox.currentBalance));
  const balanceAfter = toMoney(balanceBefore - amount);

  if (balanceAfter < 0) {
    const error = new Error("CASH_REVERSAL_NEGATIVE_BALANCE");
    error.statusCode = 400;
    throw error;
  }

  const cancelledTransaction = await tx.cashTransaction.update({
    where: {
      id: cashTransaction.id,
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason: payload.cancellationReason,
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
  });

  return {
    transaction: cancelledTransaction,
    cashBox: updatedCashBox,
  };
};

module.exports = {
  postSystemCashIn,
  postSystemCashOut,
  reverseSystemCashIn,
};
