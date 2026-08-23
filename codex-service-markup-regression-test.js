const assert = require("node:assert/strict");

require("dotenv").config();

const prisma = require("./src/config/prisma");
const quotationService = require("./src/modules/quotations/services/quotation.service");
const saleService = require("./src/modules/sales/services/sale.service");

const run = async () => {
  const quotationInternals = quotationService.testInternals;
  const saleInternals = saleService.testInternals;

  assert.equal(
    quotationInternals.applyMarkupToBasePrice(30000, 25),
    40000,
    "product markup formula must remain base / (1 - rate)"
  );
  assert.equal(
    quotationInternals.applyMarkupToBasePrice(5000, 20),
    6250,
    "service markup must use the same formula"
  );
  assert.equal(
    quotationInternals.applyMarkupToBasePrice(2.53, 12),
    2.87,
    "service/custom markup must retain the existing backend money convention"
  );

  assert.throws(
    () => quotationInternals.resolveMarkupPercent(100),
    /INVALID_MARKUP_PERCENT/
  );
  assert.throws(
    () => saleInternals.resolveMarkupPercent(-0.01),
    /INVALID_MARKUP_PERCENT/
  );

  const customQuotation = await quotationInternals.buildQuotationItems(
    {},
    { role: "CASHIER" },
    "branch-1",
    [
      {
        description: "Board repair service",
        priceTier: 1,
        quantity: 2,
        unitPrice: 5000,
        markupPercent: 20,
        discountAmount: 500,
      },
    ]
  );

  assert.equal(customQuotation.quotationItems[0].baseUnitPriceSnapshot, "5000.00");
  assert.equal(customQuotation.quotationItems[0].markupPercent, "20.0000");
  assert.equal(customQuotation.quotationItems[0].unitPrice, "6250.00");
  assert.equal(customQuotation.quotationItems[0].lineTotal, "12000.00");
  assert.equal(customQuotation.grandTotal, 12000);

  const unmarkedQuotation = await quotationInternals.buildQuotationItems(
    {},
    { role: "CASHIER" },
    "branch-1",
    [
      {
        description: "Diagnostic service",
        priceTier: 1,
        quantity: 1,
        unitPrice: 850,
        discountAmount: 0,
      },
    ]
  );

  assert.equal(unmarkedQuotation.quotationItems[0].baseUnitPriceSnapshot, "850.00");
  assert.equal(unmarkedQuotation.quotationItems[0].markupPercent, "0.0000");
  assert.equal(unmarkedQuotation.quotationItems[0].unitPrice, "850.00");

  const conversionItems = saleInternals.buildQuotationConversionItems(
    {
      items: [
        {
          itemId: null,
          item: null,
          description: "Board repair service",
          quantity: 2,
          baseUnitPriceSnapshot: "5000.00",
          markupPercent: "20.0000",
          unitPrice: "6250.00",
          discountAmount: "500.00",
        },
      ],
    },
    [{}]
  );

  assert.deepEqual(
    {
      base: conversionItems[0].baseUnitPriceSnapshot,
      markup: conversionItems[0].markupPercent,
      final: conversionItems[0].unitPrice,
    },
    { base: 5000, markup: 20, final: 6250 },
    "quotation conversion must carry custom-line pricing snapshots"
  );

  const directSale = await saleInternals.buildSaleItems(
    {},
    { role: "CASHIER" },
    "branch-1",
    [
      {
        description: "Ordinary repair service",
        quantity: 1,
        unitPrice: 5000,
        markupPercent: 20,
        discountAmount: 0,
      },
    ]
  );

  assert.equal(directSale.saleItems[0].baseUnitPriceSnapshot, "5000.00");
  assert.equal(directSale.saleItems[0].markupPercent, "20.0000");
  assert.equal(directSale.saleItems[0].unitPrice, "6250.00");
  assert.equal(directSale.saleItems[0].lineTotal, "6250.00");

  const convertedSale = await saleInternals.buildSaleItems(
    {},
    { role: "CASHIER" },
    "branch-1",
    conversionItems,
    { trustedQuotation: true }
  );

  assert.equal(convertedSale.saleItems[0].baseUnitPriceSnapshot, "5000.00");
  assert.equal(convertedSale.saleItems[0].markupPercent, "20.0000");
  assert.equal(convertedSale.saleItems[0].unitPrice, "6250.00");

  console.log("Service/custom markup regression: 21 assertions passed.");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
