const express = require("express");

const healthRoutes = require("../modules/health/routes/health.routes");
const branchRoutes = require("../modules/branches/routes/branch.routes");
const userRoutes = require("../modules/users/routes/user.routes");
const authRoutes = require("../modules/auth/routes/auth.routes");
const settingRoutes = require("../modules/settings/routes/setting.routes");
const customerRoutes = require("../modules/customers/routes/customer.routes");
const itemCategoryRoutes = require("../modules/item-categories/routes/itemCategory.routes");
const unitRoutes = require("../modules/units/routes/unit.routes");
const itemRoutes = require("../modules/items/routes/item.routes");
const inventoryRoutes = require("../modules/inventory/routes/inventory.routes");
const quotationRoutes = require("../modules/quotations/routes/quotation.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/branches", branchRoutes);
router.use("/users", userRoutes);
router.use("/settings", settingRoutes);
router.use("/customers", customerRoutes);
router.use("/item-categories", itemCategoryRoutes);
router.use("/units", unitRoutes);
router.use("/items", itemRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/quotations", quotationRoutes);

module.exports = router;
