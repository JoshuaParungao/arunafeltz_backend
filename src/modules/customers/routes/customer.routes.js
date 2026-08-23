const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const customerController = require("../controllers/customer.controller");
const {
  createCustomerSchema,
  listCustomersSchema,
  customerIdParamSchema,
  customerHistorySchema,
  updateCustomerSchema,
} = require("../validations/customer.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_CUSTOMERS),
  validate(listCustomersSchema),
  customerController.listCustomers
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CUSTOMERS),
  validate(createCustomerSchema),
  customerController.createCustomer
);

router.get(
  "/:id/history",
  protect,
  requirePermission(PERMISSIONS.VIEW_CUSTOMERS),
  validate(customerHistorySchema),
  customerController.getCustomerHistory
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_CUSTOMERS),
  validate(customerIdParamSchema),
  customerController.getCustomerById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CUSTOMERS),
  validate(updateCustomerSchema),
  customerController.updateCustomerById
);

module.exports = router;
