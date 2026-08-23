const fs = require("fs");

const filePath = "./src/modules/quotations/controllers/quotation.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateQuotation = async")) {
  console.log("SKIP: updateQuotation controller already exists.");
  process.exit(0);
}

if (!content.includes("QUOTATION_NOT_EDITABLE")) {
  content = content.replace(
    'QUOTATION_NOT_FOUND: [404, "Quotation not found."],',
    'QUOTATION_NOT_FOUND: [404, "Quotation not found."],\n    QUOTATION_NOT_EDITABLE: [400, "Only draft quotations can be updated."],'
  );

  console.log("ADDED: QUOTATION_NOT_EDITABLE handler.");
}

const handlerToAdd = `
const updateQuotation = async (req, res, next) => {
  try {
    const quotation = await quotationService.updateQuotation(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Quotation updated successfully",
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
  "getQuotationById,",
  "getQuotationById,\n  updateQuotation,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.controller.js patched with updateQuotation.");
