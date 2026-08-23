const express = require("express");

const cashBoxController = require("../controllers/cashBox.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const {
  createCashTransactionSchema,
  listCashBoxesSchema,
  cashBoxIdParamSchema,
  listCashTransactionsSchema,
  cashTransactionIdParamSchema,
  cancelCashTransactionSchema,
  createCashHandoverSchema,
  receiveCashHandoverSchema,
  cancelCashHandoverSchema,
  listCashHandoversSchema,
  cashHandoverIdParamSchema,
  cashCustodianAssignmentOptionsSchema,
  assignCashCustodianSchema,
  removeCashCustodianSchema,
} = require("../validations/cashBox.validation");

const router = express.Router();

router.use(protect);

router.get(
  "/custodian-assignments/options",
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(cashCustodianAssignmentOptionsSchema),
  cashBoxController.getCashCustodianAssignmentOptions
);

router.put(
  "/custodian-assignment",
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(assignCashCustodianSchema),
  cashBoxController.assignCashCustodian
);

router.delete(
  "/custodian-assignment",
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(removeCashCustodianSchema),
  cashBoxController.removeCashCustodianAssignment
);

router.get(
  "/",
  validate(listCashBoxesSchema),
  cashBoxController.getCashBoxes
);

router.get(
  "/transactions/:transactionId",
  validate(cashTransactionIdParamSchema),
  cashBoxController.getCashTransactionById
);

router.post(
  "/transactions/:transactionId/cancel",
  requirePermission(PERMISSIONS.MANAGE_CASH_BOX),
  validate(cancelCashTransactionSchema),
  cashBoxController.cancelCashTransaction
);

/*
  IMPORTANT:
  Static /handovers routes must be above dynamic /:id routes.
  Otherwise Express treats "handovers" as cashBox id.
*/

router.get(
  "/handovers",
  validate(listCashHandoversSchema),
  cashBoxController.getCashHandovers
);

router.get(
  "/handovers/:handoverId",
  validate(cashHandoverIdParamSchema),
  cashBoxController.getCashHandoverById
);

router.post(
  "/handovers/:handoverId/cancel",
  requirePermission(PERMISSIONS.MANAGE_CASH_BOX),
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);

router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);

router.get(
  "/:id",
  validate(cashBoxIdParamSchema),
  cashBoxController.getCashBoxById
);

router.get(
  "/:id/transactions",
  validate(listCashTransactionsSchema),
  cashBoxController.getCashTransactions
);

router.post(
  "/:id/handovers",
  requirePermission(PERMISSIONS.MANAGE_CASH_BOX),
  validate(createCashHandoverSchema),
  cashBoxController.createCashHandover
);

router.post(
  "/:id/transactions",
  requirePermission(PERMISSIONS.MANAGE_CASH_BOX),
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);

module.exports = router;
