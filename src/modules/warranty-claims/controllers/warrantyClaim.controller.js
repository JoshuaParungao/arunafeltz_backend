const warrantyClaimService = require("../services/warrantyClaim.service");

const handleWarrantyClaimError = (error, res, next) => {
  const errorMap = {
    WARRANTY_CLAIM_CREATE_FORBIDDEN: [403, "You are not allowed to create warranty claims."],
    WARRANTY_CLAIM_VIEW_FORBIDDEN: [403, "You are not allowed to view warranty claims."],
    WARRANTY_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update warranty status."],
    WARRANTY_RELEASE_FORBIDDEN: [403, "You are not allowed to release warranty claims."],
    WARRANTY_CLAIM_ALREADY_RELEASED: [400, "Warranty claim is already released."],
    WARRANTY_CLAIM_NOT_READY_FOR_RELEASE: [400, "Warranty claim is not ready for release."],
    USER_BRANCH_REQUIRED: [400, "User must belong to a branch."],
    BRANCH_ID_REQUIRED: [400, "Branch ID is required."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found."],
    ITEM_NOT_FOUND: [404, "Item not found."],
    SERIAL_NOT_FOUND: [404, "Serial not found."],
    SALE_NOT_FOUND: [404, "Sale not found."],
    SALE_ITEM_NOT_FOUND: [404, "Sale item not found."],
    SALE_ITEM_SALE_MISMATCH: [400, "Sale item does not belong to the selected sale."],
    CUSTOMER_SALE_MISMATCH: [400, "Customer does not match the selected sale."],
    CUSTOMER_SALE_ITEM_MISMATCH: [400, "Customer does not match the selected sale item."],
    SERIAL_ITEM_MISMATCH: [400, "Serial does not belong to the selected item."],
    SALE_ITEM_ITEM_MISMATCH: [400, "Sale item does not belong to the selected item."],
    SALE_ITEM_SERIAL_MISMATCH: [400, "Sale item does not belong to the selected serial."],
    WARRANTY_CLAIM_NOT_FOUND: [404, "Warranty claim not found."],
    INVALID_WARRANTY_STATUS_TRANSITION: [400, "Invalid warranty status transition."],
    SERIAL_ALREADY_CLAIMED: [400, "Fraud Prevention: This item / serial was already claimed and resolved."],
    WARRANTY_CLAIM_ALREADY_SETTLED_OR_REJECTED: [400, "This warranty claim has already been settled or rejected."],
    REPLACEMENT_ITEM_REQUIRED: [400, "Replacement item is required."],
    REPLACEMENT_SERIAL_REQUIRED: [400, "Replacement serial number is required for serialized items."],
    REPLACEMENT_SERIAL_NOT_AVAILABLE: [400, "Selected replacement serial is not available in branch stock."],
    INSUFFICIENT_STOCK_FOR_REPLACEMENT: [400, "Insufficient branch stock to issue replacement unit."],
    SUPPLIER_NAME_REQUIRED: [400, "Supplier name is required."],
    INVALID_SUPPLIER_OUTCOME: [400, "Invalid supplier RMA outcome."],
    SUPPLIER_REJECTION_REASON_REQUIRED: [400, "Supplier rejection reason is required."],
    REJECTION_REASON_REQUIRED: [400, "Rejection reason is required."],
  };

  if (errorMap[error.message]) {
    const [statusCode, message] = errorMap[error.message];

    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: error.message,
      },
    });
  }

  return next(error);
};

const createWarrantyClaim = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.createWarrantyClaim(
      req.user,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Warranty claim created successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const getWarrantyClaims = async (req, res, next) => {
  try {
    const result = await warrantyClaimService.getWarrantyClaims(
      req.user,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claims fetched successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const getWarrantyClaimById = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.getWarrantyClaimById(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claim fetched successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const releaseWarrantyClaim = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.releaseWarrantyClaim(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claim released successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const updateWarrantyClaimStatus = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.updateWarrantyClaimStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claim status updated successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const processImmediateReplacement = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.processImmediateReplacement(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Immediate replacement processed and branch stock updated successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const dispatchToSupplier = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.dispatchToSupplier(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Item marked as dispatched to supplier",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const resolveSupplierRma = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.resolveSupplierRma(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Supplier RMA resolved successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const rejectCustomerClaim = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.rejectCustomerClaim(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Customer warranty claim rejected",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

module.exports = {
  createWarrantyClaim,
  getWarrantyClaimById,
  getWarrantyClaims,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
  processImmediateReplacement,
  dispatchToSupplier,
  resolveSupplierRma,
  rejectCustomerClaim,
};
