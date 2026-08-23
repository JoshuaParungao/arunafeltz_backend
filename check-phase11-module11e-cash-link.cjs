const fs = require("fs");

const filePath = "./src/modules/cash-boxes/services/cashLink.service.js";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("postSystemCashOut")) {
  console.log("INFO: No generic cash out link needed for 11E.");
}

if (!content.includes("postSystemCashIn")) {
  throw new Error("postSystemCashIn missing from cashLink.service.js");
}

console.log("DONE: cashLink.service.js already supports service CASH in through postSystemCashIn.");
