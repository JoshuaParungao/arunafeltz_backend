const fs = require("fs");

const filePath = "./src/modules/sales/controllers/sale.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createCreditAccountFromSale")) {
  console.log("SKIP: controller already patched.");
  process.exit(0);
}

content = content.replace(
  `    SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],
  };
`,
  `    SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],
    SALE_NOT_CREDITABLE: [400, "Only completed sales can be converted to credit account."],
    SALE_CUSTOMER_REQUIRED_FOR_CREDIT: [400, "Sale must have a customer before creating credit account."],
    SALE_ALREADY_HAS_CREDIT_ACCOUNT: [400, "Sale already has a credit account."],
    CREDIT_DOWNPAYMENT_EXCEEDS_TOTAL: [400, "Sale amount paid cannot exceed sale grand total."],
    INVALID_INSTALLMENT_TERM: [400, "Invalid installment term."],
    INVALID_FIRST_DUE_DATE: [400, "Invalid first due date."],
    INSTALLMENT_TERM_NOT_CONFIGURED: [400, "Installment term is not configured in settings."],
    INVALID_CASH_DOWNPAYMENT: [400, "Cash downpayment cannot be greater than cash promo total amount."],
    INVALID_SETTING_VALUE: [500, "Invalid installment setting value."],
    REQUIRED_SETTING_MISSING: [500, "Required installment setting is missing."],
  };
`
);

content = content.replace(
  `const cancelSale = async (req, res, next) => {
`,
  `const createCreditAccountFromSale = async (req, res, next) => {
  try {
    const creditAccount = await saleService.createCreditAccountFromSale(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Credit account created successfully",
      data: creditAccount,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

const cancelSale = async (req, res, next) => {
`
);

content = content.replace(
  `  getSaleById,
  cancelSale,
};
`,
  `  getSaleById,
  createCreditAccountFromSale,
  cancelSale,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: sale.controller.js patched for createCreditAccountFromSale.");
