const env = require("../config/env");
const logger = require("../utils/logger");

const FRIENDLY_ERROR_MESSAGES = {
  // Authentication & Users
  PASSWORD_REQUIRED: "Password is required.",
  INVALID_CREDENTIALS: "The username or password you entered is incorrect.",
  INVALID_PASSWORD: "The password you entered is incorrect.",
  FORBIDDEN: "You do not have permission to perform this action.",
  UNAUTHORIZED: "Please sign in to proceed.",
  USER_NOT_FOUND: "The requested user account was not found.",
  ASSIGNED_TECHNICIAN_NOT_FOUND: "The selected technician was not found or is inactive.",
  TECHNICIAN_CREATE_ASSIGNMENT_FORBIDDEN: "Only eligible branch technicians can be assigned.",
  PREPARED_BY_NOT_FOUND: "The staff account preparing this record was not found.",
  SERVICE_DONE_BY_NOT_ELIGIBLE: "The selected staff member is not eligible for service assignments.",

  // Branch & Access
  BRANCH_REQUIRED: "Please select a branch to proceed.",
  BRANCH_ID_REQUIRED: "Branch selection is required.",
  BRANCH_ACCESS_DENIED: "You do not have permission to access records from another branch.",
  BRANCH_NOT_FOUND: "The selected branch was not found.",
  BRANCH_INACTIVE: "The selected branch is currently inactive.",
  BRANCH_NOT_FOUND_OR_INACTIVE: "The selected branch is not available or is inactive.",
  USER_BRANCH_REQUIRED: "Your user account must be assigned to an active branch.",

  // Customer
  CUSTOMER_REQUIRED: "Customer name is required before proceeding.",
  CUSTOMER_NOT_FOUND: "The customer record was not found.",
  CUSTOMER_INACTIVE: "The selected customer record is inactive.",
  IN_HOUSE_CUSTOMER_REQUIRED: "An active customer record is required for in-house installment accounts.",
  STORE_CREDIT_CUSTOMER_REQUIRED: "Customer selection is required when issuing store credit.",

  // Items, Inventory & Batches
  ITEM_NOT_FOUND: "The requested item was not found in this branch.",
  ITEM_OUT_OF_STOCK: "This item is currently out of stock in this branch.",
  BATCH_NOT_FOUND: "No active inventory batch found for this item in this branch.",
  BATCH_NOT_ACTIVE: "The selected stock batch is no longer active.",
  BATCH_NOT_ADJUSTABLE: "The selected stock batch cannot be adjusted.",
  BATCH_CODE_REQUIRED: "A batch code is required.",
  BATCH_CODE_ALREADY_EXISTS: "A batch with this code already exists.",
  BATCH_ITEM_MISMATCH: "The selected batch does not belong to this item.",
  INSUFFICIENT_BATCH_QUANTITY: "Insufficient stock quantity available for this item.",
  PRICE_TIER_REQUIRED: "Please select a valid price tier.",
  STAFF_CUSTOM_PRICE_NOT_ALLOWED: "Custom pricing is not allowed for staff accounts.",
  DESCRIPTION_REQUIRED: "Description is required for this line item.",
  UNIT_PRICE_REQUIRED: "Unit price is required.",
  INVALID_MARKUP_PERCENT: "Markup percentage must be between 0 and 99.99%.",
  DISCOUNT_EXCEEDS_LINE_TOTAL: "Discount cannot exceed the total price of the item.",

  // Serial Numbers
  SERIAL_REQUIRED: "Please select or scan a serial number for this serialized item.",
  SERIAL_NOT_AVAILABLE: "The selected serial number is not available or has already been sold.",
  SERIAL_NOT_FOUND: "Serial number record not found.",
  SERIAL_ALREADY_EXISTS: "This serial number is already registered in the system.",
  SERIAL_ALREADY_ASSIGNED: "This serial number is already assigned to another item or transaction.",
  NEW_SERIAL_REQUIRED: "A replacement serial number is required.",
  NEW_SERIAL_ALREADY_SOLD: "The selected replacement serial number has already been sold.",
  SERIALIZED_QUANTITY_MUST_BE_ONE: "Serialized items must be entered one unit per line.",
  SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: "Serial numbers cannot be assigned to non-serialized items.",
  SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: "Serial numbers cannot be assigned to non-serialized items.",
  SERIAL_COUNT_MISMATCH: "The number of serial numbers does not match the item quantity.",
  DUPLICATE_SERIAL_IN_REQUEST: "The same serial number cannot be used more than once.",
  SELECTED_SERIALS_NOT_AVAILABLE: "One or more selected serial numbers are no longer available.",

  // Sales & Checkout
  SALE_NOT_FOUND: "The sales transaction record was not found.",
  SALE_CANCEL_FORBIDDEN: "You do not have permission to void or cancel this sale.",
  SALE_NOT_CANCELLABLE: "This sale cannot be cancelled in its current status.",
  SALE_NOT_CREDITABLE: "This sale cannot be converted to a credit account.",
  SALE_ALREADY_HAS_CREDIT_ACCOUNT: "This sale already has an associated credit or installment account.",
  SALE_CHANGE_EXCEEDS_CASH_TENDER: "Customer change cannot exceed the cash amount tendered.",
  CANNOT_APPEND_TO_SALE_IN_CURRENT_STATUS: "Items cannot be added to a sale in its current status.",
  INSUFFICIENT_PAYMENT_FOR_ADDED_ITEMS: "The payment provided is less than the total for the added items.",
  CUSTOM_LINE_INVENTORY_LINK_NOT_ALLOWED: "Custom service lines cannot be linked directly to inventory batches.",

  // Payments
  PAYMENT_METHOD_CASH_DISABLED: "Cash payments are currently disabled in store settings.",
  PAYMENT_METHOD_GCASH_DISABLED: "GCash payments are currently disabled in store settings.",
  PAYMENT_METHOD_BANK_TRANSFER_DISABLED: "Bank transfer payments are currently disabled in store settings.",
  PAYMENT_METHOD_CARD_DISABLED: "Card terminal payments are currently disabled in store settings.",
  PAYMENT_METHOD_CHEQUE_DISABLED: "Cheque payments are currently disabled in store settings.",
  PAYMENT_METHOD_CREDIT_DISABLED: "Credit/installment transactions are currently disabled in store settings.",
  PAYMENT_METHOD_MIXED_DISABLED: "Mixed payment methods are currently disabled in store settings.",
  CHEQUE_NUMBER_REQUIRED: "Cheque number is required for cheque payments.",
  BANK_NAME_REQUIRED: "Bank name is required for this payment method.",
  CARD_APPROVAL_CODE_REQUIRED: "Approval code is required for card terminal payments.",
  PAYMENT_REFERENCE_REQUIRED: "Payment reference number is required.",
  PAYMENT_REMARKS_REQUIRED: "Payment remarks are required by store settings.",

  // Receivables & Installments
  RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL: "Downpayment cannot exceed the total transaction amount.",
  RECEIVABLE_BALANCE_REQUIRED: "An installment account requires an outstanding balance.",
  RECEIVABLE_REQUIRED_FOR_OUTSTANDING_BALANCE: "Outstanding balance requires an active installment plan.",
  CREDIT_ACCOUNT_NOT_FOUND: "Credit account not found.",
  CREDIT_ACCOUNT_VIEW_FORBIDDEN: "You do not have permission to view this credit account.",
  CREDIT_ACCOUNT_NOT_COLLECTIBLE: "This credit account is not active for collection.",
  CANNOT_APPEND_TO_INACTIVE_CREDIT_ACCOUNT: "Cannot add items to an inactive or closed credit account.",
  INVALID_COLLECTION_AMOUNT: "Please enter a valid collection amount.",
  COLLECTION_AMOUNT_EXCEEDS_BALANCE: "Collection amount cannot exceed the remaining balance.",
  CREDIT_COLLECTION_NOT_FOUND: "Credit collection record not found.",
  CREDIT_COLLECTION_ALREADY_CANCELLED: "This collection record has already been cancelled.",
  CREDIT_COLLECTION_CANCEL_FORBIDDEN: "You do not have permission to cancel this collection.",
  DEFAULT_REASON_REQUIRED: "A reason is required when marking an account as defaulted.",

  // Cash Management
  CASH_BOX_NOT_FOUND: "Cash drawer or box not found for this branch.",
  CASH_BOX_NOT_ACTIVE: "The cash drawer is currently closed or inactive.",
  CASH_BOX_FORBIDDEN: "You do not have permission to access this cash drawer.",
  INSUFFICIENT_CASH_BALANCE: "Insufficient cash balance in the drawer for this transaction.",
  INSUFFICIENT_CASH_FOR_REFUND: "The cash drawer does not have enough funds to complete this refund.",
  CASH_TRANSACTION_NOT_FOUND: "Cash transaction record not found.",
  CASH_TRANSACTION_ALREADY_CANCELLED: "This cash transaction has already been cancelled.",
  CASH_HANDOVER_NOT_FOUND: "Cash handover record not found.",
  CASH_SOURCE_CONFLICT: "A cash register conflict occurred while recording this payment.",

  // Quotations
  QUOTATION_NOT_FOUND: "Quotation record not found.",
  QUOTATION_NOT_EDITABLE: "This quotation is locked and cannot be edited.",
  QUOTATION_ALREADY_CONVERTED: "This quotation has already been converted into a sale.",
  QUOTATION_CANCELLED: "This quotation has been cancelled and cannot be used.",
  INVALID_QUOTATION_STATUS_TRANSITION: "Invalid quotation status update.",

  // Warranty & Service
  WARRANTY_CLAIM_NOT_FOUND: "Warranty claim record not found.",
  WARRANTY_CLAIM_VIEW_FORBIDDEN: "You do not have permission to view this warranty claim.",
  WARRANTY_CLAIM_CREATE_FORBIDDEN: "You do not have permission to create warranty claims.",
  WARRANTY_STATUS_UPDATE_FORBIDDEN: "You do not have permission to update warranty status.",
  WARRANTY_RELEASE_FORBIDDEN: "You do not have permission to release this warranty item.",
  SERIAL_ALREADY_CLAIMED: "This serial number already has an active warranty claim.",
  REPLACEMENT_ITEM_REQUIRED: "Please select a replacement item.",
  REPLACEMENT_SERIAL_REQUIRED: "Please select a serial number for the replacement item.",
  REPLACEMENT_SERIAL_NOT_AVAILABLE: "The selected replacement serial number is not available.",
  INSUFFICIENT_STOCK_FOR_REPLACEMENT: "Insufficient stock available for warranty replacement.",
  SERVICE_JOB_NOT_FOUND: "Service job order not found.",
  SERVICE_JOB_VIEW_FORBIDDEN: "You do not have permission to view this service job.",
  SERVICE_JOB_CREATE_FORBIDDEN: "You do not have permission to create service job orders.",
  SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: "You do not have permission to update this service job.",
  SERVICE_JOB_RELEASE_FORBIDDEN: "You do not have permission to release this service job.",
  SERVICE_JOB_ALREADY_RELEASED: "This service job has already been released to the customer.",
  SERVICE_JOB_BALANCE_UNPAID: "Cannot release service job with an outstanding unpaid balance.",
  CANCELLATION_REASON_REQUIRED: "A reason is required to cancel this record.",

  // Supplier Returns
  SUPPLIER_RETURN_NOT_FOUND: "Supplier return record not found.",
  SUPPLIER_NOT_FOUND_OR_INACTIVE: "Supplier not found or is currently inactive.",
  CANNOT_EDIT_NON_DRAFT_SUPPLIER_RETURN: "Only draft supplier returns can be edited.",
  ONLY_DRAFT_CAN_BE_APPROVED: "Only draft supplier returns can be approved.",
  SUPPLIER_NAME_REQUIRED: "Supplier name is required.",
  REJECTION_REASON_REQUIRED: "A reason is required for rejection.",
};

const isTechnicalString = (msg) => {
  if (typeof msg !== "string") return false;
  return (
    msg.includes("prisma.") ||
    msg.includes("invocation:") ||
    msg.includes("UserWhereInput") ||
    msg.includes("WhereUniqueInput") ||
    msg.includes("TypeError") ||
    msg.includes("ReferenceError") ||
    msg.includes("SyntaxError") ||
    msg.includes("Cannot read property") ||
    msg.includes("Cannot read properties") ||
    msg.includes("is not a function") ||
    msg.includes("SELECT ") ||
    msg.includes("INSERT INTO") ||
    msg.includes("UPDATE ") ||
    msg.includes("DELETE FROM") ||
    msg.includes("Unknown argument") ||
    msg.includes("Did you mean") ||
    msg.includes("Foreign key constraint") ||
    msg.includes("Unique constraint") ||
    msg.includes("at Object.") ||
    msg.includes(".js:") ||
    msg.includes("{\n") ||
    msg.includes("}\n")
  );
};

const sanitizeError = (error, statusCode) => {
  const rawCode = error.code || "";
  const rawMessage = error.message || "";

  // 1. Check if error message is a known code in FRIENDLY_ERROR_MESSAGES
  if (FRIENDLY_ERROR_MESSAGES[rawMessage]) {
    return {
      code: rawMessage,
      message: FRIENDLY_ERROR_MESSAGES[rawMessage],
    };
  }

  // 2. Check if error.code is in FRIENDLY_ERROR_MESSAGES
  if (FRIENDLY_ERROR_MESSAGES[rawCode]) {
    return {
      code: rawCode,
      message: FRIENDLY_ERROR_MESSAGES[rawCode],
    };
  }

  // 3. Handle Prisma-specific error classes
  if (error.name === "PrismaClientKnownRequestError") {
    if (rawCode === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : error.meta?.target || "";
      if (target.includes("serial") || target.includes("serialNumber")) {
        return {
          code: "DUPLICATE_SERIAL",
          message: "A unit with this serial number already exists.",
        };
      }
      if (target.includes("username")) {
        return {
          code: "DUPLICATE_USERNAME",
          message: "This username is already taken. Please choose another username.",
        };
      }
      if (target.includes("code") || target.includes("receiptCode")) {
        return {
          code: "DUPLICATE_CODE",
          message: "A record with this reference code already exists.",
        };
      }
      return {
        code: "DUPLICATE_RECORD",
        message: "A record with this information already exists in the system.",
      };
    }
    if (rawCode === "P2025") {
      return {
        code: "RECORD_NOT_FOUND",
        message: "The requested record was not found or has already been removed.",
      };
    }
    if (rawCode === "P2003") {
      return {
        code: "INVALID_REFERENCE",
        message: "The selected reference (customer, branch, product, or user) is invalid or no longer exists.",
      };
    }
    return {
      code: "DATABASE_OPERATION_FAILED",
      message: "Unable to complete the operation. Please verify your inputs and try again.",
    };
  }

  if (error.name === "PrismaClientValidationError") {
    return {
      code: "VALIDATION_FAILED",
      message: "Unable to process the transaction due to invalid or missing data. Please review your inputs and try again.",
    };
  }

  // 4. Handle Zod validation errors cleanly
  if (error.name === "ZodError" && Array.isArray(error.issues) && error.issues.length > 0) {
    const firstIssue = error.issues[0];
    const field = firstIssue.path?.join(".") || "field";
    return {
      code: "VALIDATION_FAILED",
      message: `Invalid input for ${field}: ${firstIssue.message}`,
    };
  }

  // 5. If message contains technical dump, replace with clean professional text
  if (isTechnicalString(rawMessage)) {
    return {
      code: rawCode || "OPERATION_FAILED",
      message: statusCode >= 500
        ? "A system error occurred while processing your request. Please try again or contact support."
        : "Invalid information provided. Please verify your inputs and try again.",
    };
  }

  // 6. Otherwise use the message directly if it is clean prose
  return {
    code: rawCode || (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST"),
    message: rawMessage || "Something went wrong. Please try again later.",
  };
};

const globalErrorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  // Always log internal details to server logs for debugging
  if (statusCode >= 500) {
    logger.error("Server error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message,
      stack: error.stack,
    });
  } else {
    logger.warn("Client error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code,
      message: error.message,
    });
  }

  const sanitized = sanitizeError(error, statusCode);

  const response = {
    success: false,
    error: {
      code: sanitized.code,
      message: sanitized.message,
    },
  };

  return res.status(statusCode).json(response);
};

module.exports = globalErrorHandler;
