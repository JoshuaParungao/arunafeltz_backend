const saleService = require("../services/sale.service");

const handleSaleError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    BRANCH_ACCESS_DENIED: [403, "You cannot create sale for this branch."],
    BRANCH_NOT_FOUND: [404, "Branch not found."],
    BRANCH_INACTIVE: [400, "Branch is inactive."],
    CUSTOMER_NOT_FOUND: [404, "Customer not found for this branch."],
    CUSTOMER_INACTIVE: [400, "Customer is inactive."],
    QUOTATION_NOT_FOUND: [404, "Quotation not found for this branch."],
    QUOTATION_NOT_APPROVED: [400, "Quotation must be approved before linking to sale."],
    QUOTATION_ALREADY_CONVERTED: [400, "Quotation is already converted to sale."],
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    PRICE_TIER_REQUIRED: [400, "Price tier is required for inventory item."],
    STAFF_CUSTOM_PRICE_NOT_ALLOWED: [403, "Staff cannot set custom price for inventory items."],
    DESCRIPTION_REQUIRED: [400, "Description is required for custom sale line."],
    UNIT_PRICE_REQUIRED: [400, "Unit price is required for custom sale line."],
    DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],
    BATCH_REQUIRED: [400, "Batch is required for non-serialized inventory item."],
    BATCH_NOT_FOUND: [404, "Batch not found for this item and branch."],
    INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],
    SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: [400, "Serial is not allowed for non-serialized item."],
    SERIAL_REQUIRED: [400, "Serial is required for serialized item."],
    SERIAL_NOT_FOUND: [404, "Serial not found for this item and branch."],
    SERIAL_NOT_AVAILABLE: [400, "Serial is not available."],
    SERIAL_BATCH_REQUIRED: [400, "Serialized item must be linked to a batch."],
    SERIAL_BATCH_MISMATCH: [400, "Selected batch does not match the serial batch."],
    SERIALIZED_QUANTITY_MUST_BE_ONE: [400, "Serialized item quantity must be 1 per sale line."],
    CUSTOM_LINE_INVENTORY_LINK_NOT_ALLOWED: [400, "Custom sale line cannot have batch or serial link."],
    SALE_NOT_FOUND: [404, "Sale not found."],
    SERIAL_CANCEL_STATUS_INVALID: [400, "Only SOLD serials can be restored during sale cancellation."],
    SALE_NOT_CANCELLABLE: [400, "Only completed sales can be cancelled."],
    SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],
    SALE_NOT_CREDITABLE: [400, "Only completed sales can be converted to credit account."],
    SALE_CUSTOMER_REQUIRED_FOR_CREDIT: [400, "Sale must have a customer before creating credit account."],
    SALE_ALREADY_HAS_CREDIT_ACCOUNT: [400, "Sale already has a credit account."],
    CREDIT_DOWNPAYMENT_EXCEEDS_TOTAL: [400, "Sale amount paid cannot exceed sale grand total."],
    INVALID_INSTALLMENT_TERM: [400, "Invalid installment term."],
    INVALID_FIRST_DUE_DATE: [400, "Invalid first due date."],
    INSTALLMENT_TERM_NOT_CONFIGURED: [400, "Installment term is not configured in settings."],
    INVALID_CASH_DOWNPAYMENT: [400, "Cash downpayment cannot be greater than cash promo total amount."],
    INVALID_SETTING_VALUE: [500, "Invalid installment setting value."],
    REQUIRED_SETTING_MISSING: [500, "Required installment setting is missing."],
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

const createSale = async (req, res, next) => {
  try {
    const sale = await saleService.createSale(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Sale created successfully",
      data: sale,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};


const getSales = async (req, res, next) => {
  try {
    const result = await saleService.getSales(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Sales retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

const getSaleById = async (req, res, next) => {
  try {
    const sale = await saleService.getSaleById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Sale retrieved successfully",
      data: sale,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};


const createCreditAccountFromSale = async (req, res, next) => {
  try {
    const creditAccount = await saleService.createCreditAccountFromSale(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Credit account created successfully",
      data: creditAccount,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

const cancelSale = async (req, res, next) => {
  try {
    const sale = await saleService.cancelSale(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Sale cancelled successfully",
      data: sale,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};
