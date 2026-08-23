const serviceJobService = require("../services/serviceJob.service");

const handleServiceJobError = (error, res, next) => {
  const errorMap = {
    SERVICE_JOB_CREATE_FORBIDDEN: [403, "You are not allowed to create service jobs."],
    USER_BRANCH_REQUIRED: [400, "User branch is required."],
    BRANCH_ID_REQUIRED: [400, "Branch ID is required."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found."],
    ASSIGNED_TECHNICIAN_NOT_FOUND: [404, "Assigned technician not found."],
  };

  if (errorMap[error.message]) {
    const [statusCode, message] = errorMap[error.message];

    return res.status(statusCode).json({
      success: false,
      message,
      errorCode: error.message,
    });
  }

  return next(error);
};

const createServiceJob = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.createServiceJob(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Service job created successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

module.exports = {
  createServiceJob,
};
