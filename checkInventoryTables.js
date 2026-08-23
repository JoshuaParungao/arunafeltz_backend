require("dotenv").config();

const { Client } = require("pg");

const main = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('InventoryBatch', 'InventoryMovement', 'ItemSerial')
    ORDER BY table_name;
  `);

  console.table(result.rows);

  await client.end();
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
