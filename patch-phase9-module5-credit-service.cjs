const fs = require("fs");

const filePath = "./src/modules/credit-accounts/services/creditAccount.service.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createCreditCollection")) {
  console.log("SKIP: createCreditCollection already exists.");
  process.exit(0);
}

content = content.replace(
  `const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";
`,
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
};
`
);

content = content.replace(
  `const getCreditAccountById = async (actor, creditAccountId) => {
`,
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

const getCreditAccountById = async (actor, creditAccountId) => {
`
);

content = content.replace(
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
};
`,
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: creditAccount.service.js patched for collection posting.");
