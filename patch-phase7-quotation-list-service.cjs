const fs = require("fs");

const filePath = "./src/modules/quotations/services/quotation.service.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getQuotations = async")) {
  console.log("SKIP: quotation list/view service already exists.");
  process.exit(0);
}

const functionsToAdd = `
const canViewInternalNotes = (actor) => {
  return OWNER_ADMIN_ROLES.has(actor.role);
};

const hideInternalNotesIfNeeded = (quotation, actor) => {
  if (!quotation) {
    return quotation;
  }

  if (canViewInternalNotes(actor)) {
    return quotation;
  }

  const { internalNotes, ...safeQuotation } = quotation;
  return safeQuotation;
};

const resolveBranchFilterForRead = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || null;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  return actor.branchId;
};

const parsePagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const getQuotations = async (actor, query) => {
  const branchId = resolveBranchFilterForRead(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.preparedById ? { preparedById: query.preparedById } : {}),
    ...(search
      ? {
          OR: [
            {
              quotationCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              title: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              notes: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              customer: {
                fullName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              customer: {
                customerCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, quotations] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
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
        preparedBy: {
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
        _count: {
          select: {
            items: true,
          },
        },
      },
    }),
  ]);

  return {
    data: quotations.map((quotation) => hideInternalNotesIfNeeded(quotation, actor)),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const getQuotationById = async (actor, quotationId) => {
  const branchId = resolveBranchFilterForRead(actor, null);

  const quotation = await prisma.quotation.findFirst({
    where: {
      id: quotationId,
      ...(branchId ? { branchId } : {}),
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
          address: true,
          companyName: true,
        },
      },
      preparedBy: {
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
      items: {
        orderBy: {
          lineNo: "asc",
        },
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              brand: true,
              modelName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!quotation) {
    const error = new Error("QUOTATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return hideInternalNotesIfNeeded(quotation, actor);
};
`;

content = content.replace(
  "module.exports = {",
  `${functionsToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createQuotation,",
  "createQuotation,\n  getQuotations,\n  getQuotationById,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.service.js patched with list/view functions.");
