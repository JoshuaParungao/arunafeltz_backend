const BASE_URL = "http://localhost:5000/api";

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const login = async () => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: "mainadmin",
      password: "Password123!",
    }),
  });

  console.log("LOGIN STATUS:", result.status);
  console.dir(result.body, { depth: null });

  if (!result.body?.success || !result.body?.data?.token) {
    throw new Error("Admin login failed");
  }

  return result.body.data.token;
};

const main = async () => {
  console.log("\nDebug Create Quotation");
  console.log("----------------------");

  const token = await login();

  const overview = await request("/inventory/overview?search=Ryzen", {
    token,
  });

  console.log("\nOVERVIEW STATUS:", overview.status);
  console.dir(overview.body, { depth: null });

  const item = overview.body?.data?.data?.find((row) =>
    row.itemName.includes("Ryzen")
  );

  if (!item) {
    throw new Error("Ryzen item not found");
  }

  console.log("\nITEM USED:");
  console.dir(item, { depth: null });

  const payload = {
    title: "Debug Admin Quotation",
    notes: "Debug quotation.",
    internalNotes: "Debug internal note.",
    isPcBuild: true,
    items: [
      {
        itemId: item.id,
        priceTier: 1,
        quantity: 2,
        discountAmount: 100,
        isPcBuildPart: true,
        remarks: "Processor line.",
      },
      {
        description: "Custom assembly labor",
        priceTier: 1,
        quantity: 1,
        unitPrice: 500,
        discountAmount: 0,
        isPcBuildPart: false,
        remarks: "Custom non-inventory line.",
      },
    ],
  };

  console.log("\nQUOTATION PAYLOAD:");
  console.dir(payload, { depth: null });

  const quotation = await request("/quotations", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  console.log("\nQUOTATION STATUS:", quotation.status);
  console.dir(quotation.body, { depth: null });
};

main().catch((error) => {
  console.error("\nDEBUG CREATE QUOTATION FAILED");
  console.error(error);
  process.exitCode = 1;
});
