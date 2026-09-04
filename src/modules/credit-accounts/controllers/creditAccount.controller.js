const creditAccountService = require("../services/creditAccount.service");

const handleCreditAccountError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    CREDIT_ACCOUNT_VIEW_FORBIDDEN: [403, "Only owner/admin roles can view credit accounts."],
    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],
    CREDIT_ACCOUNT_NOT_COLLECTIBLE: [400, "Only active credit accounts can receive collections."],
    INVALID_COLLECTION_AMOUNT: [400, "Collection amount must be greater than zero."],
    INVALID_COLLECTION_SETTLEMENT_METHOD: [400, "Card and credit rails cannot be used as collection settlement methods."],
    COLLECTION_AMOUNT_EXCEEDS_BALANCE: [400, "Collection amount cannot exceed remaining balance."],
    CREDIT_COLLECTION_IDEMPOTENCY_CONFLICT: [409, "This collection idempotency key was already used for a different request."],
    INVALID_COLLECTION_PAID_AT: [400, "Invalid collection paid date."],
    CREDIT_COLLECTION_NOT_FOUND: [404, "Credit collection not found."],
    CREDIT_COLLECTION_ALREADY_CANCELLED: [400, "Credit collection is already cancelled."],
    CREDIT_COLLECTION_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel credit collections."],
    CREDIT_ACCOUNT_NOT_REVERSIBLE: [400, "Credit account is not reversible."],
    CREDIT_COLLECTION_LEDGER_INCONSISTENT: [409, "The receivable ledger is inconsistent; the collection was not cancelled."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],
    COLLECTION_CASH_LINK_NOT_FOUND: [409, "The collection cash event could not be identified safely."],
    CASH_SOURCE_CONFLICT: [409, "The collection cash source conflicts with an existing cash event."],
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

const getCreditAccounts = async (req, res, next) => {
  try {
    const result = await creditAccountService.getCreditAccounts(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Credit accounts retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const createCreditCollection = async (req, res, next) => {
  try {
    const result = await creditAccountService.createCreditCollection(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      message: result.replayed
        ? "Credit collection replayed successfully"
        : "Credit collection posted successfully",
      data: result,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const cancelCreditCollection = async (req, res, next) => {
  try {
    const result = await creditAccountService.cancelCreditCollection(
      req.user,
      req.params.collectionId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Credit collection cancelled successfully",
      data: result,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const getCreditAccountById = async (req, res, next) => {
  try {
    const creditAccount = await creditAccountService.getCreditAccountById(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Credit account retrieved successfully",
      data: creditAccount,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const declareCreditAccountDefaulted = async (req, res, next) => {
  try {
    const creditAccount = await creditAccountService.declareCreditAccountDefaulted(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Credit account declared as Defaulted / Bad Debt Write-off successfully",
      data: creditAccount,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
  cancelCreditCollection,
  declareCreditAccountDefaulted,
};
