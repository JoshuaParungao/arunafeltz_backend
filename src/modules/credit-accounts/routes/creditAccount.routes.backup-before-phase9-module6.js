const express = require("express");

const creditAccountController = require("../controllers/creditAccount.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
} = require("../validations/creditAccount.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_SALES));

router.get(
  "/",
  validate(listCreditAccountsSchema),
  creditAccountController.getCreditAccounts
);

router.post(
  "/:id/collections",
  validate(createCreditCollectionSchema),
  creditAccountController.createCreditCollection
);

router.get(
  "/:id",
  validate(creditAccountIdParamSchema),
  creditAccountController.getCreditAccountById
);

module.exports = router;
