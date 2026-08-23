const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");
const lines = schema.split(/\r?\n/);

const keywords = ["Warranty", "warranty", "DR", "DeliveryReceipt", "Return", "Refund"];

for (const keyword of keywords) {
  console.log("\n==================================================");
  console.log("Keyword:", keyword);
  console.log("==================================================");

  let found = false;

  lines.forEach((line, index) => {
    if (line.includes(keyword)) {
      found = true;

      const start = Math.max(0, index - 3);
      const end = Math.min(lines.length - 1, index + 3);

      console.log(`\n--- Around line ${index + 1} ---`);

      for (let i = start; i <= end; i += 1) {
        console.log(`${String(i + 1).padStart(4, " ")}: ${lines[i]}`);
      }
    }
  });

  if (!found) {
    console.log("No matches.");
  }
}
