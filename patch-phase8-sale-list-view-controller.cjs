const fs = require("fs");

const filePath = "./src/modules/sales/controllers/sale.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getSales = async")) {
  console.log("SKIP: sale list/view controller already exists.");
  process.exit(0);
}

if (!content.includes('SALE_NOT_FOUND: [404, "Sale not found."]')) {
  content = content.replace(
    'CUSTOM_LINE_INVENTORY_LINK_NOT_ALLOWED: [400, "Custom sale line cannot have batch or serial link."],',
    'CUSTOM_LINE_INVENTORY_LINK_NOT_ALLOWED: [400, "Custom sale line cannot have batch or serial link."],\n    SALE_NOT_FOUND: [404, "Sale not found."],'
  );

  console.log("ADDED: SALE_NOT_FOUND handler.");
}

const handlers = `
const getSales = async (req, res, next) => {
  try {
    const result = await saleService.getSales(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Sales retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};

const getSaleById = async (req, res, next) => {
  try {
    const sale = await saleService.getSaleById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Sale retrieved successfully",
      data: sale,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${handlers}\nmodule.exports = {`
);

content = content.replace(
  "createSale,",
  "createSale,\n  getSales,\n  getSaleById,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.controller.js patched with list/view handlers.");
