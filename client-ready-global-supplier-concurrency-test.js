require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body
        ? { body: JSON.stringify(options.body) }
        : {}),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  try {
    const login = await request("/auth/login", {
      method: "POST",
      body: { identifier: "superowner", password: "Password123!" },
    });
    const token = login.body?.data?.token;

    if (login.status !== 200 || !token) {
      throw new Error("Super Owner login failed");
    }

    const code = `QA-GLOBAL-${Date.now().toString(36).toUpperCase()}`;
    const body = {
      supplierCode: code,
      name: `QA Global Supplier ${code}`,
      notes: "Retained global supplier concurrency verification",
    };
    const results = await Promise.all([
      request("/suppliers", { method: "POST", token, body }),
      request("/suppliers", { method: "POST", token, body }),
    ]);
    const statuses = results
      .map((result) => result.status)
      .sort((left, right) => left - right);
    const supplier = results.find((result) => result.status === 201)?.body?.data;
    const count = await prisma.supplier.count({
      where: { branchId: null, supplierCode: code },
    });
    const deactivation = supplier
      ? await request(`/suppliers/${supplier.id}/status`, {
          method: "PATCH",
          token,
          body: { status: "INACTIVE" },
        })
      : null;
    const passed =
      JSON.stringify(statuses) === JSON.stringify([201, 409]) &&
      count === 1 &&
      deactivation?.status === 200;

    console.log(
      JSON.stringify(
        {
          passed,
          assertions: passed ? "3/3" : "failed",
          concurrentStatuses: statuses,
          retainedSupplierId: supplier?.id,
          retainedSupplierCode: code,
          retainedStatus: deactivation?.body?.data?.status,
          exactRecordCount: count,
        },
        null,
        2
      )
    );

    if (!passed) {
      console.dir(results, { depth: null });
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
