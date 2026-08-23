const fs = require("fs");

const servicePath = "./src/modules/service-jobs/services/serviceJob.service.js";
let service = fs.readFileSync(servicePath, "utf8");

const oldBlock = `  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      where.receivedAt.gte = query.dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }`;

const newBlock = `  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      dateFrom.setHours(0, 0, 0, 0);
      where.receivedAt.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }`;

if (!service.includes(oldBlock)) {
  throw new Error("Date filter block not found. Stop and inspect serviceJob.service.js manually.");
}

service = service.replace(oldBlock, newBlock);

fs.writeFileSync(servicePath, service);

console.log("DONE: Phase 11 Module 11D date filter fixed.");
