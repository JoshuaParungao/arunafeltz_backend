const BASE_URL = "http://localhost:5000/api";

const main = async () => {
  const response = await fetch(`${BASE_URL}/settings/installment-basis`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  const body = await response.json().catch(() => null);

  console.log("STATUS:", response.status);
  console.log("BODY:");
  console.dir(body, { depth: null });
};

main().catch(console.error);
