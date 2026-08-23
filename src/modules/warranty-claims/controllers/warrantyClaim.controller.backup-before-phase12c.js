const warrantyClaimService = require("../services/warrantyClaim.service");

const handleWarrantyClaimError = (error, res, next) => {
  const errorMap = {
    WARRANTY_CLAIM_CREATE_FORBIDDEN: [403, "You are not allowed to create warranty claims."],
    USER_BRANCH_REQUIRED: [400, "User must belong to a branch."],
    BRANCH_ID_REQUIRED: [400, "Branch ID is required."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found."],
    ITEM_NOT_FOUND: [404, "Item not found."],
    SERIAL_NOT_FOUND: [404, "Serial not found."],
    SALE_NOT_FOUND: [404, "Sale not found."],
    SALE_ITEM_NOT_FOUND: [404, "Sale item not found."],
    SALE_ITEM_SALE_MISMATCH: [400, "Sale item does not belong to the selected sale."],
    SERIAL_ITEM_MISMATCH: [400, "Serial does not belong to the selected item."],
    SALE_ITEM_ITEM_MISMATCH: [400, "Sale item does not belong to the selected item."],
    SALE_ITEM_SERIAL_MISMATCH: [400, "Sale item does not belong to the selected serial."],
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

module.exports = {
  createWarrantyClaim,
};
