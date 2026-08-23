const serviceJobService = require("../services/serviceJob.service");

const handleServiceJobError = (error, res, next) => {
  const errorMap = {
    SERVICE_JOB_CREATE_FORBIDDEN: [403, "You are not allowed to create service jobs."],
    USER_BRANCH_REQUIRED: [400, "User branch is required."],
    BRANCH_ID_REQUIRED: [400, "Branch ID is required."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found."],
    REPAIR_TYPE_REQUIRED: [400, "Repair type is required for this service job action."],
    REPAIR_TYPE_CHANGE_NOT_ALLOWED: [400, "Repair type cannot be changed after it has been recorded."],
    ASSIGNED_TECHNICIAN_NOT_FOUND: [404, "Assigned technician not found."],
    ASSIGNED_TECHNICIAN_NOT_ELIGIBLE: [400, "The assigned technician is not eligible for this repair type."],
    ASSIGNED_TECHNICIAN_REQUIRED: [400, "An assigned technician is required before service can be marked performed or completed."],
    SERVICE_TECHNICIAN_CLASSIFICATION_REQUIRED: [403, "Technician actions require a technician incentive classification."],
    BOARD_LEVEL_REQUIRES_SENIOR_TECHNICIAN: [403, "Only a senior technician may perform technician actions for a board-level repair."],
    SERVICE_DONE_BY_REQUIRED: [400, "Service Done By is required before a repaired job can be marked ready or completed."],
    SERVICE_DONE_BY_NOT_ELIGIBLE: [400, "Service Done By must be an active eligible technician in the same branch."],
    TECHNICIAN_SERVICE_DONE_BY_SELF_ONLY: [403, "A technician may only name themselves as Service Done By."],
    TECHNICIAN_CREATE_ASSIGNMENT_FORBIDDEN: [403, "Technicians may only leave a new job unassigned or assign it to themselves."],
    SERVICE_JOB_ASSIGNMENT_UPDATE_FORBIDDEN: [403, "You are not allowed to change this service assignment."],
    SERVICE_JOB_ASSIGNMENT_LOCKED: [400, "The technician assignment is locked for this terminal service job."],
    TECHNICIAN_SELF_ASSIGNMENT_ONLY: [403, "Technicians may only claim an unassigned job for themselves."],
    TECHNICIAN_ASSIGNED_JOB_ONLY: [403, "Technicians may only perform lifecycle actions on jobs assigned to them."],
    SERVICE_JOB_RELEASE_FORBIDDEN: [403, "You are not allowed to release service jobs."],
    SERVICE_JOB_ALREADY_RELEASED: [400, "Service job has already been released."],
    INVALID_SERVICE_JOB_RELEASE: [400, "The release outcome is not valid for the current service status."],
    SERVICE_PAYMENT_CREATE_FORBIDDEN: [403, "You are not allowed to create service payments."],
    SERVICE_PAYMENT_CANCEL_FORBIDDEN: [403, "You are not allowed to cancel service payments."],
    SERVICE_JOB_NOT_COMPLETED: [400, "Only completed or formally released service jobs can be paid."],
    SERVICE_JOB_ALREADY_PAID: [400, "Service job is already paid."],
    SERVICE_PAYMENT_AMOUNT_REQUIRED: [400, "Service payment amount is required."],
    INVALID_SERVICE_PAYMENT_AMOUNT: [400, "Service payment amount is invalid."],
    INVALID_SERVICE_SETTLEMENT_METHOD: [400, "Card and credit rails originate receivables and cannot be posted as immediate service settlements."],
    SERVICE_PAYMENT_EXCEEDS_BALANCE: [400, "Service payment exceeds the outstanding service balance."],
    SERVICE_RECEIVABLE_COLLECTION_REQUIRED: [400, "Post payments for this receivable through AR collections."],
    SERVICE_PAYMENT_NOT_FOUND: [404, "Service payment not found."],
    SERVICE_PAYMENT_SOURCE_MISMATCH: [409, "The service payment source linkage is inconsistent."],
    SERVICE_PAYMENT_ALREADY_CANCELLED: [400, "Service payment is already cancelled."],
    SERVICE_PAYMENT_LINKED_RECEIVABLE_REVERSAL_FORBIDDEN: [409, "This payment is part of the receivable opening snapshot and cannot be reversed independently."],
    SERVICE_PAYMENT_CASH_LINK_NOT_FOUND: [409, "The linked cash event could not be identified safely."],
    SERVICE_PAYMENT_IDEMPOTENCY_CONFLICT: [409, "This service settlement idempotency key was already used for a different request."],
    SERVICE_SETTLEMENT_CONFLICT: [409, "The service settlement conflicts with an existing request."],
    CASH_SOURCE_CONFLICT: [409, "The linked cash source conflicts with an existing cash event."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "The service payment cannot be reversed because the cash box balance would become negative."],
    CASH_BOX_NOT_ACTIVE: [400, "The linked cash box is not active."],
    DEFAULT_CASH_BOX_NOT_FOUND: [400, "The branch default cash box is not available."],
    INVALID_RECEIVABLE_PROVIDER: [400, "Receivable provider is invalid."],
    INVALID_RECEIVABLE_SOURCE_TOTAL: [400, "Receivable source total is invalid."],
    INVALID_RECEIVABLE_INITIAL_SETTLEMENT: [400, "Receivable opening settlement is invalid."],
    RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL: [400, "Immediate settlements exceed the service total."],
    RECEIVABLE_BALANCE_REQUIRED: [400, "A receivable requires a positive opening balance."],
    IN_HOUSE_CUSTOMER_REQUIRED: [400, "A customer is required for in-house installment receivables."],
    IN_HOUSE_TERM_REQUIRED: [400, "An installment term is required for in-house receivables."],
    EXTERNAL_RECEIVABLE_INSTALLMENT_FIELDS_NOT_ALLOWED: [400, "Installment schedule fields do not apply to this provider."],
    INSTALLMENT_TERM_NOT_CONFIGURED: [409, "The selected installment term is not configured."],
    SERVICE_JOB_VIEW_FORBIDDEN: [403, "You are not allowed to view service jobs."],
    SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update service job status."],
    SERVICE_JOB_NOT_FOUND: [404, "Service job not found."],
    SERVICE_JOB_COMPLETION_REQUIRES_RELEASE: [400, "Complete a ready service job through the release action so Released By is recorded correctly."],
    INVALID_SERVICE_JOB_STATUS_TRANSITION: [400, "Invalid service job status transition."],
    INVALID_BASE_SERVICE_CHARGE: [400, "Base service charge must be a valid non-negative amount."],
    BASE_SERVICE_CHARGE_REQUIRED: [400, "Base service charge is required before a markup can be applied."],
    INVALID_MARKUP_PERCENT: [400, "Markup percentage must be at least 0 and less than 100."],
    SERVICE_CHARGE_EXCEEDS_LIMIT: [400, "The calculated final service charge exceeds the supported limit."],
    FINAL_SERVICE_CHARGE_MISMATCH: [400, "Final service charge must match the backend-calculated base and markup."],
    FINAL_SERVICE_CHARGE_REQUIRED: [400, "Final service charge is required when completing a service job."],
    REPAIR_COST_PERCENT_NOT_CONFIGURED: [409, "A repair-cost percentage must be configured for this branch and repair type before a charged repair can be completed."],
    INVALID_REPAIR_FINANCIAL_CONFIGURATION: [409, "The effective repair financial configuration is invalid."],
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




const createServicePayment = async (req, res, next) => {
  try {
    const settlement = await serviceJobService.createServicePayment(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(settlement.replayed ? 200 : 201).json({
      success: true,
      message: settlement.replayed
        ? "Service settlement replayed successfully"
        : "Service settlement created successfully",
      data: settlement,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const cancelServicePayment = async (req, res, next) => {
  try {
    const payment = await serviceJobService.cancelServicePayment(
      req.user,
      req.params.paymentId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Service payment cancelled successfully",
      data: payment,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const getServiceJobs = async (req, res, next) => {
  try {
    const result = await serviceJobService.getServiceJobs(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Service jobs retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const getServiceTechnicians = async (req, res, next) => {
  try {
    const technicians = await serviceJobService.getServiceTechnicians(
      req.user,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Eligible service technicians retrieved successfully",
      data: technicians,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const getServiceJobById = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.getServiceJobById(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Service job retrieved successfully",
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

const updateServiceJobAssignment = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.updateServiceJobAssignment(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Service job assignment updated successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const releaseServiceJob = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.releaseServiceJob(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Service job released successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

module.exports = {
  cancelServicePayment,
  createServiceJob,
  createServicePayment,
  getServiceJobs,
  getServiceTechnicians,
  getServiceJobById,
  releaseServiceJob,
  updateServiceJobAssignment,
  updateServiceJobStatus,
};
