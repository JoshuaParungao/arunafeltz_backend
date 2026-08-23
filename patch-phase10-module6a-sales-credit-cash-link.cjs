const fs = require("fs");

const saleServicePath = "./src/modules/sales/services/sale.service.js";
const creditServicePath = "./src/modules/credit-accounts/services/creditAccount.service.js";

const insertAfter = (content, marker, insertion, label) => {
  if (content.includes(insertion.trim())) {
    console.log(`SKIP: ${label} already exists.`);
    return content;
  }

  if (!content.includes(marker)) {
    throw new Error(`Missing marker for ${label}: ${marker}`);
  }

  return content.replace(marker, `${marker}\n${insertion}`);
};

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
   PATCH SALE SERVICE
========================= */
let saleService = fs.readFileSync(saleServicePath, "utf8");

saleService = insertAfter(
  saleService,
  `const settingService = require("../../settings/services/setting.service");`,
  `const cashLinkService = require("../../cash-boxes/services/cashLink.service");`,
  "sale cashLink require"
);

const saleBlock = findFunctionBlock(saleService, "createSale");

if (!saleBlock.text.includes("cashLinkService.postSystemCashIn")) {
  if (!saleBlock.text.includes("const { salePayments, amountPaid } = buildSalePayments(actor, payload.payments);")) {
    throw new Error("Sale create function marker missing: salePayments build line");
  }

  if (!saleBlock.text.includes("return sale;")) {
    throw new Error("Sale create function marker missing: return sale;");
  }

  const saleCashSnippet = `
    const cashPaymentTotal = salePayments
      .filter((payment) => payment.paymentMethod === "CASH")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    if (cashPaymentTotal > 0) {
      await cashLinkService.postSystemCashIn(tx, actor, branch, {
        type: "SALE_PAYMENT",
        source: "SALE",
        amount: cashPaymentTotal,
        description: \`Cash payment from sale \${receiptCode}.\`,
        referenceNo: null,
        sourceId: sale.id,
        sourceCode: receiptCode,
        transactionDate: sale.saleDate,
      });
    }

`;

  const patchedSaleBlock = saleBlock.text.replace("    return sale;", `${saleCashSnippet}    return sale;`);

  saleService = replaceFunctionBlock(saleService, "createSale", patchedSaleBlock);

  console.log("DONE: Sale service patched for CASH sale auto cash-in.");
} else {
  console.log("SKIP: Sale service already patched.");
}

fs.writeFileSync(saleServicePath, saleService);

/* =========================
   PATCH CREDIT ACCOUNT SERVICE
========================= */
let creditService = fs.readFileSync(creditServicePath, "utf8");

creditService = insertAfter(
  creditService,
  `const prisma = require("../../../config/prisma");`,
  `const cashLinkService = require("../../cash-boxes/services/cashLink.service");`,
  "credit cashLink require"
);

const creditBlock = findFunctionBlock(creditService, "createCreditCollection");

if (!creditBlock.text.includes("cashLinkService.postSystemCashIn")) {
  const collectionMatch = creditBlock.text.match(/const\s+(\w+)\s*=\s*await\s+tx\.creditCollection\.create/);

  if (!collectionMatch) {
    throw new Error("Credit collection create marker missing: const <name> = await tx.creditCollection.create");
  }

  const collectionVariable = collectionMatch[1];

  const returnIndex = creditBlock.text.lastIndexOf("    return ");

  if (returnIndex === -1) {
    throw new Error("Credit collection create function marker missing: return statement");
  }

  const creditCashSnippet = `
    if (payload.paymentMethod === "CASH") {
      await cashLinkService.postSystemCashIn(tx, actor, creditAccount.branch, {
        type: "CREDIT_COLLECTION",
        source: "CREDIT_COLLECTION",
        amount,
        description: \`Cash payment from credit collection \${${collectionVariable}.collectionCode}.\`,
        referenceNo: ${collectionVariable}.referenceNo,
        sourceId: ${collectionVariable}.id,
        sourceCode: ${collectionVariable}.collectionCode,
        transactionDate: ${collectionVariable}.paidAt,
      });
    }

`;

  const patchedCreditBlock =
    creditBlock.text.slice(0, returnIndex) +
    creditCashSnippet +
    creditBlock.text.slice(returnIndex);

  creditService = replaceFunctionBlock(creditService, "createCreditCollection", patchedCreditBlock);

  console.log("DONE: Credit account service patched for CASH collection auto cash-in.");
} else {
  console.log("SKIP: Credit account service already patched.");
}

fs.writeFileSync(creditServicePath, creditService);

console.log("DONE: Phase 10 Module 6A patch completed.");
