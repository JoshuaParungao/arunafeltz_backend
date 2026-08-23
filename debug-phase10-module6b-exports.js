const cashLinkService = require("./src/modules/cash-boxes/services/cashLink.service");
const saleService = require("./src/modules/sales/services/sale.service");
const creditAccountService = require("./src/modules/credit-accounts/services/creditAccount.service");

console.log("cashLinkService.postSystemCashIn:", typeof cashLinkService.postSystemCashIn);
console.log("cashLinkService.reverseSystemCashIn:", typeof cashLinkService.reverseSystemCashIn);
console.log("saleService.cancelSale:", typeof saleService.cancelSale);
console.log("creditAccountService.cancelCreditCollection:", typeof creditAccountService.cancelCreditCollection);
