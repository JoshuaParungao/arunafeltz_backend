const BASE_URL = "http://localhost:5000";

let passed = 0;
let failed = 0;

function pass(message) {
  passed += 1;
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failed += 1;
  console.log(`[FAIL] ${message}`);
}

function assertTrue(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    pass(`${message} => ${actual}`);
  } else {
    fail(`${message} => expected ${expected} but got ${actual}`);
  }
}

function assertNear(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) {
    pass(`${message} => ${actual}`);
  } else {
    fail(`${message} => expected near ${expected} but got ${actual}`);
  }
}

async function api(method, path, token = null, body = null) {
  const headers = {
    "Accept": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: {
        code: "JSON_PARSE_ERROR",
        message: text,
      },
    };
  }
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("ARUNAFELTZ PHASE 3 FINAL TEST - NODE");
  console.log("========================================");
  console.log("");

  // 1. Health
  const health = await api("GET", "/api/health");
  assertTrue(health.success === true, "Health endpoint returns success");
  assertEqual(health.data?.status, "healthy", "Health status");

  // 2. Super Owner Login
  const superLogin = await api("POST", "/api/auth/login", null, {
    identifier: "superowner",
    password: "Password123!",
  });

  assertTrue(superLogin.success === true, "Super Owner login success");
  const superToken = superLogin.data?.token;

  // 3. Admin Login
  const adminLogin = await api("POST", "/api/auth/login", null, {
    identifier: "mainadmin",
    password: "Password123!",
  });

  assertTrue(adminLogin.success === true, "Admin login success");
  const adminToken = adminLogin.data?.token;

  // 4. Settings Count
  const settings = await api("GET", "/api/settings", superToken);
  assertTrue(settings.success === true, "Super Owner can view settings");
  assertEqual(settings.data?.length, 14, "Settings count remains");

  // 5. No Token
  const noTokenSettings = await api("GET", "/api/settings");
  assertEqual(noTokenSettings.error?.code, "TOKEN_REQUIRED", "No token protected route");

  // 6. Invalid Token
  const invalidTokenSettings = await api("GET", "/api/settings", "invalid-token");
  assertEqual(invalidTokenSettings.error?.code, "INVALID_TOKEN", "Invalid token protected route");

  // 7. Super Owner Update
  const updateSetting = await api(
    "PATCH",
    "/api/settings/scope/GLOBAL:quotation.suggested_retail_price_basis",
    superToken,
    { value: 0.96 }
  );

  assertTrue(updateSetting.success === true, "Super Owner can update setting");
  assertEqual(updateSetting.data?.value, 0.96, "Updated suggested retail price basis");

  // 8. Admin Cannot Update
  const adminUpdateSetting = await api(
    "PATCH",
    "/api/settings/scope/GLOBAL:quotation.suggested_retail_price_basis",
    adminToken,
    { value: 0.96 }
  );

  assertEqual(adminUpdateSetting.error?.code, "FORBIDDEN", "Admin cannot update setting");

  // 9. Quotation Rules
  const quotationRules = await api("GET", "/api/settings/business-rules/quotation", superToken);
  assertTrue(quotationRules.success === true, "Quotation rules endpoint works");
  assertEqual(quotationRules.data?.basis?.suggestedRetailPriceBasis, 0.96, "Quotation SRP basis");
  assertEqual(quotationRules.data?.basis?.regularPriceBasis, 0.875, "Quotation regular price basis");

  const quotationCompute = await api(
    "POST",
    "/api/settings/business-rules/quotation/test-compute",
    superToken,
    {
      items: [
        {
          itemCode: "ITEM-001",
          description: "Sample Item 1",
          quantity: 2,
          cashDiscountedPrice: 1000,
        },
        {
          itemCode: "ITEM-002",
          description: "Sample Item 2",
          quantity: 1,
          cashDiscountedPrice: 500,
        },
      ],
    }
  );

  assertTrue(quotationCompute.success === true, "Quotation computation works");
  assertEqual(quotationCompute.data?.totals?.totalCashDiscountedPrice, 2500, "Quotation total cash discounted price");
  assertNear(quotationCompute.data?.totals?.suggestedRetailPrice, 2604.17, 0.01, "Quotation suggested retail price");
  assertNear(quotationCompute.data?.totals?.regularPrice, 2857.14, 0.01, "Quotation regular price");

  const quotationInvalid = await api(
    "POST",
    "/api/settings/business-rules/quotation/test-compute",
    superToken,
    {
      items: [
        {
          itemCode: "BAD",
          description: "Invalid",
          quantity: 0,
          cashDiscountedPrice: 1000,
        },
      ],
    }
  );

  assertEqual(quotationInvalid.error?.code, "VALIDATION_ERROR", "Quotation invalid payload validation");

  // 10. Installment Rules
  const installmentRules = await api("GET", "/api/settings/business-rules/installment", superToken);
  assertTrue(installmentRules.success === true, "Installment rules endpoint works");
  assertEqual(installmentRules.data?.termBasis?.MONTH_12, 0.875, "Installment MONTH_12 basis");
  assertEqual(installmentRules.data?.termBasis?.MONTH_6, 0.935, "Installment MONTH_6 basis");

  const installmentCompute = await api(
    "POST",
    "/api/settings/business-rules/installment/test-compute",
    superToken,
    {
      cashPromoTotalAmount: 2500,
      cashDownpayment: 500,
      term: "MONTH_12",
    }
  );

  assertTrue(installmentCompute.success === true, "Installment MONTH_12 computation works");
  assertNear(installmentCompute.data?.result?.regularPriceTotalAmount, 2857.14, 0.01, "Installment regular price total amount");
  assertNear(installmentCompute.data?.result?.balance, 2285.71, 0.01, "Installment balance");

  const installmentInvalidDownpayment = await api(
    "POST",
    "/api/settings/business-rules/installment/test-compute",
    superToken,
    {
      cashPromoTotalAmount: 2500,
      cashDownpayment: 3000,
      term: "MONTH_12",
    }
  );

  assertEqual(installmentInvalidDownpayment.error?.code, "INVALID_CASH_DOWNPAYMENT", "Installment invalid downpayment validation");

  const installmentInvalidTerm = await api(
    "POST",
    "/api/settings/business-rules/installment/test-compute",
    superToken,
    {
      cashPromoTotalAmount: 2500,
      cashDownpayment: 500,
      term: "MONTH_99",
    }
  );

  assertEqual(installmentInvalidTerm.error?.code, "VALIDATION_ERROR", "Installment invalid term validation");

  // 11. Warranty Rules
  const warrantyRules = await api("GET", "/api/settings/business-rules/warranty", superToken);
  assertTrue(warrantyRules.success === true, "Warranty rules endpoint works");
  assertEqual(warrantyRules.data?.rules?.majorPartsMonths, 12, "Warranty major parts months");
  assertEqual(warrantyRules.data?.rules?.accessoriesDays, 30, "Warranty accessories days");
  assertEqual(warrantyRules.data?.rules?.outrightReplacementDays, 7, "Warranty outright replacement days");

  const majorWarranty = await api(
    "POST",
    "/api/settings/business-rules/warranty/test-compute",
    superToken,
    {
      productType: "MAJOR_PART",
      purchaseDate: "2026-07-28",
    }
  );

  assertTrue(majorWarranty.success === true, "Major part warranty computation works");
  assertEqual(majorWarranty.data?.result?.warrantyEndDate, "2027-07-28", "Major part warranty end date");
  assertEqual(majorWarranty.data?.result?.outrightReplacementUntil, "2026-08-04", "Major part outright replacement until");

  const accessoryWarranty = await api(
    "POST",
    "/api/settings/business-rules/warranty/test-compute",
    superToken,
    {
      productType: "ACCESSORY",
      purchaseDate: "2026-07-28",
    }
  );

  assertTrue(accessoryWarranty.success === true, "Accessory warranty computation works");
  assertEqual(accessoryWarranty.data?.result?.warrantyEndDate, "2026-08-27", "Accessory warranty end date");
  assertEqual(accessoryWarranty.data?.result?.outrightReplacementUntil, "2026-08-04", "Accessory outright replacement until");

  const warrantyInvalidType = await api(
    "POST",
    "/api/settings/business-rules/warranty/test-compute",
    superToken,
    {
      productType: "PRINTER",
      purchaseDate: "2026-07-28",
    }
  );

  assertEqual(warrantyInvalidType.error?.code, "VALIDATION_ERROR", "Warranty invalid product type validation");

  const warrantyInvalidDate = await api(
    "POST",
    "/api/settings/business-rules/warranty/test-compute",
    superToken,
    {
      productType: "MAJOR_PART",
      purchaseDate: "invalid-date",
    }
  );

  assertEqual(warrantyInvalidDate.error?.code, "INVALID_PURCHASE_DATE", "Warranty invalid date validation");

  // 12. Cash Box Rules
  const cashBoxRules = await api("GET", "/api/settings/business-rules/cash-box", superToken);
  assertTrue(cashBoxRules.success === true, "Cash box rules endpoint works");
  assertEqual(cashBoxRules.data?.rules?.requireHandoverConfirmation, true, "Cash box requires handover confirmation");
  assertEqual(cashBoxRules.data?.rules?.defaultPaymentStatus, "PENDING_HANDOVER", "Cash box default payment status");
  assertEqual(cashBoxRules.data?.rules?.confirmedPaymentStatus, "CONFIRMED_RECEIVED", "Cash box confirmed payment status");

  const cashPending = await api(
    "POST",
    "/api/settings/business-rules/cash-box/test-status",
    superToken,
    {
      paymentAmount: 2500,
      recordedByRole: "CASHIER",
      isCustodianConfirmed: false,
    }
  );

  assertTrue(cashPending.success === true, "Cash box pending handover test works");
  assertEqual(cashPending.data?.result?.currentStatus, "PENDING_HANDOVER", "Cash box pending current status");
  assertEqual(cashPending.data?.result?.needsCustodianConfirmation, true, "Cash box pending needs custodian confirmation");

  const cashConfirmed = await api(
    "POST",
    "/api/settings/business-rules/cash-box/test-status",
    superToken,
    {
      paymentAmount: 2500,
      recordedByRole: "CASHIER",
      isCustodianConfirmed: true,
    }
  );

  assertTrue(cashConfirmed.success === true, "Cash box confirmed received test works");
  assertEqual(cashConfirmed.data?.result?.currentStatus, "CONFIRMED_RECEIVED", "Cash box confirmed current status");
  assertEqual(cashConfirmed.data?.result?.needsCustodianConfirmation, false, "Cash box confirmed does not need custodian confirmation");

  const cashInvalidAmount = await api(
    "POST",
    "/api/settings/business-rules/cash-box/test-status",
    superToken,
    {
      paymentAmount: 0,
      recordedByRole: "CASHIER",
      isCustodianConfirmed: false,
    }
  );

  assertEqual(cashInvalidAmount.error?.code, "VALIDATION_ERROR", "Cash box invalid amount validation");

  const cashInvalidRole = await api(
    "POST",
    "/api/settings/business-rules/cash-box/test-status",
    superToken,
    {
      paymentAmount: 2500,
      recordedByRole: "CUSTOMER",
      isCustodianConfirmed: false,
    }
  );

  assertEqual(cashInvalidRole.error?.code, "VALIDATION_ERROR", "Cash box invalid role validation");

  // 13. Final Settings Count
  const finalSettings = await api("GET", "/api/settings", superToken);
  assertEqual(finalSettings.data?.length, 14, "Final settings count still");

  console.log("");
  console.log("========================================");
  console.log("PHASE 3 FINAL TEST RESULT");
  console.log("========================================");
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);

  if (failed === 0) {
    console.log("STATUS: PHASE 3 PASSED");
    process.exit(0);
  }

  console.log("STATUS: PHASE 3 HAS FAILURES");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
