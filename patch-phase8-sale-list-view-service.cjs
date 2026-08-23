const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getSales = async")) {
  console.log("SKIP: sale list/view service already exists.");
  process.exit(0);
}

const serviceFunctions = `
const parsePagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const resolveBranchFilterForRead = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || undefined;
  }

  return actor.branchId;
};

const ensureCanAccessSaleBranch = (actor, sale) => {
  if (isSuperOwner(actor)) {
    return;
  }

  if (!actor.branchId || sale.branchId !== actor.branchId) {
    const error = new Error("SALE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const getSales = async (actor, query) => {
  const { page, limit, skip } = parsePagination(query);
  const branchId = resolveBranchFilterForRead(actor, query.branchId);

  const where = {};

  if (branchId) {
    where.branchId = branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.paymentStatus) {
    where.paymentStatus = query.paymentStatus;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.cashierId) {
    where.cashierId = query.cashierId;
  }

  if (query.search) {
    const search = String(query.search).trim();

    where.OR = [
      {
        receiptCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        remarks: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        saleDate: "desc",
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
            mobileNumber: true,
            email: true,
          },
        },
        quotation: {
          select: {
            id: true,
            quotationCode: true,
            status: true,
          },
        },
        cashier: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        _count: {
          select: {
            items: true,
            payments: true,
          },
        },
      },
    }),
    prisma.sale.count({
      where,
    }),
  ]);

  return {
    data: sales,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getSaleById = async (actor, saleId) => {
  const sale = await prisma.sale.findUnique({
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
          mobileNumber: true,
          email: true,
        },
      },
      quotation: {
        select: {
          id: true,
          quotationCode: true,
          status: true,
        },
      },
      cashier: {
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
      items: {
        orderBy: {
          lineNo: "asc",
        },
      },
      payments: {
        orderBy: {
          paidAt: "asc",
        },
      },
    },
  });

  if (!sale) {
    const error = new Error("SALE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessSaleBranch(actor, sale);

  return sale;
};
`;

content = content.replace(
  "module.exports = {",
  `${serviceFunctions}\nmodule.exports = {`
);

content = content.replace(
  "createSale,",
  "createSale,\n  getSales,\n  getSaleById,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.service.js patched with list/view functions.");
