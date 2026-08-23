const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const customerController = require("../controllers/customer.controller");
const {
  createCustomerSchema,
  listCustomersSchema,
  customerIdParamSchema,
  updateCustomerSchema,
} = require("../validations/customer.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  validate(listCustomersSchema),
  customerController.listCustomers
);

router.post(
  "/",
  protect,
  validate(createCustomerSchema),
  customerController.createCustomer
);

router.get(
  "/:id",
  protect,
  validate(customerIdParamSchema),
  customerController.getCustomerById
);

router.patch(
  "/:id",
  protect,
  validate(updateCustomerSchema),
  customerController.updateCustomerById
);

module.exports = router;
