const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const arIntelligenceService = require("../services/arIntelligence.service");
const profitabilityIntelligenceService = require("../services/profitabilityIntelligence.service");

const getSalesSettlement = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getSalesSettlementReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Sales settlement report retrieved successfully",
    data: result,
  });
});

const getArAging = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getArAgingReport(req.user, req.query);
  return sendSuccess(res, {
    message: "AR aging report retrieved successfully",
    data: result,
  });
});

const getProviderPerformance = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getProviderPerformanceReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Financing provider performance report retrieved successfully",
    data: result,
  });
});

const getTermAnalysis = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getTermAnalysisReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Installment term analysis report retrieved successfully",
    data: result,
  });
});

const getDownpaymentAnalysis = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getDownpaymentAnalysisReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Downpayment analysis report retrieved successfully",
    data: result,
  });
});

const getCollectionPerformance = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getCollectionPerformanceReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Collection performance report retrieved successfully",
    data: result,
  });
});

const getFinancingInterest = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getFinancingInterestReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Financing interest report retrieved successfully",
    data: result,
  });
});

const getCustomerArStatement = asyncHandler(async (req, res) => {
  const result = await arIntelligenceService.getCustomerArStatement(req.user, req.params.customerId, req.query);
  return sendSuccess(res, {
    message: "Customer statement of account retrieved successfully",
    data: result,
  });
});

const getProductProfitability = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getProductProfitabilityReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Product profitability report retrieved successfully",
    data: result,
  });
});

const getServiceProfitability = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getServiceProfitabilityReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Service profitability report retrieved successfully",
    data: result,
  });
});

const getSixLayerProfitability = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getSixLayerProfitability(req.user, req.query);
  return sendSuccess(res, {
    message: "Six-layer executive profitability report retrieved successfully",
    data: result,
  });
});

const getArProfitability = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getArProfitabilityReport(req.user, req.query);
  return sendSuccess(res, {
    message: "AR profitability report retrieved successfully",
    data: result,
  });
});

const getPaymentMethodReport = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getPaymentMethodReport(req.user, req.query);
  return sendSuccess(res, {
    message: "Payment method report retrieved successfully",
    data: result,
  });
});

const getBranchFinancialComparison = asyncHandler(async (req, res) => {
  const result = await profitabilityIntelligenceService.getBranchFinancialComparison(req.user, req.query);
  return sendSuccess(res, {
    message: "Branch financial comparison report retrieved successfully",
    data: result,
  });
});

module.exports = {
  getSalesSettlement,
  getArAging,
  getProviderPerformance,
  getTermAnalysis,
  getDownpaymentAnalysis,
  getCollectionPerformance,
  getFinancingInterest,
  getCustomerArStatement,
  getProductProfitability,
  getServiceProfitability,
  getSixLayerProfitability,
  getArProfitability,
  getPaymentMethodReport,
  getBranchFinancialComparison,
};
