const prisma = require("../../../config/prisma");

const CREATE_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
  "CASHIER",
]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const ensureCanCreateServiceJob = (actor) => {
  if (!CREATE_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_CREATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const generateServiceJobCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `SVC-${branchCode}-${datePart}-`;

  const latestJob = await tx.serviceJob.findFirst({
    where: {
      branchId,
      jobCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      jobCode: "desc",
    },
    select: {
      jobCode: true,
    },
  });

  let nextNumber = 1;

  if (latestJob) {
    const latestNumberText = latestJob.jobCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};



const VIEW_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
  "CASHIER",
]);

const ensureCanViewServiceJobs = (actor) => {
  if (!VIEW_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_VIEW_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const UPDATE_SERVICE_JOB_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
]);

const STATUS_TRANSITIONS = {
  PENDING: new Set(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: new Set(["READY_FOR_RELEASE", "CANCELLED"]),
  READY_FOR_RELEASE: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

const ensureCanUpdateServiceJobStatus = (actor) => {
  if (!UPDATE_SERVICE_JOB_STATUS_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_STATUS_UPDATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanAccessServiceJobBranch = (actor, serviceJob) => {
  if (!isSuperOwner(actor) && serviceJob.branchId !== actor.branchId) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const SERVICE_JOB_INCLUDE = {
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
  assignedTechnician: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
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
};

const resolveBranchForCreate = async (tx, actor, payload) => {
  if (isSuperOwner(actor)) {
    if (!payload.branchId) {
      const error = new Error("BRANCH_ID_REQUIRED");
      error.statusCode = 400;
      throw error;
    }

    const branch = await tx.branch.findUnique({
      where: {
        id: payload.branchId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    if (!branch || branch.status !== "ACTIVE") {
      const error = new Error("BRANCH_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    return branch;
  }

  const branch = await tx.branch.findUnique({
    where: {
      id: actor.branchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch || branch.status !== "ACTIVE") {
    const error = new Error("BRANCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return branch;
};

const validateCustomer = async (tx, branchId, customerId) => {
  if (!customerId) {
    return null;
  }

  const customer = await tx.customer.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
      branchId: true,
      status: true,
    },
  });

  if (!customer || customer.status !== "ACTIVE" || customer.branchId !== branchId) {
    const error = new Error("CUSTOMER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return customer;
};

const validateAssignedTechnician = async (tx, branchId, assignedTechnicianId) => {
  if (!assignedTechnicianId) {
    return null;
  }

  const technician = await tx.user.findUnique({
    where: {
      id: assignedTechnicianId,
    },
    select: {
      id: true,
      branchId: true,
      role: true,
      status: true,
    },
  });

  if (
    !technician ||
    technician.status !== "ACTIVE" ||
    technician.role !== "TECHNICIAN" ||
    technician.branchId !== branchId
  ) {
    const error = new Error("ASSIGNED_TECHNICIAN_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return technician;
};

const createServiceJob = async (actor, payload) => {
  ensureCanCreateServiceJob(actor);

  return prisma.$transaction(async (tx) => {
    const branch = await resolveBranchForCreate(tx, actor, payload);

    const customer = await validateCustomer(tx, branch.id, payload.customerId);
    const assignedTechnician = await validateAssignedTechnician(
      tx,
      branch.id,
      payload.assignedTechnicianId
    );

    const jobCode = await generateServiceJobCode(tx, branch.code, branch.id);
    const estimatedServiceCharge = toMoney(payload.estimatedServiceCharge || 0);

    const serviceJob = await tx.serviceJob.create({
      data: {
        jobCode,
        status: "PENDING",
        jobTitle: payload.jobTitle,
        deviceDescription: payload.deviceDescription || null,
        problemDescription: payload.problemDescription || null,
        diagnosis: payload.diagnosis || null,
        serviceNotes: payload.serviceNotes || null,
        estimatedServiceCharge: toMoneyString(estimatedServiceCharge),
        finalServiceCharge: "0.00",
        branchId: branch.id,
        customerId: customer ? customer.id : null,
        assignedTechnicianId: assignedTechnician ? assignedTechnician.id : null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: SERVICE_JOB_INCLUDE,
    });

    return serviceJob;
  });
};



const buildServiceJobWhere = (actor, query = {}) => {
  const where = {};

  if (isSuperOwner(actor)) {
    if (query.branchId) {
      where.branchId = query.branchId;
    }
  } else {
    where.branchId = actor.branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.assignedTechnicianId) {
    where.assignedTechnicianId = query.assignedTechnicianId;
  }

  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      where.receivedAt.gte = query.dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }

  if (query.search) {
    where.OR = [
      {
        jobCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        jobTitle: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        deviceDescription: {
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
    ];
  }

  return where;
};

const getServiceJobs = async (actor, query = {}) => {
  ensureCanViewServiceJobs(actor);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const where = buildServiceJobWhere(actor, query);

  const [data, total] = await prisma.$transaction([
    prisma.serviceJob.findMany({
      where,
      include: SERVICE_JOB_INCLUDE,
      orderBy: {
        receivedAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.serviceJob.count({
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

const getServiceJobById = async (actor, serviceJobId) => {
  ensureCanViewServiceJobs(actor);

  const serviceJob = await prisma.serviceJob.findUnique({
    where: {
      id: serviceJobId,
    },
    include: SERVICE_JOB_INCLUDE,
  });

  if (!serviceJob) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessServiceJobBranch(actor, serviceJob);

  return serviceJob;
};

const updateServiceJobStatus = async (actor, serviceJobId, payload) => {
  ensureCanUpdateServiceJobStatus(actor);

  return prisma.$transaction(async (tx) => {
    const serviceJob = await tx.serviceJob.findUnique({
      where: {
        id: serviceJobId,
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

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    const allowedNextStatuses = STATUS_TRANSITIONS[serviceJob.status] || new Set();

    if (!allowedNextStatuses.has(payload.status)) {
      const error = new Error("INVALID_SERVICE_JOB_STATUS_TRANSITION");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      status: payload.status,
      updatedById: actor.id,
    };

    if (payload.diagnosis !== undefined) {
      updateData.diagnosis = payload.diagnosis || null;
    }

    if (payload.serviceNotes !== undefined) {
      updateData.serviceNotes = payload.serviceNotes || null;
    }

    if (payload.status === "IN_PROGRESS") {
      updateData.startedAt = new Date();
    }

    if (payload.status === "READY_FOR_RELEASE") {
      updateData.readyAt = new Date();
    }

    if (payload.status === "COMPLETED") {
      if (payload.finalServiceCharge === undefined) {
        const error = new Error("FINAL_SERVICE_CHARGE_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      updateData.finalServiceCharge = toMoneyString(payload.finalServiceCharge);
      updateData.completedAt = new Date();
    }

    if (payload.status === "CANCELLED") {
      if (!payload.cancellationReason) {
        const error = new Error("CANCELLATION_REASON_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      updateData.cancellationReason = payload.cancellationReason;
      updateData.cancelledAt = new Date();
      updateData.cancelledById = actor.id;
    }

    const updatedServiceJob = await tx.serviceJob.update({
      where: {
        id: serviceJob.id,
      },
      data: updateData,
      include: SERVICE_JOB_INCLUDE,
    });

    return updatedServiceJob;
  });
};

module.exports = {
  createServiceJob,
  getServiceJobs,
  getServiceJobById,
  updateServiceJobStatus,
};
