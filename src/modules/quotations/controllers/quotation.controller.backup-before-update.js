const quotationService = require("../services/quotation.service");

const handleQuotationError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    BRANCH_ACCESS_DENIED: [403, "You cannot create quotation for this branch."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    BRANCH_INACTIVE: [400, "Branch is inactive."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found for this branch."],
    CUSTOMER_INACTIVE: [400, "Customer is inactive."],
    PREPARED_BY_NOT_FOUND: [404, "Prepared by user not found for this branch."],
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    STAFF_CUSTOM_PRICE_NOT_ALLOWED: [403, "Staff cannot set custom price for inventory items."],
    DESCRIPTION_REQUIRED: [400, "Description is required for custom quotation line."],
    UNIT_PRICE_REQUIRED: [400, "Unit price is required for custom quotation line."],
    DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],
    QUOTATION_NOT_FOUND: [404, "Quotation not found."],
  };

  if (knownErrors[error.message]) {
    const [status, message] = knownErrors[error.message];

    return res.status(status).json({
      success: false,
      message,
      errorCode: error.message,
    });
  }

  return next(error);
};

const createQuotation = async (req, res, next) => {
  try {
    const quotation = await quotationService.createQuotation(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully",
      data: quotation,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};


const getQuotations = async (req, res, next) => {
  try {
    const result = await quotationService.getQuotations(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Quotations fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};

const getQuotationById = async (req, res, next) => {
  try {
    const quotation = await quotationService.getQuotationById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Quotation fetched successfully",
      data: quotation,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};

module.exports = {
  createQuotation,
  getQuotations,
  getQuotationById,
};
