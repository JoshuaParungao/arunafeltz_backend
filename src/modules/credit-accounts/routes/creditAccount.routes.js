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
  cancelCreditCollectionSchema,
  declareCreditAccountDefaultSchema,
} = require("../validations/creditAccount.validation");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_SALES),
  validate(listCreditAccountsSchema),
  creditAccountController.getCreditAccounts
);

router.post(
  "/collections/:collectionId/cancel",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(cancelCreditCollectionSchema),
  creditAccountController.cancelCreditCollection
);

router.post(
  "/:id/collections",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(createCreditCollectionSchema),
  creditAccountController.createCreditCollection
);

router.post(
  "/:id/default",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(declareCreditAccountDefaultSchema),
  creditAccountController.declareCreditAccountDefaulted
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_SALES),
  validate(creditAccountIdParamSchema),
  creditAccountController.getCreditAccountById
);

module.exports = router;
