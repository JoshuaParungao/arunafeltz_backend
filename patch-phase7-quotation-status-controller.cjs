const fs = require("fs");

const filePath = "./src/modules/quotations/controllers/quotation.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateQuotationStatus = async")) {
  console.log("SKIP: updateQuotationStatus controller already exists.");
  process.exit(0);
}

if (!content.includes("INVALID_QUOTATION_STATUS_TRANSITION")) {
  content = content.replace(
    'QUOTATION_NOT_EDITABLE: [400, "Only draft quotations can be updated."],',
    'QUOTATION_NOT_EDITABLE: [400, "Only draft quotations can be updated."],\n    INVALID_QUOTATION_STATUS_TRANSITION: [400, "Invalid quotation status transition."],'
  );

  console.log("ADDED: INVALID_QUOTATION_STATUS_TRANSITION handler.");
}

const handlerToAdd = `
const updateQuotationStatus = async (req, res, next) => {
  try {
    const quotation = await quotationService.updateQuotationStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Quotation status updated successfully",
      data: quotation,
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${handlerToAdd}\nmodule.exports = {`
);

content = content.replace(
  "updateQuotation,",
  "updateQuotation,\n  updateQuotationStatus,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.controller.js patched with updateQuotationStatus.");
