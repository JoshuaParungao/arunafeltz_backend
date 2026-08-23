const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const auditLogService = require("../services/auditLog.service");

const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditLogService.listAuditLogs(req.query, req.user);

  return sendSuccess(res, {
    message: "Audit logs retrieved successfully",
    data: result.records,
    meta: result.meta,
  });
});

const getAuditLogById = asyncHandler(async (req, res) => {
  const auditLog = await auditLogService.getAuditLogById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Audit log retrieved successfully",
    data: auditLog,
  });
});

module.exports = {
  listAuditLogs,
  getAuditLogById,
};
