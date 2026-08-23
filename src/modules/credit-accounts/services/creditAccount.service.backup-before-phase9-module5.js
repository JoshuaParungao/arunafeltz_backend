const prisma = require("../../../config/prisma");

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

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
};
