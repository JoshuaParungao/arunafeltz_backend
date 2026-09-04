const prisma = require("../../../config/prisma");
const cashLinkService = require("../../cash-boxes/services/cashLink.service");
const { createAuditLog } = require("../../../utils/auditLogger");
const { businessDateCode } = require("../../../utils/businessDate");
const {
  assertIdempotencyMatch,
  createIdempotencyFingerprint,
} = require("../../../utils/idempotency");
const {
  deriveReceivablePaymentState,
  deriveSourcePaymentStatus,
} = require("./receivableAccount.service");

const OWNER_ADMIN_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const CANCEL_COLLECTION_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
]);

const COLLECTION_PAYMENT_METHODS = new Set([
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "OTHER",
]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const formatCreditAccount = (account) => {
  if (!account) {
    return account;
  }

  const { idempotencyKey, idempotencyFingerprint, ...safeAccount } = account;

  return {
    ...safeAccount,
    collections: Array.isArray(safeAccount.collections)
      ? safeAccount.collections.map((collection) => {
          const {
            idempotencyKey: collectionIdempotencyKey,
            idempotencyFingerprint: collectionIdempotencyFingerprint,
            ...safeCollection
          } = collection;
          return safeCollection;
        })
      : safeAccount.collections,
    paymentState: deriveReceivablePaymentState(account),
  };
};

const formatCreditCollection = (collection) => {
  if (!collection) {
    return collection;
  }

  const { idempotencyKey, idempotencyFingerprint, ...safeCollection } =
    collection;
  return safeCollection;
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

const lockCreditAccount = async (tx, creditAccountId) => {
  await tx.$queryRaw`SELECT "id" FROM "CreditAccount" WHERE "id" = ${creditAccountId} FOR UPDATE`;
};

const lockCreditCollection = async (tx, collectionId) => {
  await tx.$queryRaw`SELECT "id" FROM "CreditCollection" WHERE "id" = ${collectionId} FOR UPDATE`;
};

const lockBranch = async (tx, branchId) => {
  await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} FOR UPDATE`;
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
  serviceJob: {
    select: {
      id: true,
      jobCode: true,
      status: true,
      repairType: true,
      jobTitle: true,
      finalServiceCharge: true,
      customerNameSnapshot: true,
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
  serviceJob: {
    select: {
      id: true,
      jobCode: true,
      status: true,
      repairType: true,
      jobTitle: true,
      finalServiceCharge: true,
      customerNameSnapshot: true,
      customerContactSnapshot: true,
      completedAt: true,
      releasedAt: true,
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

  if (query.serviceJobId) {
    where.serviceJobId = query.serviceJobId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.sourceType) {
    where.sourceType = query.sourceType;
  }

  if (query.provider) {
    where.provider = query.provider;
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
      {
        serviceJob: {
          jobCode: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const [data, total, summaryAggregates] = await Promise.all([
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
    prisma.creditAccount.groupBy({
      by: ["status"],
      where: {
        ...(where.branchId ? { branchId: where.branchId } : {}),
        ...(where.customerId ? { customerId: where.customerId } : {}),
        ...(where.sourceType ? { sourceType: where.sourceType } : {}),
        ...(where.provider ? { provider: where.provider } : {}),
        ...(where.term ? { term: where.term } : {}),
      },
      _sum: {
        remainingBalance: true,
        totalCollected: true,
      },
      _count: true,
    }),
  ]);

  let totalActiveBalance = 0;
  let totalCollections = 0;
  let totalDefaultedBalance = 0;
  let totalDefaultedCount = 0;

  for (const group of summaryAggregates) {
    const rem = Number(group._sum?.remainingBalance || 0);
    const coll = Number(group._sum?.totalCollected || 0);
    const cnt = group._count || 0;

    totalCollections += coll;

    if (group.status === "ACTIVE") {
      totalActiveBalance += rem;
    } else if (group.status === "DEFAULTED") {
      totalDefaultedBalance += rem;
      totalDefaultedCount += cnt;
    }
  }

  return {
    data: data.map(formatCreditAccount),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalActiveBalance,
        totalCollections,
        totalDefaultedBalance,
        totalDefaultedCount,
      },
    },
  };
};

const generateCollectionCode = async (tx, branchCode, branchId) => {
  const prefix = `COLL-${branchCode}-${businessDateCode()}-`;
  const latestCollection = await tx.creditCollection.findFirst({
    where: {
      branchId,
      collectionCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      collectionCode: "desc",
    },
    select: {
      collectionCode: true,
    },
  });

  let nextNumber = 1;

  if (latestCollection) {
    const latestNumber = Number(
      latestCollection.collectionCode.slice(prefix.length)
    );

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const lockReceivableSource = async (tx, accountReference) => {
  if (accountReference.saleId) {
    await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${accountReference.saleId} FOR UPDATE`;
    return;
  }

  if (accountReference.serviceJobId) {
    await tx.$queryRaw`SELECT "id" FROM "ServiceJob" WHERE "id" = ${accountReference.serviceJobId} FOR UPDATE`;
  }
};

const ensureCanCancelCollection = (actor) => {
  if (!CANCEL_COLLECTION_ROLES.has(actor.role)) {
    const error = new Error("CREDIT_COLLECTION_CANCEL_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const CREDIT_COLLECTION_RESULT_INCLUDE = {
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
};

const syncLinkedSalePaymentStatus = async (tx, creditAccount) => {
  if (!creditAccount.saleId) {
    return;
  }

  const sale = await tx.sale.findUnique({
    where: {
      id: creditAccount.saleId,
    },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      amountPaid: true,
    },
  });

  if (!sale || !["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status)) {
    return;
  }

  const paymentStatus = deriveSourcePaymentStatus({
    account: creditAccount,
    initialSettlementAmount: Number(sale.amountPaid),
  });

  if (sale.paymentStatus !== paymentStatus) {
    await tx.sale.update({
      where: {
        id: sale.id,
      },
      data: {
        paymentStatus,
      },
    });
  }
};

const createCreditCollection = async (
  actor,
  creditAccountId,
  payload,
  database = prisma
) => {
  ensureOwnerAdmin(actor);
  const paymentMethod = payload.paymentMethod || "CASH";

  if (!COLLECTION_PAYMENT_METHODS.has(paymentMethod)) {
    const error = new Error("INVALID_COLLECTION_SETTLEMENT_METHOD");
    error.statusCode = 400;
    throw error;
  }

  const idempotencyFingerprint = payload.idempotencyKey
    ? createIdempotencyFingerprint({ creditAccountId, ...payload, paymentMethod })
    : null;

  return database.$transaction(async (tx) => {
    const accountReference = await tx.creditAccount.findUnique({
      where: {
        id: creditAccountId,
      },
      select: {
        id: true,
        saleId: true,
        serviceJobId: true,
      },
    });

    if (!accountReference) {
      const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    // Source-first order matches source cancellation: Sale/ServiceJob ->
    // CreditAccount -> CreditCollection -> Branch/CashBox.
    await lockReceivableSource(tx, accountReference);
    await lockCreditAccount(tx, creditAccountId);

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

    // The branch lock serializes branch-scoped idempotency keys as well as
    // the daily collection-code sequence across different accounts.
    await lockBranch(tx, creditAccount.branchId);

    if (payload.idempotencyKey) {
      const existingCollection = await tx.creditCollection.findUnique({
        where: {
          branchId_idempotencyKey: {
            branchId: creditAccount.branchId,
            idempotencyKey: payload.idempotencyKey,
          },
        },
        include: CREDIT_COLLECTION_RESULT_INCLUDE,
      });

      if (existingCollection) {
        assertIdempotencyMatch(
          existingCollection,
          idempotencyFingerprint,
          "CREDIT_COLLECTION_IDEMPOTENCY_CONFLICT"
        );

        const currentCreditAccount = await tx.creditAccount.findUnique({
          where: {
            id: creditAccount.id,
          },
          include: CREDIT_ACCOUNT_DETAIL_INCLUDE,
        });

        return {
          collection: formatCreditCollection(existingCollection),
          creditAccount: formatCreditAccount(currentCreditAccount),
          replayed: true,
        };
      }
    }

    if (creditAccount.status !== "ACTIVE") {
      const error = new Error("CREDIT_ACCOUNT_NOT_COLLECTIBLE");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(payload.amount);
    const previousBalance = toMoney(Number(creditAccount.remainingBalance));

    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("INVALID_COLLECTION_AMOUNT");
      error.statusCode = 400;
      throw error;
    }

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
        paymentMethod,
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || null,
        paidAt,
        idempotencyKey: payload.idempotencyKey || null,
        idempotencyFingerprint,
        creditAccountId: creditAccount.id,
        branchId: creditAccount.branchId,
        customerId: creditAccount.customerId,
        collectedById: actor.id,
        createdById: actor.id,
      },
      include: CREDIT_COLLECTION_RESULT_INCLUDE,
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

    await syncLinkedSalePaymentStatus(tx, updatedCreditAccount);

    await createAuditLog(
      {
        actor,
        branchId: creditAccount.branchId,
        action: "RECEIVABLE_COLLECTION_POSTED",
        entityType: "CreditCollection",
        entityId: collection.id,
        description: `Collection ${collection.collectionCode} posted to ${creditAccount.creditCode}`,
        metadata: {
          creditAccountId: creditAccount.id,
          creditCode: creditAccount.creditCode,
          sourceType: creditAccount.sourceType,
          provider: creditAccount.provider,
          collectionCode: collection.collectionCode,
          paymentMethod: collection.paymentMethod,
          amount: toMoneyString(amount),
          previousBalance: toMoneyString(previousBalance),
          newBalance: toMoneyString(newBalance),
          paidAt: collection.paidAt.toISOString(),
        },
      },
      tx
    );

    if (paymentMethod === "CASH") {
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
      collection: formatCreditCollection(collection),
      creditAccount: formatCreditAccount(updatedCreditAccount),
      replayed: false,
    };
  });
};

const cancelCreditCollection = async (
  actor,
  collectionId,
  payload,
  database = prisma
) => {
  ensureCanCancelCollection(actor);

  return database.$transaction(async (tx) => {
    const collectionReference = await tx.creditCollection.findUnique({
      where: {
        id: collectionId,
      },
      select: {
        id: true,
        creditAccountId: true,
      },
    });

    if (!collectionReference) {
      const error = new Error("CREDIT_COLLECTION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    const accountReference = await tx.creditAccount.findUnique({
      where: {
        id: collectionReference.creditAccountId,
      },
      select: {
        id: true,
        saleId: true,
        serviceJobId: true,
      },
    });

    if (!accountReference) {
      const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    await lockReceivableSource(tx, accountReference);
    await lockCreditAccount(tx, collectionReference.creditAccountId);
    await lockCreditCollection(tx, collectionId);

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

    const lockedCreditAccount = await tx.creditAccount.findUnique({
      where: {
        id: collection.creditAccountId,
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

    const creditAccount = lockedCreditAccount;

    if (!creditAccount || !["ACTIVE", "PAID"].includes(creditAccount.status)) {
      const error = new Error("CREDIT_ACCOUNT_NOT_REVERSIBLE");
      error.statusCode = 400;
      throw error;
    }

    const collectionAmount = toMoney(Number(collection.amount));
    const currentRemainingBalance = toMoney(Number(creditAccount.remainingBalance));
    const currentTotalCollected = toMoney(Number(creditAccount.totalCollected));

    if (
      collectionAmount > currentTotalCollected ||
      currentRemainingBalance + collectionAmount >
        toMoney(Number(creditAccount.balanceAmount))
    ) {
      const error = new Error("CREDIT_COLLECTION_LEDGER_INCONSISTENT");
      error.statusCode = 409;
      throw error;
    }

    const restoredRemainingBalance = toMoney(currentRemainingBalance + collectionAmount);
    const restoredTotalCollected = toMoney(currentTotalCollected - collectionAmount);
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

    await syncLinkedSalePaymentStatus(tx, updatedCreditAccount);

    const reversedCash = await cashLinkService.reverseSystemCashIn(tx, actor, {
      source: "CREDIT_COLLECTION",
      sourceId: collection.id,
      type: "CREDIT_COLLECTION",
      cancellationReason: `Auto cash reversal from cancelled credit collection ${collection.collectionCode}. Reason: ${payload.cancellationReason}`,
    });

    if (collection.paymentMethod === "CASH" && !reversedCash) {
      const error = new Error("COLLECTION_CASH_LINK_NOT_FOUND");
      error.statusCode = 409;
      throw error;
    }

    await createAuditLog(
      {
        actor,
        branchId: collection.branchId,
        action: "RECEIVABLE_COLLECTION_CANCELLED",
        entityType: "CreditCollection",
        entityId: collection.id,
        description: `Collection ${collection.collectionCode} cancelled for ${creditAccount.creditCode}`,
        metadata: {
          creditAccountId: creditAccount.id,
          creditCode: creditAccount.creditCode,
          sourceType: creditAccount.sourceType,
          provider: creditAccount.provider,
          collectionCode: collection.collectionCode,
          amount: toMoneyString(collectionAmount),
          restoredBalance: toMoneyString(restoredRemainingBalance),
          cancellationReason: payload.cancellationReason,
        },
      },
      tx
    );

    return {
      collection: formatCreditCollection(cancelledCollection),
      creditAccount: formatCreditAccount(updatedCreditAccount),
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

  return formatCreditAccount(creditAccount);
};

const declareCreditAccountDefaulted = async (actor, creditAccountId, payload = {}) => {
  ensureOwnerAdmin(actor);

  if (!["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"].includes(actor.role)) {
    const error = new Error("CREDIT_DEFAULT_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  const reason = String(payload.reason || "").trim();
  if (!reason) {
    const error = new Error("DEFAULT_REASON_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const creditAccount = await tx.creditAccount.findUnique({
      where: { id: creditAccountId },
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

    if (creditAccount.status !== "ACTIVE") {
      const error = new Error("CREDIT_ACCOUNT_NOT_ACTIVE_FOR_DEFAULT");
      error.statusCode = 400;
      throw error;
    }

    const updatedCreditAccount = await tx.creditAccount.update({
      where: { id: creditAccount.id },
      data: {
        status: "DEFAULTED",
        remarks: creditAccount.remarks ? `${creditAccount.remarks} | Defaulted/Write-off: ${reason}` : `Defaulted/Write-off: ${reason}`,
        updatedById: actor.id,
      },
      include: CREDIT_ACCOUNT_DETAIL_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: creditAccount.branchId,
        action: "CREDIT_ACCOUNT_DEFAULTED",
        entityType: "CreditAccount",
        entityId: creditAccount.id,
        description: `Credit account ${creditAccount.creditCode} declared as Defaulted / Bad Debt Write-off. Loss: ₱${creditAccount.remainingBalance}`,
        metadata: {
          creditAccountId: creditAccount.id,
          creditCode: creditAccount.creditCode,
          sourceType: creditAccount.sourceType,
          provider: creditAccount.provider,
          remainingBalance: toMoneyString(creditAccount.remainingBalance),
          reason,
        },
      },
      tx
    );

    return formatCreditAccount(updatedCreditAccount);
  });
};

module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
  cancelCreditCollection,
  declareCreditAccountDefaulted,
  testInternals: {
    formatCreditAccount,
    formatCreditCollection,
  },
};
