const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const auditLogController = require("../controllers/auditLog.controller");
const {
  listAuditLogsSchema,
  auditLogIdParamSchema,
} = require("../validations/auditLog.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS),
  validate(listAuditLogsSchema),
  auditLogController.listAuditLogs
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS),
  validate(auditLogIdParamSchema),
  auditLogController.getAuditLogById
);

module.exports = router;
