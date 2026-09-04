const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const reportService = require("../services/report.service");
const financialSummaryService = require("../services/financialSummary.service");

const getFinancialSummary = asyncHandler(async (req, res) => {
  const result = await financialSummaryService.getFinancialSummary(
    req.user,
    req.query
  );

  return sendSuccess(res, {
    message: "Unified financial summary retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getInventorySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getInventorySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Inventory summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getSalesSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getSalesSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Sales summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getServiceSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getServiceSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Service summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getWarrantySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getWarrantySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Warranty summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getCashSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getCashSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Cash summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getSupplierSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getSupplierSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Supplier summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getPurchaseOrderSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseOrderSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Purchase order summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getPurchaseReceivingSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseReceivingSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Purchase receiving summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getStockTransferSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getStockTransferSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Stock transfer summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getAlertSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getAlertSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Alert summary report retrieved successfully",
    data: {
      report: result.report,
      alerts: result.alerts,
    },
  });
});

const getCreditSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getCreditSummary(req.user, req.query);
  return sendSuccess(res, {
    message: "Credit summary report retrieved successfully",
    data: { report: result.report, records: result.records },
    meta: result.meta,
  });
});

const getStaffPerformanceSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getStaffPerformanceSummary(req.user, req.query);
  return sendSuccess(res, {
    message: "Staff performance report retrieved successfully",
    data: { report: result.report, records: result.records },
    meta: result.meta,
  });
});

const getShrinkageSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getShrinkageSummary(req.user, req.query);
  return sendSuccess(res, {
    message: "Shrinkage and inventory loss report retrieved successfully",
    data: { report: result.report, records: result.records },
    meta: result.meta,
  });
});

module.exports = {
  getFinancialSummary,
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
  getStockTransferSummary,
  getCreditSummary,
  getStaffPerformanceSummary,
  getAlertSummary,
  getShrinkageSummary,
};
