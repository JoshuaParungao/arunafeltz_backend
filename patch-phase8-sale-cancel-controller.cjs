const fs = require("fs");

const filePath = "./src/modules/sales/controllers/sale.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const cancelSale = async")) {
  console.log("SKIP: cancelSale controller already exists.");
  process.exit(0);
}

const additions = [
  ['SALE_CANCEL_FORBIDDEN: [403, "Only owner/admin roles can cancel sales."],', "SALE_CANCEL_FORBIDDEN"],
  ['SALE_NOT_CANCELLABLE: [400, "Only completed sales can be cancelled."],', "SALE_NOT_CANCELLABLE"],
  ['SERIAL_CANCEL_STATUS_INVALID: [400, "Only SOLD serials can be restored during sale cancellation."],', "SERIAL_CANCEL_STATUS_INVALID"],
];

for (const [line, key] of additions) {
  if (content.includes(key)) {
    console.log(`SKIP: ${key} already exists.`);
    continue;
  }

  content = content.replace(
    'SALE_NOT_FOUND: [404, "Sale not found."],',
    `SALE_NOT_FOUND: [404, "Sale not found."],\n    ${line}`
  );

  console.log(`ADDED: ${key}`);
}

const handlerToAdd = `
const cancelSale = async (req, res, next) => {
  try {
    const sale = await saleService.cancelSale(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Sale cancelled successfully",
      data: sale,
    });
  } catch (error) {
    return handleSaleError(error, res, next);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${handlerToAdd}\nmodule.exports = {`
);

content = content.replace(
  "getSaleById,",
  "getSaleById,\n  cancelSale,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.controller.js patched with cancelSale.");
