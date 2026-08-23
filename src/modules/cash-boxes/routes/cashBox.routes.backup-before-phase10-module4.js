const express = require("express");

const cashBoxController = require("../controllers/cashBox.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const {
  createCashTransactionSchema,
} = require("../validations/cashBox.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.MANAGE_SALES));

router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);

module.exports = router;
