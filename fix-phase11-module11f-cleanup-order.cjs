const fs = require("fs");

const files = [
  "./phase11-module11b-create-service-job-test.js",
  "./phase11-module11c-update-service-job-status-test.js",
  "./phase11-module11d-list-view-service-jobs-test.js",
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");

  const oldBlock = `  await prisma.serviceJob.deleteMany({
    where: {
      branchId,
    },
  });`;

  const newBlock = `  await prisma.servicePayment.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashTransaction.deleteMany({
    where: {
      branchId,
      source: "SERVICE_JOB",
    },
  });

  await prisma.serviceJob.deleteMany({
    where: {
      branchId,
    },
  });`;

  if (content.includes("await prisma.servicePayment.deleteMany")) {
    console.log("SKIP: already patched " + file);
    continue;
  }

  if (!content.includes(oldBlock)) {
    console.log("SKIP: cleanup block not found in " + file);
    continue;
  }

  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(file, content);

  console.log("DONE: patched cleanup order in " + file);
}
