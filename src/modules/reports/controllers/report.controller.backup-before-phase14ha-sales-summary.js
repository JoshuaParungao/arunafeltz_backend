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

module.exports = {
  getInventorySummary,
};
