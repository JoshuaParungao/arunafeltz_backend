const assert = require("node:assert/strict");

require("dotenv").config();

const prisma = require("./src/config/prisma");
const serviceJobService = require(
  "./src/modules/service-jobs/services/serviceJob.service"
);

const ROLLBACK_SENTINEL = "ROLLBACK_CODEX_SERVICE_JOB_TRANSACTION_FIXTURES";

const run = async () => {
  const marker = `CODEX-JO-TX-${Date.now()}`;
  let assertionCount = 0;
  const check = (condition, message) => {
    assert.ok(condition, message);
    assertionCount += 1;
  };
  const expectCode = async (operation, code) => {
    await assert.rejects(operation, (error) => error?.message === code);
    assertionCount += 1;
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        const senior = await tx.user.findFirst({
          where: {
            role: "TECHNICIAN",
            status: "ACTIVE",
            incentiveClassification: "SENIOR_TECHNICIAN",
            branchId: { not: null },
          },
          select: {
            id: true,
            branchId: true,
            role: true,
            incentiveClassification: true,
          },
        });
        check(Boolean(senior?.branchId), "An active senior technician fixture is required");

        const admin = await tx.user.findFirst({
          where: {
            branchId: senior.branchId,
            role: { in: ["ADMIN", "BRANCH_OWNER"] },
            status: "ACTIVE",
          },
          select: {
            id: true,
            branchId: true,
            role: true,
            incentiveClassification: true,
          },
        });
        check(Boolean(admin), "A same-branch active admin fixture is required");

        const otherBranchActor = await tx.user.findFirst({
          where: {
            branchId: { not: senior.branchId },
            role: { in: ["ADMIN", "BRANCH_OWNER"] },
            status: "ACTIVE",
          },
          select: {
            id: true,
            branchId: true,
            role: true,
            incentiveClassification: true,
          },
        });
        check(Boolean(otherBranchActor), "A second-branch actor fixture is required");

        const regularTechnician = await tx.user.create({
          data: {
            username: `${marker.toLowerCase()}-tech`,
            passwordHash: "ROLLBACK_ONLY_NOT_A_LOGIN_SECRET",
            firstName: "Rollback",
            lastName: "Technician",
            fullName: "Rollback Technician",
            role: "TECHNICIAN",
            status: "ACTIVE",
            incentiveClassification: "TECHNICIAN",
            branchId: senior.branchId,
            approvedById: admin.id,
            approvedAt: new Date(),
          },
          select: {
            id: true,
            branchId: true,
            role: true,
            incentiveClassification: true,
          },
        });

        const effectiveFrom = new Date(Date.now() - 2_000);
        const rule = await tx.incentiveProgramRuleVersion.create({
          data: {
            branchId: senior.branchId,
            programType: "ORDINARY_REPAIR",
            effectiveFrom,
            eligiblePriceTiers: [],
            repairCostPercent: "65.0000",
            notes: marker,
            createdById: admin.id,
          },
        });
        const accountConfig = await tx.incentiveAccountConfigVersion.create({
          data: {
            accountId: senior.id,
            effectiveFrom: new Date(effectiveFrom.getTime() + 1),
            classificationSnapshot: "SENIOR_TECHNICIAN",
            ordinaryRepairEnabled: true,
            ordinaryRepairRatePercent: "10.0000",
            boardRepairEnabled: false,
            repairFee: "500.00",
            notes: marker,
            createdById: admin.id,
          },
        });

        const transactionClient = {
          $transaction: async (operation) => operation(tx),
        };

        const job = await serviceJobService.createServiceJob(
          admin,
          {
            jobTitle: `${marker} repaired`,
            repairType: "ORDINARY_REPAIR",
            assignedTechnicianId: regularTechnician.id,
            baseServiceCharge: 5000,
            markupPercent: 20,
          },
          transactionClient
        );
        check(job.assignedTechnicianId === regularTechnician.id, "Assignment is stored");
        check(job.serviceDoneById === null, "Assigned Technician is not copied to Service Done By");
        check(Number(job.baseServiceCharge) === 5000, "Base service price is stored");
        check(Number(job.finalServiceCharge) === 6250, "Final price uses base/(1-rate)");

        await serviceJobService.updateServiceJobStatus(
          admin,
          job.id,
          { status: "IN_PROGRESS", repairType: "ORDINARY_REPAIR" },
          transactionClient
        );
        await expectCode(
          () =>
            serviceJobService.updateServiceJobStatus(
              admin,
              job.id,
              { status: "READY_FOR_RELEASE", baseServiceCharge: 5000, markupPercent: 20 },
              transactionClient
            ),
          "SERVICE_DONE_BY_REQUIRED"
        );

        const ready = await serviceJobService.updateServiceJobStatus(
          admin,
          job.id,
          {
            status: "READY_FOR_RELEASE",
            serviceDoneById: senior.id,
            baseServiceCharge: 5000,
            markupPercent: 20,
          },
          transactionClient
        );
        check(ready.status === "READY_FOR_RELEASE", "Job reaches READY_FOR_RELEASE");
        check(ready.serviceDoneById === senior.id, "Actual performer is explicit");
        check(ready.assignedTechnicianId !== ready.serviceDoneById, "Assignment and performer remain distinct");

        await expectCode(
          () =>
            serviceJobService.updateServiceJobStatus(
              admin,
              job.id,
              { status: "COMPLETED", serviceDoneById: senior.id },
              transactionClient
            ),
          "SERVICE_JOB_COMPLETION_REQUIRES_RELEASE"
        );
        await expectCode(
          () =>
            serviceJobService.updateServiceJobStatus(
              otherBranchActor,
              job.id,
              { status: "CANCELLED", cancellationReason: "Cross-branch attempt" },
              transactionClient
            ),
          "SERVICE_JOB_NOT_FOUND"
        );

        const completed = await serviceJobService.releaseServiceJob(
          admin,
          job.id,
          {
            releaseOutcome: "SERVICE_COMPLETED",
            serviceDoneById: senior.id,
            baseServiceCharge: 5000,
            markupPercent: 20,
          },
          transactionClient
        );
        check(completed.status === "COMPLETED", "Release completes the JO");
        check(completed.releasedById === admin.id, "Released By is the release actor");
        check(completed.serviceDoneById === senior.id, "Performer survives completion");
        check(completed.programRuleVersionId === rule.id, "Effective rule version is snapshotted");
        check(completed.accountConfigVersionId === accountConfig.id, "Effective account version is snapshotted");
        check(Number(completed.repairCostPoolAmountSnapshot) === 3250, "Repair pool uses base only");
        check(Number(completed.companyShareAmountSnapshot) === 1750, "Company share uses base only");
        check(Number(completed.serviceMarkupAmount) === 1250, "Markup remains outside the split");
        check(Number(completed.repairFeeSnapshot) === 500, "Per-account repair fee is snapshotted");
        check(Number(completed.repairIncentiveAmountSnapshot) === 500, "Repair incentive uses base only");
        check(Number(completed.unallocatedRepairCostPoolSnapshot) === 2250, "Unallocated balance reconciles exactly");

        await expectCode(
          () =>
            serviceJobService.releaseServiceJob(
              admin,
              job.id,
              {
                releaseOutcome: "SERVICE_COMPLETED",
                serviceDoneById: senior.id,
                baseServiceCharge: 5000,
                markupPercent: 20,
              },
              transactionClient
            ),
          "SERVICE_JOB_ALREADY_RELEASED"
        );

        await tx.incentiveProgramRuleVersion.create({
          data: {
            branchId: senior.branchId,
            programType: "ORDINARY_REPAIR",
            effectiveFrom: new Date(Date.now() + 2_000),
            eligiblePriceTiers: [],
            repairCostPercent: "40.0000",
            notes: `${marker}-later-rule`,
            createdById: admin.id,
          },
        });
        const persisted = await tx.serviceJob.findUnique({ where: { id: job.id } });
        check(Number(persisted.repairCostPercentSnapshot) === 65, "Later settings do not rewrite snapshots");

        const boardJob = await serviceJobService.createServiceJob(
          admin,
          {
            jobTitle: `${marker} board`,
            repairType: "BOARD_LEVEL_REPAIR",
            assignedTechnicianId: senior.id,
            baseServiceCharge: 1000,
            markupPercent: 0,
          },
          transactionClient
        );
        await expectCode(
          () =>
            serviceJobService.updateServiceJobStatus(
              regularTechnician,
              boardJob.id,
              { status: "IN_PROGRESS", repairType: "BOARD_LEVEL_REPAIR" },
              transactionClient
            ),
          "BOARD_LEVEL_REQUIRES_SENIOR_TECHNICIAN"
        );

        const diagnosticJob = await serviceJobService.createServiceJob(
          admin,
          {
            jobTitle: `${marker} diagnostic`,
            repairType: "ORDINARY_REPAIR",
            baseServiceCharge: 350,
            markupPercent: 0,
          },
          transactionClient
        );
        const diagnosticRelease = await serviceJobService.releaseServiceJob(
          admin,
          diagnosticJob.id,
          {
            releaseOutcome: "DECLINED",
            baseServiceCharge: 350,
            markupPercent: 0,
          },
          transactionClient
        );
        check(Number(diagnosticRelease.finalServiceCharge) === 350, "Declined work may retain a diagnostic charge");
        check(diagnosticRelease.financialSnapshotAt === null, "Diagnostic charge creates no repair split snapshot");
        check(diagnosticRelease.paymentState === "UNPAID", "Diagnostic charge remains collectible");

        const noChargeJob = await serviceJobService.createServiceJob(
          admin,
          {
            jobTitle: `${marker} no charge`,
            repairType: "ORDINARY_REPAIR",
            baseServiceCharge: 0,
            markupPercent: 0,
          },
          transactionClient
        );
        const noChargeRelease = await serviceJobService.releaseServiceJob(
          admin,
          noChargeJob.id,
          {
            releaseOutcome: "UNREPAIRED",
            baseServiceCharge: 0,
            markupPercent: 0,
          },
          transactionClient
        );
        check(noChargeRelease.paymentState === "NO_CHARGE", "Zero-charge unrepaired work remains NO_CHARGE");
        check(noChargeRelease.financialSnapshotAt === null, "No-charge work creates no financial snapshot");

        const incentiveCount = await tx.incentive.count({
          where: { serviceJobId: { in: [job.id, diagnosticJob.id, noChargeJob.id] } },
        });
        check(incentiveCount === 0, "Legacy assigned-tech/final-price incentive posting stays disabled");

        throw new Error(ROLLBACK_SENTINEL);
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    if (error?.message !== ROLLBACK_SENTINEL) {
      throw error;
    }
  }

  const [jobCount, userCount, ruleCount, auditCount] = await Promise.all([
    prisma.serviceJob.count({ where: { jobTitle: { startsWith: marker } } }),
    prisma.user.count({ where: { username: `${marker.toLowerCase()}-tech` } }),
    prisma.incentiveProgramRuleVersion.count({ where: { notes: { startsWith: marker } } }),
    prisma.auditLog.count({ where: { description: { contains: marker } } }),
  ]);
  check(jobCount === 0, "Rollback removed all service-job fixtures");
  check(userCount === 0, "Rollback removed the temporary technician");
  check(ruleCount === 0, "Rollback removed temporary rule versions");
  check(auditCount === 0, "Rollback removed temporary audit records");

  console.log(
    `Service-job transaction regression: ${assertionCount} assertions passed; all fixtures rolled back.`
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
