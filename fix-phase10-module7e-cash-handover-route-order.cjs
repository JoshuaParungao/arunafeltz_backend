const fs = require("fs");

const routePath = "./src/modules/cash-boxes/routes/cashBox.routes.js";

let route = fs.readFileSync(routePath, "utf8");

const requiredSnippets = [
  'router.get(\\n  "/handovers"',
  'router.get(\\n  "/handovers/:handoverId"',
  'router.post(\\n  "/handovers/:handoverId/cancel"',
  'router.post(\\n  "/handovers/:handoverId/receive"',
  'router.get("/:id"',
];

for (const snippet of requiredSnippets) {
  if (!route.includes(snippet.replaceAll("\\n", "\n"))) {
    throw new Error(`Missing expected route snippet: ${snippet}`);
  }
}

const handoverRoutes = `router.get(
  "/handovers",
  validate(listCashHandoversSchema),
  cashBoxController.getCashHandovers
);

router.get(
  "/handovers/:handoverId",
  validate(cashHandoverIdParamSchema),
  cashBoxController.getCashHandoverById
);

router.post(
  "/handovers/:handoverId/cancel",
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);

router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);

`;

route = route.replace(handoverRoutes, "");

const insertBefore = `router.get("/:id", validate(cashBoxIdParamSchema), cashBoxController.getCashBoxById);`;

if (!route.includes(insertBefore)) {
  throw new Error("Cannot find router.get('/:id') marker.");
}

route = route.replace(insertBefore, handoverRoutes + insertBefore);

fs.writeFileSync(routePath, route);

console.log("DONE: Cash handover routes moved above /:id routes.");
