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

const login = async (identifier) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      password: "Password123!",
    }),
  });

  console.log(`LOGIN ${identifier} STATUS:`, result.status);
  console.dir(result.body, { depth: null });

  if (!result.body?.success || !result.body?.data?.token) {
    throw new Error(`${identifier} login failed`);
  }

  return result.body.data.token;
};

const main = async () => {
  console.log("\nDebug Super Owner Create Quotation");
  console.log("----------------------------------");

  const superToken = await login("superowner");
  const adminToken = await login("mainadmin");

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminToken,
  });

  console.log("\nOVERVIEW STATUS:", overview.status);

  const item = overview.body?.data?.data?.find((row) =>
    row.itemName.includes("Ryzen")
  );

  if (!item) {
    throw new Error("Ryzen item not found");
  }

  console.log("\nITEM USED:");
  console.dir(item, { depth: null });

  const payload = {
    branchId: item.branch.id,
    title: "Debug Super Owner Quotation",
    items: [
      {
        itemId: item.id,
        priceTier: 2,
        quantity: 1,
        discountAmount: 0,
      },
    ],
  };

  console.log("\nSUPER QUOTATION PAYLOAD:");
  console.dir(payload, { depth: null });

  const quotation = await request("/quotations", {
    method: "POST",
    token: superToken,
    body: JSON.stringify(payload),
  });

  console.log("\nSUPER QUOTATION STATUS:", quotation.status);
  console.dir(quotation.body, { depth: null });
};

main().catch((error) => {
  console.error("\nDEBUG SUPER OWNER QUOTATION FAILED");
  console.error(error);
  process.exitCode = 1;
});
