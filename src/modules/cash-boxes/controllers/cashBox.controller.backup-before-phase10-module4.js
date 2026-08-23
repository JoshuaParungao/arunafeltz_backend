const cashBoxService = require("../services/cashBox.service");

const handleCashBoxError = (error, res, next) => {
  const knownErrors = {
    CASH_BOX_FORBIDDEN: [403, "Only owner/admin roles can manage cash box transactions."],
    CASH_BOX_NOT_FOUND: [404, "Cash box not found."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    INSUFFICIENT_CASH_BALANCE: [400, "Insufficient cash box balance."],
    INVALID_CASH_TRANSACTION_DATE: [400, "Invalid cash transaction date."],
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

const createCashTransaction = async (req, res, next) => {
  try {
    const result = await cashBoxService.createCashTransaction(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Cash transaction posted successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

module.exports = {
  createCashTransaction,
};
