const prisma = require("../../../config/prisma");
const cashLinkService = require("../../cash-boxes/services/cashLink.service");

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

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

const ensureOwnerAdmin = (actor) => {
  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    const error = new Error("CREDIT_ACCOUNT_VIEW_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }
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
    const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return actor.branchId;
};

const CREDIT_ACCOUNT_LIST_INCLUDE = {
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
    },
  },
  sale: {
    select: {
      id: true,
      receiptCode: true,
      grandTotal: true,
      amountPaid: true,
      paymentStatus: true,
      saleDate: true,
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
  _count: {
    select: {
      collections: true,
    },
  },
};

const CREDIT_ACCOUNT_DETAIL_INCLUDE = {
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
      address: true,
    },
  },
  sale: {
    select: {
      id: true,
      receiptCode: true,
      status: true,
      paymentStatus: true,
      saleDate: true,
      subtotal: true,
      totalDiscount: true,
      serviceCharge: true,
      grandTotal: true,
      amountPaid: true,
      changeAmount: true,
      remarks: true,
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
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  collections: {
    orderBy: {
      paidAt: "desc",
    },
    take: 20,
    include: {
      collectedBy: {
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

const getCreditAccounts = async (actor, query = {}) => {
  ensureOwnerAdmin(actor);

  const { page, limit, skip } = parsePagination(query);
  const branchId = resolveBranchFilter(actor, query.branchId);

  const where = {};

  if (branchId) {
    where.branchId = branchId;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.saleId) {
    where.saleId = query.saleId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.term) {
    where.term = query.term;
  }

  if (query.search) {
    where.OR = [
      {
        creditCode: {
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
      {
        customer: {
          fullName: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
      {
        sale: {
          receiptCode: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.creditAccount.findMany({
      where,
      include: CREDIT_ACCOUNT_LIST_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.creditAccount.count({
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

const generateCollectionCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `COLL-${branchCode}-${datePart}-`;

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

  return `${prefix}${String(count + 1).padStart(4, "0")}`;
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


    if (payload.paymentMethod === "CASH") {
      await cashLinkService.postSystemCashIn(tx, actor, creditAccount.branch, {
        type: "CREDIT_COLLECTION",
        source: "CREDIT_COLLECTION",
        amount,
        description: `Cash payment from credit collection ${collection.collectionCode}.`,
        referenceNo: collection.referenceNo,
        sourceId: collection.id,
        sourceCode: collection.collectionCode,
        transactionDate: collection.paidAt,
      });
    }

    return {
      collection,
      creditAccount: updatedCreditAccount,
    };
  });
};

const cancelCreditCollection = async (actor, collectionId, payload) => {
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

const getCreditAccountById = async (actor, creditAccountId) => {
  ensureOwnerAdmin(actor);

  const creditAccount = await prisma.creditAccount.findUnique({
    where: {
      id: creditAccountId,
    },
    include: CREDIT_ACCOUNT_DETAIL_INCLUDE,
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

  return creditAccount;
};

module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
  cancelCreditCollection,
};
