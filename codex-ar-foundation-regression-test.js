const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config();

const { businessDateCode } = require("./src/utils/businessDate");
const {
  createIdempotencyFingerprint,
} = require("./src/utils/idempotency");
const receivableService = require(
  "./src/modules/credit-accounts/services/receivableAccount.service"
);
const creditAccountService = require(
  "./src/modules/credit-accounts/services/creditAccount.service"
);
const saleService = require("./src/modules/sales/services/sale.service");
const serviceJobService = require(
  "./src/modules/service-jobs/services/serviceJob.service"
);
const {
  createSaleSchema,
} = require("./src/modules/sales/validations/sale.validation");
const {
  createServicePaymentSchema,
} = require(
  "./src/modules/service-jobs/validations/serviceJob.validation"
);

let assertionCount = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertionCount += 1;
};
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertionCount += 1;
};

const run = () => {
  const receivableInternals = receivableService.testInternals;
  const saleInternals = saleService.testInternals;
  const serviceInternals = serviceJobService.testInternals;

  const external = receivableInternals.calculateExternalReceivableSnapshot({
    sourceTotalAmount: 40000,
    initialSettlementAmount: 10000,
  });
  equal(external.sourceTotalAmountSnapshot, "40000.00", "External AR snapshots its source total");
  equal(external.balanceAmount, "30000.00", "External AR opens only the unpaid principal");
  equal(external.term, null, "External AR has no invented installment term");
  equal(external.regularPriceTotalAmount, null, "External AR has no invented regular-price total");

  assert.throws(
    () =>
      receivableInternals.validateSourceCoverage({
        sourceTotalAmount: 1000,
        initialSettlementAmount: 1001,
      }),
    /RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL/
  );
  assertionCount += 1;

  const inHouse = receivableInternals.calculateInHouseReceivableSnapshot({
    sourceTotalAmount: 40000,
    initialSettlementAmount: 10000,
    term: "MONTH_3",
    dueDay: 15,
    firstDueDate: "2026-09-15T00:00:00+08:00",
    installmentComputation: {
      basisUsed: { termBasis: 0.8 },
      result: { regularPriceTotalAmount: 50000, balance: 37500 },
    },
  });
  equal(inHouse.balanceAmount, "37500.00", "In-house AR preserves configured contractual math");
  equal(inHouse.monthlyDueAmount, "12500.00", "In-house monthly due derives from configured balance");

  equal(
    businessDateCode(new Date("2026-08-14T16:30:00.000Z")),
    "20260815",
    "Codes use the Asia/Manila business date across the UTC boundary"
  );

  const fingerprintA = createIdempotencyFingerprint({
    idempotencyKey: "ignored-a",
    amount: 100,
    nested: { provider: "SALMON", referenceNo: "A" },
  });
  const fingerprintB = createIdempotencyFingerprint({
    nested: { referenceNo: "A", provider: "SALMON" },
    amount: 100,
    idempotencyKey: "ignored-b",
  });
  equal(fingerprintA, fingerprintB, "Idempotency fingerprints are stable and exclude the key itself");
  check(
    fingerprintA !== createIdempotencyFingerprint({ amount: 101 }),
    "Changed settlement payloads receive different fingerprints"
  );

  equal(
    saleInternals.calculateNetCashReceived(1200, 200),
    1000,
    "Sale cash posting records tender net of customer change"
  );
  assert.throws(
    () => saleInternals.calculateNetCashReceived(0, 100),
    /SALE_CHANGE_EXCEEDS_CASH_TENDER/
  );
  assertionCount += 1;

  const serviceSnapshot = serviceInternals.calculateServiceSettlementSnapshot({
    status: "COMPLETED",
    releasedAt: new Date(),
    finalServiceCharge: "500.00",
    payments: [
      { status: "POSTED", amount: "200.00" },
      { status: "CANCELLED", amount: "400.00" },
      { status: "POSTED", amount: "100.00" },
    ],
    creditAccount: null,
  });
  equal(serviceSnapshot.directCollectedAmount, 300, "Multiple posted service payments sum independently");
  equal(serviceSnapshot.remainingBalance, 200, "Cancelled service payments do not reduce the balance");
  equal(serviceSnapshot.paymentState, "PARTIALLY_PAID", "Partial service settlement remains partial");

  const serviceArSnapshot = serviceInternals.calculateServiceSettlementSnapshot({
    status: "COMPLETED",
    releasedAt: new Date(),
    finalServiceCharge: "500.00",
    payments: [{ status: "POSTED", amount: "100.00" }],
    creditAccount: {
      status: "ACTIVE",
      totalCollected: "100.00",
      remainingBalance: "300.00",
    },
  });
  equal(serviceArSnapshot.collectedAmount, 200, "Service source totals direct and AR collection events");
  equal(serviceArSnapshot.remainingBalance, 300, "Service AR exposes its contractual remaining balance");

  const invalidSaleRail = createSaleSchema.safeParse({
    body: {
      items: [{ description: "Service", quantity: 1, unitPrice: 100 }],
      payments: [{ paymentMethod: "CARD", amount: 100 }],
    },
  });
  equal(invalidSaleRail.success, false, "New sale payments reject legacy CARD as immediate cash");

  const invalidServiceRail = createServicePaymentSchema.safeParse({
    params: { id: "service-1" },
    body: { paymentMethod: "CARD", amount: 100 },
  });
  equal(invalidServiceRail.success, false, "New service payments reject CARD as immediate cash");

  const externalWalkIn = createSaleSchema.safeParse({
    body: {
      items: [{ description: "Service", quantity: 1, unitPrice: 100 }],
      payments: [],
      receivable: { provider: "HOMECREDIT" },
    },
  });
  equal(externalWalkIn.success, true, "Validation permits walk-in external-provider AR");

  const saleDto = saleInternals.sanitizeSaleCostSnapshotsForActor(
    {
      id: "sale-1",
      idempotencyKey: "secret-key",
      idempotencyFingerprint: "secret-fingerprint",
      items: [],
      creditAccount: {
        id: "ar-1",
        idempotencyKey: "secret-key",
        idempotencyFingerprint: "secret-fingerprint",
      },
    },
    { role: "ADMIN" }
  );
  check(!JSON.stringify(saleDto).includes("secret-"), "Sale DTOs hide replay-control metadata");

  const creditDto = creditAccountService.testInternals.formatCreditAccount({
    status: "ACTIVE",
    remainingBalance: "10.00",
    totalCollected: "0.00",
    idempotencyKey: "secret-key",
    idempotencyFingerprint: "secret-fingerprint",
    collections: [
      {
        id: "collection-1",
        idempotencyKey: "secret-key",
        idempotencyFingerprint: "secret-fingerprint",
      },
    ],
  });
  check(!JSON.stringify(creditDto).includes("secret-"), "AR DTOs hide account and collection replay metadata");

  const serviceDto = serviceInternals.formatServiceJob(
    {
      id: "service-1",
      status: "COMPLETED",
      releasedAt: new Date(),
      finalServiceCharge: "100.00",
      customer: null,
      payments: [
        {
          id: "payment-1",
          status: "POSTED",
          amount: "20.00",
          idempotencyKey: "secret-key",
          idempotencyFingerprint: "secret-fingerprint",
        },
      ],
      creditAccount: {
        id: "ar-1",
        status: "ACTIVE",
        totalCollected: "0.00",
        remainingBalance: "80.00",
        idempotencyKey: "secret-key",
        idempotencyFingerprint: "secret-fingerprint",
        collections: [],
      },
    },
    null,
    { role: "CASHIER" }
  );
  check(!JSON.stringify(serviceDto).includes("secret-"), "Service DTOs hide payment and AR replay metadata");

  const enumMigration = fs.readFileSync(
    path.join(
      __dirname,
      "prisma/migrations/20260814170000_unify_accounts_receivable_settlements/migration.sql"
    ),
    "utf8"
  );
  const arMigration = fs.readFileSync(
    path.join(
      __dirname,
      "prisma/migrations/20260814170100_generalize_accounts_receivable_and_settlements/migration.sql"
    ),
    "utf8"
  );
  check(enumMigration.includes("ADD VALUE 'CANCELLED'"), "Service cancellation enum is committed separately");
  check(
    arMigration.includes('ServicePayment_serviceJobId_fkey') &&
      arMigration.includes("ON DELETE RESTRICT ON UPDATE CASCADE"),
    "ServicePayment source FK is explicitly recreated as RESTRICT"
  );
  check(
    arMigration.includes('CashTransaction_customer_source_event_key'),
    "Cash customer sources have a partial unique event guard"
  );
  check(
    !/DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM/i.test(
      `${enumMigration}\n${arMigration}`
    ),
    "AR migrations contain no table/column/data destruction"
  );
  equal(
    (arMigration.match(/"idempotencyFingerprint" IS NOT NULL/g) || [])
      .length,
    4,
    "Every replay-control check requires a non-null fingerprint when a key is present"
  );

  const creditServiceSource = fs.readFileSync(
    path.join(
      __dirname,
      "src/modules/credit-accounts/services/creditAccount.service.js"
    ),
    "utf8"
  );
  const collectionPostSource = creditServiceSource.slice(
    creditServiceSource.indexOf("const createCreditCollection"),
    creditServiceSource.indexOf("const cancelCreditCollection")
  );
  const collectionCancelSource = creditServiceSource.slice(
    creditServiceSource.indexOf("const cancelCreditCollection"),
    creditServiceSource.indexOf("const getCreditAccountById")
  );
  check(
    collectionPostSource.indexOf("await lockReceivableSource") <
      collectionPostSource.indexOf("await lockCreditAccount") &&
      collectionPostSource.indexOf("await lockCreditAccount") <
        collectionPostSource.indexOf("await lockBranch"),
    "Collection posting locks source, account, then branch in the shared source-first order"
  );
  check(
    collectionCancelSource.indexOf("await lockReceivableSource") <
      collectionCancelSource.indexOf("await lockCreditAccount") &&
      collectionCancelSource.indexOf("await lockCreditAccount") <
        collectionCancelSource.indexOf("await lockCreditCollection"),
    "Collection cancellation locks source, account, then collection in the shared source-first order"
  );
  check(
    collectionCancelSource.includes("CREDIT_COLLECTION_LEDGER_INCONSISTENT") &&
      !collectionCancelSource.includes("Math.max"),
    "Collection cancellation rejects inconsistent totals instead of clamping ledger state"
  );
  check(
    collectionPostSource.includes(
      'const paymentMethod = payload.paymentMethod || "CASH"'
    ) &&
      collectionPostSource.includes(
        'if (paymentMethod === "CASH")'
      ),
    "Default CASH collections use the same normalized method for ledger and cash posting"
  );

  const serviceSource = fs.readFileSync(
    path.join(
      __dirname,
      "src/modules/service-jobs/services/serviceJob.service.js"
    ),
    "utf8"
  );
  const paymentCancelSource = serviceSource.slice(
    serviceSource.indexOf("const cancelServicePayment"),
    serviceSource.indexOf("const updateServiceJobAssignment")
  );
  check(
    paymentCancelSource.indexOf('FROM "ServiceJob"') <
      paymentCancelSource.indexOf("await lockBranch") &&
      paymentCancelSource.indexOf("await lockBranch") <
        paymentCancelSource.indexOf('FROM "ServicePayment"'),
    "Service payment cancellation locks job, branch, then payment to serialize AR snapshots"
  );

  const quotationPageSource = fs.readFileSync(
    path.join(
      __dirname,
      "../arunafeltz-frontend/src/pages/quotations/QuotationsPage.jsx"
    ),
    "utf8"
  );
  check(
    quotationPageSource.includes("receivable: isConversionReceivable") &&
      quotationPageSource.includes(
        "idempotencyKey: conversionRequestRef.current.key"
      ) &&
      quotationPageSource.includes("T00:00:00+08:00") &&
      !quotationPageSource.includes('<option value="CARD">Card</option>') &&
      !quotationPageSource.includes('<option value="CREDIT">Credit</option>'),
    "Quotation conversion uses the atomic AR contract, retry key, and Manila due date"
  );

  const posPageSource = fs.readFileSync(
    path.join(
      __dirname,
      "../arunafeltz-frontend/src/pages/sales/PosSalesPage.jsx"
    ),
    "utf8"
  );
  check(
    posPageSource.includes(
      'paymentMethod !== "CASH" && tendered > totals.grandTotal'
    ),
    "POS blocks non-cash over-tender before submission"
  );

  console.log(`AR foundation pure regression passed ${assertionCount}/${assertionCount}`);
};

run();
