const cashBoxService = require("../services/cashBox.service");

const handleCashBoxError = (error, res, next) => {
  const knownErrors = {
    CASH_BOX_FORBIDDEN: [403, "You do not have permission for this cash box operation."],
    CASH_CUSTODIAN_ASSIGNMENT_FORBIDDEN: [403, "Only Main Admin or Admin can manage cash custodian assignments."],
    CASH_CUSTODIAN_BRANCH_REQUIRED: [400, "Branch is required for cash custodian assignment."],
    CASH_CUSTODIAN_BRANCH_NOT_FOUND: [404, "Branch not found for cash custodian assignment."],
    CASH_CUSTODIAN_ASSIGNEE_NOT_ELIGIBLE: [400, "Cash custodian must be an active Sales Agent or Technician from the same branch."],
    CASH_CUSTODIAN_ASSIGNMENT_NOT_FOUND: [404, "No active cash custodian assignment was found for this branch."],
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
    INVALID_DATE_FROM: [400, "Invalid dateFrom value."],
    INVALID_DATE_TO: [400, "Invalid dateTo value."],
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

const getCashCustodianAssignmentOptions = async (req, res, next) => {
  try {
    const result =
      await cashBoxService.getCashCustodianAssignmentOptions(
        req.user,
        req.query
      );

    return res.status(200).json({
      success: true,
      message: "Cash custodian assignment options retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const assignCashCustodian = async (req, res, next) => {
  try {
    const assignment = await cashBoxService.assignCashCustodian(
      req.user,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash custodian assigned successfully",
      data: assignment,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const removeCashCustodianAssignment = async (req, res, next) => {
  try {
    const assignment =
      await cashBoxService.removeCashCustodianAssignment(
        req.user,
        req.body
      );

    return res.status(200).json({
      success: true,
      message: "Cash custodian assignment ended successfully",
      data: assignment,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
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


const getCashHandovers = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashHandovers(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Cash handovers retrieved successfully",
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashHandoverById = async (req, res, next) => {
  try {
    const handover = await cashBoxService.getCashHandoverById(
      req.user,
      req.params.handoverId
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover retrieved successfully",
      data: handover,
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
  getCashCustodianAssignmentOptions,
  assignCashCustodian,
  removeCashCustodianAssignment,
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  getCashHandovers,
  getCashHandoverById,
  createCashHandover,
  receiveCashHandover,
  cancelCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};
