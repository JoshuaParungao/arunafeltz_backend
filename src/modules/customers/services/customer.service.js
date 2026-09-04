const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const CUSTOMER_SELECT = {
  id: true,
  customerCode: true,
  fullName: true,
  mobileNumber: true,
  email: true,
  address: true,
  companyName: true,
  notes: true,
  status: true,
  priceTier: true,
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  createdById: true,
  createdBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  updatedById: true,
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const getActorBranchIdForCreate = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      throw new AppError(
        "Branch ID is required for Super Owner customer creation",
        400,
        "BRANCH_ID_REQUIRED"
      );
    }

    return requestedBranchId;
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new AppError(
      "You can only create customers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const getBranchIdForList = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    return requestedBranchId || undefined;
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new AppError(
      "You can only view customers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertCustomerAccess = (customer, actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    return;
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (customer.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access customers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const getActiveBranchOrThrow = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: {
      id: branchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (branch.status !== "ACTIVE") {
    throw new AppError("Branch is not active", 400, "BRANCH_NOT_ACTIVE");
  }

  return branch;
};

const generateCustomerCode = async (branch) => {
  const prefix = `CUST-${branch.code}-`;

  const existingCustomers = await prisma.customer.findMany({
    where: {
      branchId: branch.id,
      customerCode: {
        startsWith: prefix,
      },
    },
    select: {
      customerCode: true,
    },
  });

  let highestNumber = 0;

  for (const customer of existingCustomers) {
    const suffix = customer.customerCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  const nextNumber = highestNumber + 1;

  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
};

const assertCustomerCodeIsUnique = async (branchId, customerCode) => {
  const existingCustomer = await prisma.customer.findUnique({
    where: {
      branchId_customerCode: {
        branchId,
        customerCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCustomer) {
    throw new AppError(
      "Customer code already exists in this branch",
      409,
      "CUSTOMER_CODE_ALREADY_EXISTS"
    );
  }
};

const assertCustomerCodeIsUniqueForUpdate = async (
  branchId,
  customerCode,
  currentCustomerId
) => {
  const existingCustomer = await prisma.customer.findUnique({
    where: {
      branchId_customerCode: {
        branchId,
        customerCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCustomer && existingCustomer.id !== currentCustomerId) {
    throw new AppError(
      "Customer code already exists in this branch",
      409,
      "CUSTOMER_CODE_ALREADY_EXISTS"
    );
  }
};

const createCustomer = async (payload, actor) => {
  const branchId = getActorBranchIdForCreate(actor, payload.branchId);
  const branch = await getActiveBranchOrThrow(branchId);

  const customerCode = payload.customerCode
    ? payload.customerCode.trim().toUpperCase()
    : await generateCustomerCode(branch);

  await assertCustomerCodeIsUnique(branch.id, customerCode);

  return prisma.customer.create({
    data: {
      customerCode,
      fullName: payload.fullName.trim(),
      mobileNumber: normalizeOptionalString(payload.mobileNumber),
      email: normalizeOptionalString(payload.email),
      address: normalizeOptionalString(payload.address),
      companyName: normalizeOptionalString(payload.companyName),
      notes: normalizeOptionalString(payload.notes),
      status: "ACTIVE",
      priceTier: payload.priceTier ? Number(payload.priceTier) : 1,
      branchId: branch.id,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: CUSTOMER_SELECT,
  });
};

const listCustomers = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const branchId = getBranchIdForList(actor, filters.branchId);
  const search = filters.search ? filters.search.trim() : null;

  const where = {
    branchId,
    status: filters.status,
  };

  if (search) {
    where.OR = [
      {
        customerCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        fullName: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        mobileNumber: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        companyName: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          customerCode: "asc",
        },
      ],
      skip,
      take: safeLimit,
    }),
    prisma.customer.count({
      where,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / safeLimit) || 1;

  return {
    items,
    pagination: {
      page,
      limit: safeLimit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getCustomerById = async (customerId, actor) => {
  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId,
    },
    select: CUSTOMER_SELECT,
  });

  if (!customer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  assertCustomerAccess(customer, actor);

  return customer;
};

const getCustomerHistory = async (customerId, filters = {}, actor) => {
  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
      branchId: true,
    },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  assertCustomerAccess(customer, actor);

  const requestedLimit = Number.parseInt(filters.limit || "50", 10);
  const limit = Math.min(requestedLimit, 100);
  const historyWhere = {
    customerId: customer.id,
    branchId: customer.branchId,
  };

  const [
    quotations,
    quotationCount,
    sales,
    saleCount,
    creditAccounts,
    creditAccountCount,
    outstandingCredit,
    serviceJobs,
    serviceJobCount,
    warrantyClaims,
    warrantyClaimCount,
  ] = await prisma.$transaction([
    prisma.quotation.findMany({
      where: historyWhere,
      select: {
        id: true,
        quotationCode: true,
        title: true,
        status: true,
        subtotal: true,
        totalDiscount: true,
        grandTotal: true,
        isPcBuild: true,
        validUntil: true,
        sentAt: true,
        approvedAt: true,
        convertedAt: true,
        cancelledAt: true,
        createdAt: true,
        preparedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        items: {
          select: {
            id: true,
            lineNo: true,
            description: true,
            priceTier: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            warrantyDuration: true,
            remarks: true,
          },
          orderBy: {
            lineNo: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    }),
    prisma.quotation.count({
      where: historyWhere,
    }),
    prisma.sale.findMany({
      where: historyWhere,
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
        createdAt: true,
        quotation: {
          select: {
            id: true,
            quotationCode: true,
          },
        },
        cashier: {
          select: {
            id: true,
            fullName: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentCode: true,
            paymentMethod: true,
            amount: true,
            status: true,
          },
        },
        items: {
          select: {
            id: true,
            lineNo: true,
            description: true,
            priceTier: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            warrantyDuration: true,
            serial: {
              select: {
                id: true,
                serialNumber: true,
              },
            },
          },
          orderBy: {
            lineNo: "asc",
          },
        },
      },
      orderBy: [
        {
          saleDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: limit,
    }),
    prisma.sale.count({
      where: historyWhere,
    }),
    prisma.creditAccount.findMany({
      where: historyWhere,
      select: {
        id: true,
        creditCode: true,
        status: true,
        term: true,
        regularPriceTotalAmount: true,
        downpaymentAmount: true,
        balanceAmount: true,
        monthlyDueAmount: true,
        totalCollected: true,
        remainingBalance: true,
        firstDueDate: true,
        nextDueDate: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        sale: {
          select: {
            id: true,
            receiptCode: true,
          },
        },
        _count: {
          select: {
            collections: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    }),
    prisma.creditAccount.count({
      where: historyWhere,
    }),
    prisma.creditAccount.aggregate({
      where: {
        ...historyWhere,
        status: {
          in: ["ACTIVE", "DEFAULTED"],
        },
      },
      _sum: {
        remainingBalance: true,
      },
    }),
    prisma.serviceJob.findMany({
      where: historyWhere,
      select: {
        id: true,
        jobCode: true,
        jobTitle: true,
        deviceDescription: true,
        problemDescription: true,
        diagnosis: true,
        serviceNotes: true,
        serialNumber: true,
        isQuickService: true,
        finalServiceCharge: true,
        status: true,
        releaseOutcome: true,
        receivedAt: true,
        startedAt: true,
        completedAt: true,
        releasedAt: true,
        assignedTechnician: {
          select: {
            id: true,
            fullName: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentCode: true,
            amount: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
          },
        },
      },
      orderBy: {
        receivedAt: "desc",
      },
      take: limit,
    }),
    prisma.serviceJob.count({
      where: historyWhere,
    }),
    prisma.warrantyClaim.findMany({
      where: historyWhere,
      select: {
        id: true,
        claimCode: true,
        status: true,
        issueDescription: true,
        customerComplaint: true,
        diagnosis: true,
        actionTaken: true,
        receivedAt: true,
        repairedAt: true,
        replacedAt: true,
        releasedAt: true,
        item: {
          select: {
            id: true,
            itemCode: true,
            name: true,
          },
        },
        serial: {
          select: {
            id: true,
            serialNumber: true,
          },
        },
        sale: {
          select: {
            id: true,
            receiptCode: true,
            saleDate: true,
          },
        },
      },
      orderBy: {
        receivedAt: "desc",
      },
      take: limit,
    }),
    prisma.warrantyClaim.count({
      where: historyWhere,
    }),
  ]);

  const recentCollections = await Promise.all(
    creditAccounts.map((creditAccount) =>
      prisma.creditCollection.findMany({
        where: {
          creditAccountId: creditAccount.id,
          customerId: customer.id,
          branchId: customer.branchId,
        },
        select: {
          id: true,
          collectionCode: true,
          status: true,
          amount: true,
          paymentMethod: true,
          referenceNo: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: "desc",
        },
        take: 10,
      })
    )
  );

  const creditAccountsWithCollections = creditAccounts.map(
    (creditAccount, index) => ({
      ...creditAccount,
      collections: recentCollections[index],
    })
  );

  const completedSalesTotal = sales
    .filter((s) => ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(s.status))
    .reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);

  const completedServicesTotal = serviceJobs
    .filter((j) => j.status === "COMPLETED" || Boolean(j.releasedAt))
    .reduce((sum, j) => sum + Number(j.finalServiceCharge || 0), 0);

  const totalLifetimeSpent = completedSalesTotal + completedServicesTotal;

  return {
    summary: {
      quotationCount,
      saleCount,
      creditAccountCount,
      serviceJobCount,
      warrantyClaimCount,
      totalLifetimeSpent,
      completedSalesTotal,
      completedServicesTotal,
      outstandingCreditBalance: outstandingCredit._sum.remainingBalance || "0",
    },
    quotations: {
      items: quotations,
      totalItems: quotationCount,
      limit,
    },
    sales: {
      items: sales,
      totalItems: saleCount,
      limit,
    },
    serviceJobs: {
      items: serviceJobs,
      totalItems: serviceJobCount,
      limit,
    },
    creditAccounts: {
      items: creditAccountsWithCollections,
      totalItems: creditAccountCount,
      limit,
    },
    warrantyClaims: {
      items: warrantyClaims,
      totalItems: warrantyClaimCount,
      limit,
    },
  };
};

const updateCustomerById = async (customerId, payload, actor) => {
  const existingCustomer = await prisma.customer.findUnique({
    where: {
      id: customerId,
    },
    select: CUSTOMER_SELECT,
  });

  if (!existingCustomer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  assertCustomerAccess(existingCustomer, actor);

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.customerCode !== undefined) {
    const customerCode = payload.customerCode.trim().toUpperCase();

    await assertCustomerCodeIsUniqueForUpdate(
      existingCustomer.branchId,
      customerCode,
      existingCustomer.id
    );

    updateData.customerCode = customerCode;
  }

  if (payload.fullName !== undefined) {
    updateData.fullName = payload.fullName.trim();
  }

  if (payload.mobileNumber !== undefined) {
    updateData.mobileNumber = normalizeOptionalString(payload.mobileNumber);
  }

  if (payload.email !== undefined) {
    updateData.email = normalizeOptionalString(payload.email);
  }

  if (payload.address !== undefined) {
    updateData.address = normalizeOptionalString(payload.address);
  }

  if (payload.companyName !== undefined) {
    updateData.companyName = normalizeOptionalString(payload.companyName);
  }

  if (payload.notes !== undefined) {
    updateData.notes = normalizeOptionalString(payload.notes);
  }

  if (payload.status !== undefined) {
    updateData.status = payload.status;
  }

  if (payload.priceTier !== undefined) {
    updateData.priceTier = Number(payload.priceTier);
  }

  return prisma.customer.update({
    where: {
      id: existingCustomer.id,
    },
    data: updateData,
    select: CUSTOMER_SELECT,
  });
};

module.exports = {
  CUSTOMER_SELECT,
  createCustomer,
  listCustomers,
  getCustomerById,
  getCustomerHistory,
  updateCustomerById,
};
