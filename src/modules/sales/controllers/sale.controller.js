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
    QUOTATION_CUSTOMER_MISMATCH: [400, "Sale customer must match the approved quotation."],
    QUOTATION_ITEMS_MISMATCH: [400, "Sale inventory selections must match every approved quotation line."],
    QUOTATION_SERVICE_CHARGE_NOT_ALLOWED: [400, "A converted sale cannot add a charge that is not on the approved quotation."],
    QUOTATION_SERIALIZED_QUANTITY_INVALID: [400, "Serialized quotation quantity must be a whole number."],
    QUOTATION_TOTAL_MISMATCH: [400, "Approved quotation totals are inconsistent and cannot be converted."],
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    PRICE_TIER_REQUIRED: [400, "Price tier is required for inventory item."],
    STAFF_CUSTOM_PRICE_NOT_ALLOWED: [403, "Staff cannot set custom price for inventory items."],
    DESCRIPTION_REQUIRED: [400, "Description is required for custom sale line."],
    UNIT_PRICE_REQUIRED: [400, "Unit price is required for custom sale line."],
    INVALID_MARKUP_PERCENT: [400, "Mark up percentage must be at least 0 and less than 100."],
    RECEIVABLE_REQUIRED_FOR_OUTSTANDING_BALANCE: [400, "Select an accounts-receivable provider for the outstanding balance."],
    INVALID_RECEIVABLE_PROVIDER: [400, "Select a valid accounts-receivable provider."],
    INVALID_RECEIVABLE_SOURCE_TOTAL: [400, "Receivable source total must be greater than zero."],
    INVALID_RECEIVABLE_INITIAL_SETTLEMENT: [400, "Initial settlement must be a valid non-negative amount."],
    RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL: [400, "Initial settlement cannot exceed the transaction total."],
    RECEIVABLE_BALANCE_REQUIRED: [400, "A receivable requires an outstanding transaction balance."],
    IN_HOUSE_CUSTOMER_REQUIRED: [400, "In-house installment requires an active customer."],
    IN_HOUSE_TERM_REQUIRED: [400, "Select an installment term for the in-house receivable."],
    EXTERNAL_RECEIVABLE_INSTALLMENT_FIELDS_NOT_ALLOWED: [400, "Installment terms apply only to in-house receivables."],
    INVALID_INSTALLMENT_COMPUTATION: [500, "The saved installment configuration produced an invalid balance."],
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
    SALE_IDEMPOTENCY_CONFLICT: [409, "This sale idempotency key was already used for a different request."],
    SALE_CHANGE_EXCEEDS_CASH_TENDER: [400, "Change cannot exceed the cash portion of the tender."],
    CASH_SOURCE_CONFLICT: [409, "The sale cash source conflicts with an existing cash event."],
    COLLECTION_CASH_LINK_NOT_FOUND: [409, "A linked collection cash event could not be identified safely."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    DEFAULT_CASH_BOX_NOT_FOUND: [400, "The branch does not have an active default cash box."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],
    SALE_RETURN_FORBIDDEN: [403, "Only owner/admin roles can return sale items."],
    SALE_NOT_RETURNABLE: [400, "Only completed or partially refunded sales can accept item returns."],
    SALE_RETURN_CREDIT_UNSUPPORTED: [400, "Credit-linked sales cannot be partially returned. Resolve the credit account through its audited workflow."],
    DUPLICATE_RETURN_SALE_ITEM: [400, "A sale line can only appear once in a return."],
    SALE_ITEM_NOT_FOUND: [404, "Sale item not found."],
    RETURN_CUSTOM_LINE_UNSUPPORTED: [400, "This return workflow supports inventory product lines only."],
    RETURN_QUANTITY_EXCEEDS_REMAINING: [400, "Return quantity exceeds the remaining quantity for this sale line."],
    SERIAL_RETURN_SELECTION_INVALID: [400, "Serialized returns require the exact sold serial and full remaining unit."],
    SERIAL_RETURN_STATUS_INVALID: [400, "Only a serial currently marked SOLD can be returned."],
    RETURN_REFUND_AMOUNT_MISMATCH: [400, "Refund amount must equal the backend-calculated returned line total."],
    ZERO_REFUND_REQUIRES_NONE_METHOD: [400, "A zero-value return must use no-refund method."],
    REFUND_METHOD_REQUIRED: [400, "Select a refund method for a positive refund."],
    RETURN_REFUND_EXCEEDS_PAID_AMOUNT: [400, "Refund exceeds the remaining amount originally paid."],
    RETURN_REFUND_METHOD_EXCEEDS_PAYMENT: [400, "Refund exceeds the remaining amount paid through the selected method."],
    STORE_CREDIT_CUSTOMER_REQUIRED: [400, "Store credit requires a named customer."],
    INSUFFICIENT_CASH_FOR_REFUND: [400, "The active branch cash box has insufficient cash for this refund."],
    DEFAULT_CASH_BOX_NOT_FOUND: [400, "The branch does not have an active default cash box."],
    INCENTIVE_CLAIM_SETTLEMENT_REQUIRED: [409, "This sale is already included in an incentive claim. Resolve the claim through an audited settlement before returning its items."],
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

    return res.status(sale.replayed ? 200 : 201).json({
      success: true,
      message: sale.replayed
        ? "Sale replayed successfully"
        : "Sale created successfully",
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

const createSaleReturn = async (req, res, next) => {
  try {
    const result = await saleService.createSaleReturn(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Sale item return completed successfully",
      data: result,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

module.exports = {
  createSale,
  createSaleReturn,
  getSales,
  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};
