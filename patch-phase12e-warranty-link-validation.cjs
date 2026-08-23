const fs = require("fs");

const servicePath = "./src/modules/warranty-claims/services/warrantyClaim.service.js";
const controllerPath = "./src/modules/warranty-claims/controllers/warrantyClaim.controller.js";

let service = fs.readFileSync(servicePath, "utf8");

const oldCustomerBlock = `    const resolvedCustomerId = payload.customerId || sale?.customerId || saleItem?.sale?.customerId || null;
    const customer = await validateCustomer(tx, resolvedCustomerId, branch.id);`;

const newCustomerBlock = `    const resolvedCustomerId = payload.customerId || sale?.customerId || saleItem?.sale?.customerId || null;
    const customer = await validateCustomer(tx, resolvedCustomerId, branch.id);

    if (payload.customerId && sale?.customerId && payload.customerId !== sale.customerId) {
      const error = new Error("CUSTOMER_SALE_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (
      payload.customerId &&
      saleItem?.sale?.customerId &&
      payload.customerId !== saleItem.sale.customerId
    ) {
      const error = new Error("CUSTOMER_SALE_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }`;

if (!service.includes("CUSTOMER_SALE_MISMATCH")) {
  if (!service.includes(oldCustomerBlock)) {
    throw new Error("Customer validation block not found. Stop and inspect service manually.");
  }

  service = service.replace(oldCustomerBlock, newCustomerBlock);
}

const oldMismatchBlock = `    if (payload.itemId && serial && payload.itemId !== serial.itemId) {
      const error = new Error("SERIAL_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (payload.itemId && saleItem?.itemId && payload.itemId !== saleItem.itemId) {
      const error = new Error("SALE_ITEM_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (payload.serialId && saleItem?.serialId && payload.serialId !== saleItem.serialId) {
      const error = new Error("SALE_ITEM_SERIAL_MISMATCH");
      error.statusCode = 400;
      throw error;
    }`;

const newMismatchBlock = `    if (serial && item && serial.itemId !== item.id) {
      const error = new Error("SERIAL_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (saleItem && item && saleItem.itemId && saleItem.itemId !== item.id) {
      const error = new Error("SALE_ITEM_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (saleItem && serial && saleItem.serialId && saleItem.serialId !== serial.id) {
      const error = new Error("SALE_ITEM_SERIAL_MISMATCH");
      error.statusCode = 400;
      throw error;
    }`;

if (service.includes(oldMismatchBlock)) {
  service = service.replace(oldMismatchBlock, newMismatchBlock);
} else if (!service.includes("saleItem && item && saleItem.itemId")) {
  throw new Error("Mismatch validation block not found. Stop and inspect service manually.");
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CUSTOMER_SALE_MISMATCH")) {
  controller = controller.replace(
    `    SALE_ITEM_SALE_MISMATCH: [400, "Sale item does not belong to the selected sale."],`,
    `    SALE_ITEM_SALE_MISMATCH: [400, "Sale item does not belong to the selected sale."],
    CUSTOMER_SALE_MISMATCH: [400, "Customer does not match the selected sale."],
    CUSTOMER_SALE_ITEM_MISMATCH: [400, "Customer does not match the selected sale item."],`
  );
}

fs.writeFileSync(controllerPath, controller);

console.log("DONE: Phase 12E warranty link validation hardened.");
