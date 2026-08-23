const assert = require("node:assert/strict");

require("dotenv").config();

const prisma = require("./src/config/prisma");
const serviceJobService = require(
  "./src/modules/service-jobs/services/serviceJob.service"
);
const {
  createServiceJobSchema,
} = require("./src/modules/service-jobs/validations/serviceJob.validation");

const run = async () => {
  const {
    calculateRepairFinancialAmounts,
    calculateServicePricing,
    ensureTechnicianCanActForRepairType,
    formatServiceJob,
    resolveServicePricing,
  } = serviceJobService.testInternals;

  const pricing = calculateServicePricing({
    baseServiceCharge: 5000,
    markupPercent: 20,
  });

  assert.deepEqual(pricing, {
    baseServiceCharge: "5000.00",
    markupPercent: "20.0000",
    finalServiceCharge: "6250.00",
    serviceMarkupAmount: "1250.00",
  });

  const productConventionBoundary = calculateServicePricing({
    baseServiceCharge: 2.53,
    markupPercent: 12,
  });
  assert.deepEqual(
    productConventionBoundary,
    {
      baseServiceCharge: "2.53",
      markupPercent: "12.0000",
      finalServiceCharge: "2.87",
      serviceMarkupAmount: "0.34",
    },
    "Service pricing must retain the existing JavaScript product-money convention"
  );

  assert.throws(
    () =>
      calculateServicePricing({
        baseServiceCharge: 5000,
        markupPercent: 100,
      }),
    /INVALID_MARKUP_PERCENT/
  );

  const repriced = resolveServicePricing(
    {
      baseServiceCharge: "5000.00",
      markupPercent: "20.0000",
      finalServiceCharge: "6250.00",
    },
    { markupPercent: 25 }
  );
  assert.deepEqual(repriced, {
    baseServiceCharge: "5000.00",
    markupPercent: "25.0000",
    finalServiceCharge: "6666.67",
    serviceMarkupAmount: "1666.67",
  });
  assert.throws(
    () =>
      resolveServicePricing(
        {
          baseServiceCharge: "5000.00",
          markupPercent: "20.0000",
          finalServiceCharge: "6250.00",
        },
        { finalServiceCharge: 6000 }
      ),
    /FINAL_SERVICE_CHARGE_MISMATCH/
  );
  assert.throws(
    () =>
      calculateServicePricing({
        baseServiceCharge: 5000,
        markupPercent: -0.01,
      }),
    /INVALID_MARKUP_PERCENT/
  );

  const snapshot = calculateRepairFinancialAmounts({
    baseServiceCharge: 5000,
    repairCostPercent: 65,
    repairFee: 500,
    repairIncentiveRate: 10,
  });

  assert.deepEqual(snapshot, {
    repairCostPercentSnapshot: "65.0000",
    companySharePercentSnapshot: "35.0000",
    repairCostPoolAmountSnapshot: "3250.00",
    companyShareAmountSnapshot: "1750.00",
    repairFeeSnapshot: "500.00",
    repairIncentiveRateSnapshot: "10.0000",
    repairIncentiveAmountSnapshot: "500.00",
    unallocatedRepairCostPoolSnapshot: "2250.00",
  });

  const signedRemainder = calculateRepairFinancialAmounts({
    baseServiceCharge: 100,
    repairCostPercent: 30,
    repairFee: 40,
    repairIncentiveRate: 10,
  });

  assert.equal(
    signedRemainder.unallocatedRepairCostPoolSnapshot,
    "-20.00",
    "An over-allocated repair pool remains signed and is not clamped"
  );

  assert.throws(
    () =>
      calculateRepairFinancialAmounts({
        baseServiceCharge: 9999999999.99,
        repairCostPercent: 0,
        repairFee: 9999999999.99,
        repairIncentiveRate: 100,
      }),
    /INVALID_REPAIR_FINANCIAL_CONFIGURATION/,
    "Derived signed balances outside Decimal(12,2) must be rejected, never clamped"
  );

  const financialJob = {
    status: "COMPLETED",
    finalServiceCharge: "6250.00",
    releasedAt: new Date("2026-08-14T00:00:00.000Z"),
    customer: null,
    customerNameSnapshot: "Customer",
    customerContactSnapshot: null,
    createdBy: null,
    payment: null,
    programRuleVersionId: "rule-1",
    repairCostPercentSnapshot: "65.0000",
    companyShareAmountSnapshot: "1750.00",
    unallocatedRepairCostPoolSnapshot: "2250.00",
  };
  const cashierView = formatServiceJob(financialJob, null, {
    role: "CASHIER",
  });
  const adminView = formatServiceJob(financialJob, null, { role: "ADMIN" });
  assert.equal(cashierView.repairCostPercentSnapshot, undefined);
  assert.equal(cashierView.unallocatedRepairCostPoolSnapshot, undefined);
  assert.equal(adminView.repairCostPercentSnapshot, "65.0000");

  const missingRepairType = createServiceJobSchema.safeParse({
    body: {
      jobTitle: "Legacy-shaped request",
    },
  });
  assert.equal(missingRepairType.success, false);

  const validNewJob = createServiceJobSchema.safeParse({
    body: {
      jobTitle: "Ordinary repair",
      repairType: "ORDINARY_REPAIR",
      baseServiceCharge: 5000,
      markupPercent: 20,
    },
  });
  assert.equal(validNewJob.success, true);

  assert.doesNotThrow(() =>
    ensureTechnicianCanActForRepairType(
      { role: "TECHNICIAN", incentiveClassification: "TECHNICIAN" },
      "ORDINARY_REPAIR"
    )
  );
  assert.doesNotThrow(() =>
    ensureTechnicianCanActForRepairType(
      {
        role: "TECHNICIAN",
        incentiveClassification: "SENIOR_TECHNICIAN",
      },
      "BOARD_LEVEL_REPAIR"
    )
  );
  assert.throws(
    () =>
      ensureTechnicianCanActForRepairType(
        { role: "TECHNICIAN", incentiveClassification: "TECHNICIAN" },
        "BOARD_LEVEL_REPAIR"
      ),
    /BOARD_LEVEL_REQUIRES_SENIOR_TECHNICIAN/
  );
  assert.throws(
    () =>
      ensureTechnicianCanActForRepairType(
        { role: "TECHNICIAN", incentiveClassification: "NONE" },
        "ORDINARY_REPAIR"
      ),
    /SERVICE_TECHNICIAN_CLASSIFICATION_REQUIRED/
  );

  console.log("Service-job finance regression: 18 assertions passed.");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
