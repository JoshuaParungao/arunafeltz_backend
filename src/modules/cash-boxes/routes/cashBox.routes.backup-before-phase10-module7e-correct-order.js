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
} = require("../validations/cashBox.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.MANAGE_SALES));

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
  validate(cancelCashTransactionSchema),
  cashBoxController.cancelCashTransaction
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
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);

router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);

router.post(
  "/:id/handovers",
  validate(createCashHandoverSchema),
  cashBoxController.createCashHandover
);

router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);

module.exports = router;
