const express = require("express");

const healthRoutes = require("../modules/health/routes/health.routes");
const branchRoutes = require("../modules/branches/routes/branch.routes");
const userRoutes = require("../modules/users/routes/user.routes");
const authRoutes = require("../modules/auth/routes/auth.routes");
const settingRoutes = require("../modules/settings/routes/setting.routes");
const customerRoutes = require("../modules/customers/routes/customer.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/branches", branchRoutes);
router.use("/users", userRoutes);
router.use("/settings", settingRoutes);
router.use("/customers", customerRoutes);

module.exports = router;
