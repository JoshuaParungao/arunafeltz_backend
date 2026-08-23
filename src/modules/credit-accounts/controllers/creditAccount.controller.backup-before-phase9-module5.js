const creditAccountService = require("../services/creditAccount.service");

const handleCreditAccountError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    CREDIT_ACCOUNT_VIEW_FORBIDDEN: [403, "Only owner/admin roles can view credit accounts."],
    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],
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

module.exports = {
  getCreditAccounts,
  getCreditAccountById,
};
