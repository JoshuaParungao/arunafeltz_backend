const fs = require("fs");

const schemaPath = "prisma/schema.prisma";

if (!fs.existsSync(schemaPath)) {
  console.error("schema.prisma not found");
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const lines = schema.split(/\r?\n/);

const startIndex = lines.findIndex((line) => line.trim().startsWith("model AuditLog"));

if (startIndex === -1) {
  console.log("AuditLog model not found");
  process.exit(0);
}

let braceDepth = 0;
let started = false;

console.log("\nAUDITLOG MODEL INSPECT");
console.log("======================");

for (let i = startIndex; i < lines.length; i++) {
  const line = lines[i];

  if (line.includes("{")) {
    braceDepth++;
    started = true;
  }

  console.log(`${i + 1}: ${line}`);

  if (line.includes("}")) {
    braceDepth--;
  }

  if (started && braceDepth === 0) {
    break;
  }
}
