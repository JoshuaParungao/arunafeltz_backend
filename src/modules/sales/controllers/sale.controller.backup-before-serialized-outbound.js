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
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    PRICE_TIER_REQUIRED: [400, "Price tier is required for inventory item."],
    STAFF_CUSTOM_PRICE_NOT_ALLOWED: [403, "Staff cannot set custom price for inventory items."],
    DESCRIPTION_REQUIRED: [400, "Description is required for custom sale line."],
    UNIT_PRICE_REQUIRED: [400, "Unit price is required for custom sale line."],
    DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],
    SERIALIZED_SALE_NOT_READY: [400, "Serialized item sale requires serial outbound module."],
    SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: [400, "Serial is not allowed for non-serialized item."],
    INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],
    BATCH_NOT_FOUND: [404, "Batch not found for this item and branch."],
    BATCH_REQUIRED: [400, "Batch is required for non-serialized inventory item."],
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

module.exports = {
  createSale,
};
