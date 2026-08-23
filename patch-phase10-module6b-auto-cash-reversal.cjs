const fs = require("fs");

const cashLinkPath = "./src/modules/cash-boxes/services/cashLink.service.js";
const saleServicePath = "./src/modules/sales/services/sale.service.js";
const creditServicePath = "./src/modules/credit-accounts/services/creditAccount.service.js";
const saleControllerPath = "./src/modules/sales/controllers/sale.controller.js";
const creditControllerPath = "./src/modules/credit-accounts/controllers/creditAccount.controller.js";

const findFunctionBlock = (content, functionName) => {
  const start = content.indexOf(`const ${functionName} = async`);

  if (start === -1) {
    throw new Error(`Cannot find function ${functionName}`);
  }

  const firstBrace = content.indexOf("{", start);

  if (firstBrace === -1) {
    throw new Error(`Cannot find opening brace for ${functionName}`);
  }

  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      const semicolon = content.indexOf(";", i);

      if (semicolon === -1) {
        throw new Error(`Cannot find semicolon for ${functionName}`);
      }

      return {
        start,
        end: semicolon + 1,
        text: content.slice(start, semicolon + 1),
      };
    }
  }

  throw new Error(`Cannot find closing brace for ${functionName}`);
};

const replaceFunctionBlock = (content, functionName, newBlock) => {
  const block = findFunctionBlock(content, functionName);
  return content.slice(0, block.start) + newBlock + content.slice(block.end);
};

/* =========================
   PATCH CASH LINK SERVICE
========================= */
let cashLink = fs.readFileSync(cashLinkPath, "utf8");

if (!cashLink.includes("const reverseSystemCashIn")) {
  const helper = `
const reverseSystemCashIn = async (tx, actor, payload) => {
  const cashTransaction = await tx.cashTransaction.findFirst({
    where: {
      source: payload.source,
      sourceId: payload.sourceId,
      type: payload.type,
      status: "POSTED",
    },
    include: {
      cashBox: true,
    },
  });

  if (!cashTransaction) {
    return null;
  }

  const cashBox = cashTransaction.cashBox;

  if (cashBox.status !== "ACTIVE") {
    const error = new Error("CASH_BOX_NOT_ACTIVE");
    error.statusCode = 400;
    throw error;
  }

  const amount = toMoney(Number(cashTransaction.amount));
  const balanceBefore = toMoney(Number(cashBox.currentBalance));
  const balanceAfter = toMoney(balanceBefore - amount);

  if (balanceAfter < 0) {
    const error = new Error("CASH_REVERSAL_NEGATIVE_BALANCE");
    error.statusCode = 400;
    throw error;
  }

  const cancelledTransaction = await tx.cashTransaction.update({
    where: {
      id: cashTransaction.id,
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason: payload.cancellationReason,
    },
  });

  const updatedCashBox = await tx.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: toMoneyString(balanceAfter),
      updatedById: actor.id,
    },
  });

  return {
    transaction: cancelledTransaction,
    cashBox: updatedCashBox,
  };
};

`;

  cashLink = cashLink.replace(
    `module.exports = {`,
    `${helper}module.exports = {`
  );
}

cashLink = cashLink.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  postSystemCashIn,
  reverseSystemCashIn,
};`
);

fs.writeFileSync(cashLinkPath, cashLink);

/* =========================
   PATCH SALE CANCEL
========================= */
let saleService = fs.readFileSync(saleServicePath, "utf8");

if (!saleService.includes("reverseSystemCashIn(tx, actor, {")) {
  const saleBlock = findFunctionBlock(saleService, "cancelSale");

  if (!saleBlock.text.includes("    return cancelledSale;")) {
    throw new Error("cancelSale return marker not found");
  }

  const snippet = `
    await cashLinkService.reverseSystemCashIn(tx, actor, {
      source: "SALE",
      sourceId: sale.id,
      type: "SALE_PAYMENT",
      cancellationReason: \`Auto cash reversal from cancelled sale \${sale.receiptCode}. Reason: \${payload.cancellationReason}\`,
    });

`;

  const patchedSaleBlock = saleBlock.text.replace(
    "    return cancelledSale;",
    `${snippet}    return cancelledSale;`
  );

  saleService = replaceFunctionBlock(saleService, "cancelSale", patchedSaleBlock);
}

fs.writeFileSync(saleServicePath, saleService);

/* =========================
   PATCH CREDIT COLLECTION CANCEL
========================= */
let creditService = fs.readFileSync(creditServicePath, "utf8");

if (!creditService.includes('source: "CREDIT_COLLECTION"') || !creditService.includes("Auto cash reversal from cancelled credit collection")) {
  const creditBlock = findFunctionBlock(creditService, "cancelCreditCollection");

  if (!creditBlock.text.includes("    return {\n      collection: cancelledCollection,")) {
    throw new Error("cancelCreditCollection return marker not found");
  }

  const snippet = `
    await cashLinkService.reverseSystemCashIn(tx, actor, {
      source: "CREDIT_COLLECTION",
      sourceId: collection.id,
      type: "CREDIT_COLLECTION",
      cancellationReason: \`Auto cash reversal from cancelled credit collection \${collection.collectionCode}. Reason: \${payload.cancellationReason}\`,
    });

`;

  const patchedCreditBlock = creditBlock.text.replace(
    "    return {\n      collection: cancelledCollection,",
    `${snippet}    return {\n      collection: cancelledCollection,`
  );

  creditService = replaceFunctionBlock(creditService, "cancelCreditCollection", patchedCreditBlock);
}

fs.writeFileSync(creditServicePath, creditService);

/* =========================
   PATCH CONTROLLER ERROR MAPS
========================= */
let saleController = fs.readFileSync(saleControllerPath, "utf8");

if (!saleController.includes("CASH_REVERSAL_NEGATIVE_BALANCE")) {
  saleController = saleController.replace(
    `    REQUIRED_SETTING_MISSING: [500, "Required installment setting is missing."],`,
    `    REQUIRED_SETTING_MISSING: [500, "Required installment setting is missing."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],`
  );
}

fs.writeFileSync(saleControllerPath, saleController);

let creditController = fs.readFileSync(creditControllerPath, "utf8");

if (!creditController.includes("CASH_REVERSAL_NEGATIVE_BALANCE")) {
  creditController = creditController.replace(
    `    CREDIT_ACCOUNT_NOT_REVERSIBLE: [400, "Credit account is not reversible."],`,
    `    CREDIT_ACCOUNT_NOT_REVERSIBLE: [400, "Credit account is not reversible."],
    CASH_BOX_NOT_ACTIVE: [400, "Cash box is not active."],
    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],`
  );
}

fs.writeFileSync(creditControllerPath, creditController);

console.log("DONE: Phase 10 Module 6B auto cash reversal patched.");
