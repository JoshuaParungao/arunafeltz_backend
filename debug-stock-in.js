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
  console.log("\nDebug Stock-In");
  console.log("--------------");

  const token = await login();

  const overview = await request("/inventory/overview?search=Ryzen", {
    token,
  });

  console.log("\nOVERVIEW STATUS:", overview.status);
  console.dir(overview.body, { depth: null });

  const ryzenItem = overview.body?.data?.data?.find((item) =>
    item.itemName.includes("Ryzen")
  );

  if (!ryzenItem) {
    throw new Error("Ryzen item not found");
  }

  console.log("\nRYZEN ITEM:");
  console.dir(ryzenItem, { depth: null });

  const payload = {
    itemId: ryzenItem.id,
    batchCode: "BATCH-MAIN-MODULE4-STOCKIN-DEBUG-001",
    quantity: 1,
    referenceNo: "MODULE4-STOCKIN-DEBUG-001",
    remarks: "Debug stock-in request.",
    serialNumbers: ["SN-MODULE4-RYZEN-DEBUG-001"],
  };

  console.log("\nSTOCK-IN PAYLOAD:");
  console.dir(payload, { depth: null });

  const stockIn = await request("/inventory/stock-in", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  console.log("\nSTOCK-IN STATUS:", stockIn.status);
  console.dir(stockIn.body, { depth: null });
};

main().catch((error) => {
  console.error("\nDEBUG STOCK-IN FAILED");
  console.error(error);
  process.exitCode = 1;
});
