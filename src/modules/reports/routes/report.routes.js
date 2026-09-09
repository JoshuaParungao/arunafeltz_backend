const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const reportController = require("../controllers/report.controller");
const {
  financialSummarySchema,
  inventorySummarySchema,
  shrinkageSummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
  stockTransferSummarySchema,
  creditSummarySchema,
  staffPerformanceSummarySchema,
  alertSummarySchema,
} = require("../validations/report.validation");

const router = express.Router();

router.use(protect);

// Action alerts monitoring available to all authenticated accounts for their permitted branch
router.get(
  "/alert-summary",
  validate(alertSummarySchema),
  reportController.getAlertSummary
);

router.use(requirePermission(PERMISSIONS.VIEW_REPORTS));

router.get(
  "/financial-summary",
  validate(financialSummarySchema),
  reportController.getFinancialSummary
);

router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);

router.get(
  "/sales-summary",
  validate(salesSummarySchema),
  reportController.getSalesSummary
);

router.get(
  "/service-summary",
  validate(serviceSummarySchema),
  reportController.getServiceSummary
);

router.get(
  "/warranty-summary",
  validate(warrantySummarySchema),
  reportController.getWarrantySummary
);

router.get(
  "/cash-summary",
  validate(cashSummarySchema),
  reportController.getCashSummary
);

router.get(
  "/supplier-summary",
  validate(supplierSummarySchema),
  reportController.getSupplierSummary
);

router.get(
  "/purchase-order-summary",
  validate(purchaseOrderSummarySchema),
  reportController.getPurchaseOrderSummary
);

router.get(
  "/purchase-receiving-summary",
  validate(purchaseReceivingSummarySchema),
  reportController.getPurchaseReceivingSummary
);

router.get(
  "/stock-transfer-summary",
  validate(stockTransferSummarySchema),
  reportController.getStockTransferSummary
);

router.get(
  "/credit-summary",
  validate(creditSummarySchema),
  reportController.getCreditSummary
);

router.get(
  "/staff-performance-summary",
  validate(staffPerformanceSummarySchema),
  reportController.getStaffPerformanceSummary
);

router.get(
  "/shrinkage-summary",
  validate(shrinkageSummarySchema),
  reportController.getShrinkageSummary
);

// ==========================================
// FINANCIAL REPORTING & AR INTELLIGENCE SUITE
// ==========================================
const intelligenceController = require("../controllers/intelligence.controller");
const {
  intelligenceQuerySchema,
  customerArStatementSchema,
} = require("../validations/intelligence.validation");

router.get(
  "/intelligence/sales-settlement",
  validate(intelligenceQuerySchema),
  intelligenceController.getSalesSettlement
);

router.get(
  "/intelligence/ar-aging",
  validate(intelligenceQuerySchema),
  intelligenceController.getArAging
);

router.get(
  "/intelligence/provider-performance",
  validate(intelligenceQuerySchema),
  intelligenceController.getProviderPerformance
);

router.get(
  "/intelligence/term-analysis",
  validate(intelligenceQuerySchema),
  intelligenceController.getTermAnalysis
);

router.get(
  "/intelligence/downpayment-analysis",
  validate(intelligenceQuerySchema),
  intelligenceController.getDownpaymentAnalysis
);

router.get(
  "/intelligence/collection-performance",
  validate(intelligenceQuerySchema),
  intelligenceController.getCollectionPerformance
);

router.get(
  "/intelligence/financing-interest",
  validate(intelligenceQuerySchema),
  intelligenceController.getFinancingInterest
);

router.get(
  "/intelligence/customer-statement/:customerId",
  validate(customerArStatementSchema),
  intelligenceController.getCustomerArStatement
);

router.get(
  "/intelligence/product-profitability",
  validate(intelligenceQuerySchema),
  intelligenceController.getProductProfitability
);

router.get(
  "/intelligence/service-profitability",
  validate(intelligenceQuerySchema),
  intelligenceController.getServiceProfitability
);

router.get(
  "/intelligence/six-layer-profitability",
  validate(intelligenceQuerySchema),
  intelligenceController.getSixLayerProfitability
);

router.get(
  "/intelligence/ar-profitability",
  validate(intelligenceQuerySchema),
  intelligenceController.getArProfitability
);

router.get(
  "/intelligence/payment-method",
  validate(intelligenceQuerySchema),
  intelligenceController.getPaymentMethodReport
);

router.get(
  "/intelligence/branch-comparison",
  validate(intelligenceQuerySchema),
  intelligenceController.getBranchFinancialComparison
);

module.exports = router;

