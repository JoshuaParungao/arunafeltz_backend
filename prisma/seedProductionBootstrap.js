require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

const seedProduction = async () => {
  console.log("Starting Production Database Bootstrap...");

  // 1. Seed Default Branches
  console.log("1. Seeding Branches...");
  const mainBranch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: { name: "Main Branch", status: "ACTIVE" },
    create: { code: "MAIN", name: "Main Branch", status: "ACTIVE" },
  });
  console.log(`- Branch MAIN: ${mainBranch.id}`);

  const mabBranch = await prisma.branch.upsert({
    where: { code: "MAB" },
    update: { name: "Mabalacat Branch", status: "ACTIVE" },
    create: { code: "MAB", name: "Mabalacat Branch", status: "ACTIVE" },
  });
  console.log(`- Branch MAB: ${mabBranch.id}`);

  // 2. Seed Default Super Owner & Admin
  console.log("2. Seeding Super Owner & Admin Users...");
  const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const superOwner = await prisma.user.upsert({
    where: { username: "superowner" },
    update: {
      role: "SUPER_OWNER",
      status: "ACTIVE",
      passwordHash,
    },
    create: {
      username: "superowner",
      firstName: "Super",
      lastName: "Owner",
      fullName: "Super Owner",
      employeeCode: "EMP-0001",
      role: "SUPER_OWNER",
      status: "ACTIVE",
      passwordHash,
    },
  });
  console.log(`- User superowner: ${superOwner.id}`);

  const mainAdmin = await prisma.user.upsert({
    where: { username: "mainadmin" },
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      branchId: mainBranch.id,
      passwordHash,
    },
    create: {
      username: "mainadmin",
      email: "mainadmin@arunafeltz.local",
      firstName: "Main",
      lastName: "Admin",
      fullName: "Main Branch Admin",
      employeeCode: "EMP-0002",
      role: "ADMIN",
      status: "ACTIVE",
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  console.log(`- User mainadmin: ${mainAdmin.id}`);

  console.log("3. Seeding Default Business Settings...");
  const { execSync } = require("child_process");
  const seeds = [
    "prisma/seedBusinessSettings.js",
    "prisma/seedDocumentNumbering.js",
    "prisma/seedPaymentSettings.js",
    "prisma/seedPriceTierLabels.js",
    "prisma/seedDiscountRules.js",
    "prisma/seedServiceRules.js",
    "prisma/seedIncentiveRules.js",
    "prisma/seedInventoryRules.js",
    "prisma/seedItemCatalog.js",
    "prisma/seedCustomers.js",
    "phase10-module2-seed-default-cash-boxes.js",
  ];

  for (const s of seeds) {
    try {
      execSync(`node ${s}`, { stdio: "inherit" });
    } catch (e) {
      console.warn(`Seed note (${s}):`, e.message);
    }
  }

  console.log("Production Bootstrap Completed Successfully! 🎉");
};

seedProduction()
  .catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
