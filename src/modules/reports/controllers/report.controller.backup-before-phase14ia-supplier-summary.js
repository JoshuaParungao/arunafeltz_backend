const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const reportService = require("../services/report.service");

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

module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
};
