const fs = require("fs");

const filePath = "./src/modules/credit-accounts/controllers/creditAccount.controller.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createCreditCollection")) {
  console.log("SKIP: createCreditCollection controller already exists.");
  process.exit(0);
}

content = content.replace(
  `    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],
  };
`,
  `    CREDIT_ACCOUNT_NOT_FOUND: [404, "Credit account not found."],
    CREDIT_ACCOUNT_NOT_COLLECTIBLE: [400, "Only active credit accounts can receive collections."],
    COLLECTION_AMOUNT_EXCEEDS_BALANCE: [400, "Collection amount cannot exceed remaining balance."],
    INVALID_COLLECTION_PAID_AT: [400, "Invalid collection paid date."],
  };
`
);

content = content.replace(
  `const getCreditAccountById = async (req, res, next) => {
`,
  `const createCreditCollection = async (req, res, next) => {
  try {
    const result = await creditAccountService.createCreditCollection(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Credit collection posted successfully",
      data: result,
    });
  } catch (error) {
    return handleCreditAccountError(error, res, next);
  }
};

const getCreditAccountById = async (req, res, next) => {
`
);

content = content.replace(
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
};
`,
  `module.exports = {
  getCreditAccounts,
  getCreditAccountById,
  createCreditCollection,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: creditAccount.controller.js patched for collection posting.");
