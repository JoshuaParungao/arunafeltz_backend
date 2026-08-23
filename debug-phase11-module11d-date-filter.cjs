require("dotenv").config();

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

  const token = login.body?.data?.token;

  if (!token) {
    console.log("LOGIN FAILED");
    console.dir(login, { depth: null });
    return;
  }

  const result = await request(
    "/service-jobs?dateFrom=2020-01-01&dateTo=2099-12-31",
    {
      method: "GET",
      token,
    }
  );

  console.log("STATUS:", result.status);
  console.dir(result.body, { depth: null });
};

main().catch((error) => {
  console.error(error);
});
