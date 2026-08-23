const serviceJobService = require("../services/serviceJob.service");

const handleServiceJobError = (error, res, next) => {
  const errorMap = {
    SERVICE_JOB_CREATE_FORBIDDEN: [403, "You are not allowed to create service jobs."],
    USER_BRANCH_REQUIRED: [400, "User branch is required."],
    BRANCH_ID_REQUIRED: [400, "Branch ID is required."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found."],
    ASSIGNED_TECHNICIAN_NOT_FOUND: [404, "Assigned technician not found."],
    SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update service job status."],
    SERVICE_JOB_NOT_FOUND: [404, "Service job not found."],
    INVALID_SERVICE_JOB_STATUS_TRANSITION: [400, "Invalid service job status transition."],
    FINAL_SERVICE_CHARGE_REQUIRED: [400, "Final service charge is required when completing a service job."],
    CANCELLATION_REASON_REQUIRED: [400, "Cancellation reason is required when cancelling a service job."],
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


const updateServiceJobStatus = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.updateServiceJobStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Service job status updated successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

module.exports = {
  createServiceJob,
  updateServiceJobStatus,
};
