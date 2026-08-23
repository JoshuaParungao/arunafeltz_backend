const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const generateCashTransactionCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `CASH-${branchCode}-${datePart}-`;

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
  const cashBox = await tx.cashBox.findFirst({
    where: {
      branchId: branch.id,
      boxCode: `CASHBOX-${branch.code}`,
      status: "ACTIVE",
    },
  });

  if (!cashBox) {
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


const reverseSystemCashIn = async (tx, actor, payload) => {
  const cashTransaction = await tx.cashTransaction.findFirst({
    where: {
      source: payload.source,
      sourceId: payload.sourceId,
      type: payload.type,
      status: "POSTED",
    },
    include: {
      cashBox: true,
    },
  });

  if (!cashTransaction) {
    return null;
  }

  const cashBox = cashTransaction.cashBox;

  if (cashBox.status !== "ACTIVE") {
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
  reverseSystemCashIn,
};
