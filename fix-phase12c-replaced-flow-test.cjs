const fs = require("fs");

const filePath = "./phase12-module12c-warranty-status-flow-test.js";
let test = fs.readFileSync(filePath, "utf8");

const oldBlock = `  const replaced = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "REPLACED",
    actionTaken: "Unit replaced",
  });

  assert(replaced.status === 200, "CHECKING cannot directly replace is not allowed unless transition permits");
  assert(replaced.body.data.status === "REPLACED", "Status becomes REPLACED");
  assert(Boolean(replaced.body.data.replacedAt), "replacedAt saved");`;

const newBlock = `  const replacedSentToSupplier = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "SENT_TO_SUPPLIER",
    supplierName: "Replacement Supplier",
    supplierReferenceNo: "REP-12C-001",
  });

  assert(replacedSentToSupplier.status === 200, "Replaced flow moved to SENT_TO_SUPPLIER");

  const replaced = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "REPLACED",
    actionTaken: "Unit replaced",
  });

  assert(replaced.status === 200, "SENT_TO_SUPPLIER can move to REPLACED");
  assert(replaced.body.data.status === "REPLACED", "Status becomes REPLACED");
  assert(Boolean(replaced.body.data.replacedAt), "replacedAt saved");`;

if (!test.includes(oldBlock)) {
  throw new Error("Replaced flow block not found. Stop and inspect test manually.");
}

test = test.replace(oldBlock, newBlock);

fs.writeFileSync(filePath, test);

console.log("DONE: Phase 12C replaced flow test fixed.");
