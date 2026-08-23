const fs = require("fs");

const filePath = "./src/modules/quotations/controllers/quotation.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getQuotations = async")) {
  console.log("SKIP: quotation list/view controller already exists.");
  process.exit(0);
}

if (!content.includes("QUOTATION_NOT_FOUND")) {
  content = content.replace(
    'DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],',
    'DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],\n    QUOTATION_NOT_FOUND: [404, "Quotation not found."],'
  );

  console.log("ADDED: QUOTATION_NOT_FOUND handler.");
}

const handlersToAdd = `
const getQuotations = async (req, res, next) => {
  try {
    const result = await quotationService.getQuotations(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Quotations fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};

const getQuotationById = async (req, res, next) => {
  try {
    const quotation = await quotationService.getQuotationById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Quotation fetched successfully",
      data: quotation,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${handlersToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createQuotation,",
  "createQuotation,\n  getQuotations,\n  getQuotationById,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.controller.js patched with list/view handlers.");
