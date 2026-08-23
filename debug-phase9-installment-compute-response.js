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

const main = async () => {
  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: "mainadmin",
      password: "Password123!",
    }),
  });

  const token = login.body.data.token;

  const compute = await request("/settings/business-rules/installment/test-compute", {
    method: "POST",
    token,
    body: JSON.stringify({
      cashPromoTotalAmount: 10000,
      cashDownpayment: 2000,
      term: "MONTH_12",
    }),
  });

  console.log("STATUS:", compute.status);
  console.log("BODY:");
  console.dir(compute.body, { depth: null });
};

main().catch(console.error);
