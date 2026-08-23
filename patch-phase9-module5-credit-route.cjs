const fs = require("fs");

const filePath = "./src/modules/credit-accounts/routes/creditAccount.routes.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("/:id/collections")) {
  console.log("SKIP: collection route already exists.");
  process.exit(0);
}

content = content.replace(
  `  listCreditAccountsSchema,
  creditAccountIdParamSchema,
} = require("../validations/creditAccount.validation");
`,
  `  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
} = require("../validations/creditAccount.validation");
`
);

content = content.replace(
  `router.get(
  "/:id",
`,
  `router.post(
  "/:id/collections",
  validate(createCreditCollectionSchema),
  creditAccountController.createCreditCollection
);

router.get(
  "/:id",
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: creditAccount.routes.js patched for collection posting.");
