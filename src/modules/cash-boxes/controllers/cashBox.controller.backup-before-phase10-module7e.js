const cashBoxService = require("../services/cashBox.service");

const handleCashBoxError = (error, res, next) => {
  const knownErrors = {
    CASH_BOX_FORBIDDEN: [403, "Only owner/admin roles can manage cash box transactions."],
    CASH_BOX_NOT_FOUND: [404, "Cash box not found."],
    CASH_TRANSACTION_NOT_FOUND: [404, "Cash transaction not found."],
    BRANCH_REQUIRED: [400, "Branch is required."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    INSUFFICIENT_CASH_BALANCE: [400, "Insufficient cash box balance."],
    INVALID_CASH_TRANSACTION_DATE: [400, "Invalid cash transaction date."],
    CASH_TRANSACTION_ALREADY_CANCELLED: [400, "Cash transaction is already cancelled."],
    CASH_TRANSACTION_SOURCE_NOT_REVERSIBLE: [400, "Only manual cash transactions can be cancelled here."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],
    CASH_HANDOVER_TO_USER_NOT_FOUND: [404, "Cash handover receiving user not found."],
    CASH_HANDOVER_NOT_FOUND: [404, "Cash handover not found."],
    CASH_HANDOVER_NOT_RECEIVABLE: [400, "Only pending cash handovers can be received."],
    CASH_HANDOVER_NOT_CANCELLABLE: [400, "Only pending cash handovers can be cancelled."],
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

const getCashBoxes = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashBoxes(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Cash boxes retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashBoxById = async (req, res, next) => {
  try {
    const cashBox = await cashBoxService.getCashBoxById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Cash box retrieved successfully",
      data: cashBox,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashTransactions = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashTransactions(
      req.user,
      req.params.id,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Cash transactions retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashTransactionById = async (req, res, next) => {
  try {
    const transaction = await cashBoxService.getCashTransactionById(
      req.user,
      req.params.transactionId
    );

    return res.status(200).json({
      success: true,
      message: "Cash transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};




const cancelCashHandover = async (req, res, next) => {
  try {
    const handover = await cashBoxService.cancelCashHandover(
      req.user,
      req.params.handoverId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover cancelled successfully",
      data: handover,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const receiveCashHandover = async (req, res, next) => {
  try {
    const result = await cashBoxService.receiveCashHandover(
      req.user,
      req.params.handoverId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover received successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const createCashHandover = async (req, res, next) => {
  try {
    const handover = await cashBoxService.createCashHandover(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Cash handover request created successfully",
      data: handover,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
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

const cancelCashTransaction = async (req, res, next) => {
  try {
    const result = await cashBoxService.cancelCashTransaction(
      req.user,
      req.params.transactionId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash transaction cancelled successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashHandover,
  receiveCashHandover,
  cancelCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};
