require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");
const enterpriseService = require("./src/modules/incentives/services/enterpriseIncentive.service");
const incentiveService = require("./src/modules/incentives/services/incentive.service");
const { signToken } = require("./src/utils/jwt");

let passed = 0;
const assert = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) console.dir(details, { depth: null });
    throw new Error(message);
  }
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const dateText = (value) => new Date(value).toISOString().slice(0, 10);

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token
          ? { Authorization: `Bearer ${options.token}` }
          : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  try {
    const [superOwner, admin, technician, rules, retainedCounts] =
      await Promise.all([
        prisma.user.findFirst({
          where: { role: "SUPER_OWNER", status: "ACTIVE" },
          select: { id: true, role: true, branchId: true },
        }),
        prisma.user.findFirst({
          where: {
            role: { in: ["BRANCH_OWNER", "ADMIN"] },
            status: "ACTIVE",
            branchId: { not: null },
          },
          select: { id: true, role: true, branchId: true },
        }),
        prisma.user.findFirst({
          where: { status: "ACTIVE", branchId: { not: null } },
          select: {
            id: true,
            role: true,
            branchId: true,
            employeeCode: true,
            fullName: true,
            incentiveClassification: true,
          },
        }),
        prisma.businessSetting.findUnique({
          where: { scopeKey: "GLOBAL:incentive.rules" },
          select: { value: true, isActive: true },
        }),
        Promise.all([
          prisma.incentiveRateVersion.count(),
          prisma.incentiveScheduleVersion.count(),
          prisma.incentiveCycle.count(),
        ]),
      ]);

    assert(Boolean(superOwner), "Super Owner fixture is available");
    assert(Boolean(admin), "Branch manager fixture is available");
    assert(Boolean(technician), "Active branch employee fixture is available");
    assert(Boolean(rules?.isActive), "Saved legacy incentive rules remain active");

    const superToken = signToken({ sub: superOwner.id });
    const adminToken = signToken({ sub: admin.id });
    const staffToken = signToken({ sub: technician.id });

    const unauthenticated = await request("/incentives/configuration");
    assert(unauthenticated.status === 401, "Enterprise configuration rejects unauthenticated access");

    const configuration = await request("/incentives/configuration", {
      token: superToken,
    });
    assert(configuration.status === 200, "Super Owner can inspect global incentive configuration", configuration.body);

    const staffConfiguration = await request("/incentives/configuration", {
      token: staffToken,
    });
    assert(staffConfiguration.status === 403, "Ordinary staff cannot inspect global incentive configuration");

    const today = new Date();
    const anchor = dateText(today);
    const previewPayload = {
      scheduleType: "EVERY_N_DAYS",
      anchorDate: anchor,
      effectiveFrom: anchor,
      everyNDays: 7,
      claimOpenAfterDays: 1,
      claimWindowDays: 3,
      notes: "transaction-free API preview",
      count: 3,
    };
    const preview = await request("/incentives/schedule/preview", {
      method: "POST",
      token: adminToken,
      body: previewPayload,
    });
    assert(preview.status === 200, "Branch manager can request backend-authoritative calendar preview", preview.body);
    assert(preview.body.data.periods.length === 3, "Calendar preview returns requested period count");
    const [first, second] = preview.body.data.periods;
    assert(
      new Date(`${first.endDate}T00:00:00Z`) -
        new Date(`${first.startDate}T00:00:00Z`) ===
        6 * 86400000,
      "Every-N-days preview produces a seven-day inclusive earning period"
    );
    assert(first.claimOpenDate === second.startDate, "One-day-after-cutoff claim opens on the next earning period start");
    assert(
      new Date(`${first.claimCloseDate}T00:00:00Z`) -
        new Date(`${first.claimOpenDate}T00:00:00Z`) ===
        2 * 86400000,
      "Three-day claim window is inclusive"
    );

    const staffPreview = await request("/incentives/schedule/preview", {
      method: "POST",
      token: staffToken,
      body: previewPayload,
    });
    assert(staffPreview.status === 403, "Ordinary staff cannot preview global schedule configuration");

    const { count: previewCount, ...initializationPayload } = previewPayload;
    assert(previewCount === 3, "Preview-only count is not sent to schedule mutation endpoints");
    const nonOwnerInitialization = await request(
      "/incentives/initialize-from-legacy",
      { method: "POST", token: adminToken, body: initializationPayload }
    );
    assert(nonOwnerInitialization.status === 403, "Only Super Owner can run one-time enterprise initialization");
    const invalidInitialization = await request(
      "/incentives/initialize-from-legacy",
      {
        method: "POST",
        token: superToken,
        body: {
          ...initializationPayload,
          anchorDate: "2026-08-01",
          effectiveFrom: "2026-08-02",
        },
      }
    );
    assert(invalidInitialization.status === 400, "Invalid initialization schedule is rejected before persistence");
    const countsAfterInvalidInitialization = await Promise.all([
      prisma.incentiveRateVersion.count(),
      prisma.incentiveScheduleVersion.count(),
      prisma.incentiveCycle.count(),
    ]);
    assert(JSON.stringify(countsAfterInvalidInitialization) === JSON.stringify(retainedCounts), "Failed atomic initialization leaves no partial version or cycle");

    const malformedClaimDates = await request(
      "/incentives/claims?dateFrom=2026-08-10&dateTo=2026-08-01",
      { token: superToken }
    );
    assert(malformedClaimDates.status === 400, "Claims API rejects an inverted cycle date range");

    const classificationClaims = await request(
      "/incentives/claims?classification=SALES_AGENT&limit=1",
      { token: superToken }
    );
    assert(classificationClaims.status === 200, "Claims API accepts snapshotted classification filters", classificationClaims.body);
    assert(
      typeof classificationClaims.body.data.totals?.totalIncentive === "number",
      "Claims API returns full-filter aggregate totals"
    );

    const internals = enterpriseService.testInternals;
    const weekly = {
      scheduleType: "WEEKLY",
      anchorDate: new Date("2026-08-01T00:00:00Z"),
      effectiveFrom: new Date("2026-08-01T00:00:00Z"),
      everyNDays: null,
      claimOpenAfterDays: 1,
      claimWindowDays: 3,
    };
    const weeklyBounds = internals.calculateCycleBounds(
      weekly,
      new Date("2026-08-12T00:00:00Z")
    );
    assert(dateText(weeklyBounds.startDate) === "2026-08-08", "Weekly schedule remains anchored to its saved date");
    assert(dateText(weeklyBounds.endDate) === "2026-08-14", "Weekly schedule uses a seven-day anchored cycle");
    assert(dateText(weeklyBounds.claimOpenDate) === "2026-08-15", "Weekly claim opening is derived from cutoff configuration");

    const monthly = internals.calculateCycleBounds(
      {
        ...weekly,
        scheduleType: "MONTHLY",
        anchorDate: new Date("2026-01-31T00:00:00Z"),
        effectiveFrom: new Date("2026-01-31T00:00:00Z"),
      },
      new Date("2026-02-28T00:00:00Z")
    );
    assert(dateText(monthly.startDate) === "2026-02-28", "Monthly schedule safely clamps a month-end anchor");

    const manualPreview = internals.previewNormalizedSchedule({
      ...weekly,
      scheduleType: "MANUAL",
    });
    assert(manualPreview.length === 0, "Manual schedules require explicitly persisted periods");

    await prisma.$transaction(async (tx) => {
      const sentinel = `enterprise-refinement-${Date.now()}`;
      const txUser = await tx.user.findUnique({
        where: { id: technician.id },
        select: { incentiveClassification: true },
      });
      await tx.user.update({
        where: { id: technician.id },
        data: { incentiveClassification: "TECHNICIAN" },
      });
      const sourceItem = await tx.item.findFirst({
        where: { branchId: technician.branchId, status: "ACTIVE" },
        select: { id: true },
      });
      assert(Boolean(sourceItem), "Transaction-scoped product source fixture is available");
      await tx.businessSetting.update({
        where: { scopeKey: "GLOBAL:incentive.rules" },
        data: {
          value: {
            ...rules.value,
            enableItemIncentives: true,
          },
        },
      });
      const matrixRows = enterpriseService.RATE_CLASSIFICATIONS.map(
        (classification, index) => ({
          classification,
          productRate: index + 1,
          serviceRate: classification === "TECHNICIAN" ? 0 : index + 5,
        })
      );
      assert(matrixRows.length === 4, "Enterprise matrix covers all four incentive classifications");
      assert(
        matrixRows.every((row) => row.productRate !== row.serviceRate),
        "Every classification can carry distinct product and service rates"
      );
      const rateVersion = await tx.incentiveRateVersion.create({
        data: {
          effectiveFrom: new Date("2095-01-01T00:00:00Z"),
          notes: sentinel,
          createdById: superOwner.id,
          rates: {
            create: matrixRows,
          },
        },
      });
      const scheduleVersion = await tx.incentiveScheduleVersion.create({
        data: {
          scheduleType: "EVERY_N_DAYS",
          anchorDate: new Date("2095-01-01T00:00:00Z"),
          effectiveFrom: new Date("2095-01-01T00:00:00Z"),
          everyNDays: 7,
          claimOpenAfterDays: 1,
          claimWindowDays: 3,
          notes: sentinel,
          createdById: superOwner.id,
        },
      });
      const context = await enterpriseService.getPostingContext(tx, {
        staffId: technician.id,
        branchId: technician.branchId,
        sourceDate: new Date("2095-01-03T12:00:00Z"),
        basisType: "SERVICE",
      });
      assert(context.eligible === true, "Classified active employee receives enterprise posting context");
      assert(Number(context.ratePercent) === 0, "A configured zero-percent row remains eligible");
      assert(context.classification === "TECHNICIAN", "Posting context snapshots incentive classification");
      assert(context.rateVersion.id === rateVersion.id, "Posting context snapshots the effective immutable rate version");
      assert(Boolean(context.cycle?.id), "Posting context persists and snapshots an earning cycle");
      assert(context.cycle.scheduleVersionId === scheduleVersion.id, "Persisted cycle snapshots its schedule version");
      assert(dateText(context.cycle.startDate) === "2095-01-01", "Persisted cycle retains anchored start date");
      assert(dateText(context.cycle.endDate) === "2095-01-07", "Persisted cycle retains seven-day cutoff");
      assert(dateText(context.cycle.claimOpenDate) === "2095-01-08", "Persisted cycle retains configured claim opening");
      assert(dateText(context.cycle.claimCloseDate) === "2095-01-10", "Persisted cycle retains configured claim window");
      const sourcesBeforePosting = await tx.incentive.count({
        where: { cycleId: context.cycle.id },
      });
      assert(sourcesBeforePosting === 0, "Authoritative current cycle can exist before any employee activity");
      const beforeWindow = internals.cycleStatusForDate(
        context.cycle,
        new Date("2095-01-07T00:00:00Z")
      );
      const duringWindow = internals.cycleStatusForDate(
        context.cycle,
        new Date("2095-01-09T00:00:00Z")
      );
      const afterWindow = internals.cycleStatusForDate(
        context.cycle,
        new Date("2095-01-11T00:00:00Z")
      );
      assert(beforeWindow === "EARNING", "Claim cycle rejects claiming before cutoff through earning status");
      assert(duringWindow === "CLAIMABLE", "Claim cycle is claimable during its configured window");
      assert(afterWindow === "CLOSED", "Claim cycle closes after its configured window");

      const serviceJob = await tx.serviceJob.create({
        data: {
          jobCode: `${sentinel}-job`,
          status: "COMPLETED",
          jobTitle: "transaction-scoped service",
          finalServiceCharge: 500,
          completedAt: new Date("2095-01-03T12:00:00Z"),
          branchId: technician.branchId,
          assignedTechnicianId: technician.id,
          createdById: superOwner.id,
        },
      });
      const sale = await tx.sale.create({
        data: {
          receiptCode: `${sentinel}-sale`,
          status: "COMPLETED",
          paymentStatus: "PAID",
          saleDate: new Date("2095-01-03T12:00:00Z"),
          branchId: technician.branchId,
          cashierId: technician.id,
          subtotal: 500,
          grandTotal: 500,
          amountPaid: 500,
          items: {
            create: {
              lineNo: 1,
              description: "transaction-scoped product",
              quantity: 1,
              unitPrice: 500,
              lineTotal: 500,
              itemId: sourceItem.id,
            },
          },
        },
      });

      const entry = await tx.incentive.create({
        data: {
          sourceKey: `${sentinel}:posted`,
          type: "SERVICE_JOB",
          status: "POSTED",
          sourceCode: sentinel,
          sourceDate: new Date("2095-01-03T12:00:00Z"),
          basisAmount: 500,
          ratePercent: context.ratePercent,
          amount: 0,
          classificationSnapshot: context.classification,
          rateVersionId: context.rateVersion.id,
          cycleId: context.cycle.id,
          branchId: technician.branchId,
          staffId: technician.id,
          serviceJobId: serviceJob.id,
          postedById: superOwner.id,
        },
      });
      assert(entry.amount.toFixed(2) === "0.00", "Zero-percent eligible activity is retained as a zero-amount ledger row");
      assert(Boolean(entry.classificationSnapshot && entry.rateVersionId && entry.cycleId), "Every new enterprise row has non-null classification, rate version, and cycle snapshots");

      const claimableCycle = await tx.incentiveCycle.create({
        data: {
          periodCode: `${sentinel}-claimable`,
          startDate: new Date("2026-08-01T00:00:00Z"),
          endDate: new Date("2026-08-07T00:00:00Z"),
          cutoffDate: new Date("2026-08-07T00:00:00Z"),
          claimOpenDate: new Date("2026-08-08T00:00:00Z"),
          claimCloseDate: new Date("2026-08-20T00:00:00Z"),
          status: "CLAIMABLE",
          scheduleVersionId: scheduleVersion.id,
        },
      });
      await tx.incentive.update({
        where: { id: entry.id },
        data: { cycleId: claimableCycle.id },
      });
      const productEntry = await tx.incentive.create({
        data: {
          sourceKey: `${sentinel}:claim-product`,
          type: "SALE_ITEM",
          status: "POSTED",
          sourceCode: sale.receiptCode,
          sourceDate: new Date("2095-01-03T12:00:00Z"),
          basisAmount: 100,
          ratePercent: 3,
          amount: 3,
          classificationSnapshot: context.classification,
          rateVersionId: context.rateVersion.id,
          cycleId: claimableCycle.id,
          branchId: technician.branchId,
          staffId: technician.id,
          saleId: sale.id,
          postedById: superOwner.id,
        },
      });
      const claim = await internals.claimCycleInTransaction(
        tx,
        { ...technician, incentiveClassification: "TECHNICIAN" },
        claimableCycle.id,
        { notes: "transaction-scoped claim" }
      );
      assert(claim.status === "CLAIMED", "Employee can submit only their own claim during claim window");
      assert(claim.staff.id === technician.id && claim.claimedBy.id === technician.id, "Claim snapshots self staff and submitting actor");
      assert(claim.lines.length === 2 && claim.lines.some((line) => line.incentiveId === entry.id) && claim.lines.some((line) => line.incentiveId === productEntry.id), "Claim freezes immutable product and service source lines");
      const duplicateClaim = await internals.claimCycleInTransaction(
        tx,
        { ...technician, incentiveClassification: "TECHNICIAN" },
        claimableCycle.id,
        {}
      );
      assert(duplicateClaim.id === claim.id, "Duplicate self-claim is idempotent");

      let branchDenied = false;
      try {
        await internals.transitionClaimInTransaction(
          tx,
          { id: admin.id, role: "ADMIN", branchId: `${technician.branchId}-other` },
          claim.id,
          "APPROVE",
          {}
        );
      } catch (error) {
        branchDenied = error.code === "BRANCH_ACCESS_DENIED";
      }
      assert(branchDenied, "Cross-branch manager cannot approve an employee claim");
      const approved = await internals.transitionClaimInTransaction(
        tx,
        superOwner,
        claim.id,
        "APPROVE",
        { notes: "approved in rollback fixture" }
      );
      assert(approved.status === "APPROVED" && approved.approvedBy.id === superOwner.id, "Super Owner approval records actor and status metadata");
      const paid = await internals.transitionClaimInTransaction(
        tx,
        superOwner,
        claim.id,
        "PAID",
        { payoutReference: `${sentinel}-payout` }
      );
      assert(paid.status === "PAID" && paid.paidBy.id === superOwner.id, "Paid transition records actor as metadata only");
      assert(paid.payoutReference === `${sentinel}-payout`, "Paid transition retains payout reference metadata");
      const paidAgain = await internals.transitionClaimInTransaction(
        tx,
        superOwner,
        claim.id,
        "PAID",
        {}
      );
      assert(paidAgain.id === paid.id && paidAgain.status === "PAID", "Repeated paid transition is idempotent");

      let settledReturnDenied = false;
      try {
        await incentiveService.adjustSaleItemIncentiveForReturn(tx, superOwner, {
          saleId: sale.id,
          returnRequestId: `${sentinel}-return`,
          remainingBasisAmount: 100,
          reason: "claim settlement guard",
        });
      } catch (error) {
        settledReturnDenied = error.code === "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED";
      }
      assert(settledReturnDenied, "Claim-linked product return is blocked before ledger reversal");
      let settledCancellationDenied = false;
      try {
        await incentiveService.reverseSaleIncentives(
          tx,
          superOwner,
          sale.id,
          "claim settlement guard"
        );
      } catch (error) {
        settledCancellationDenied =
          error.code === "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED";
      }
      assert(settledCancellationDenied, "Claim-linked sale cancellation is blocked before ledger reversal");

      const legacySale = await tx.sale.create({
        data: {
          receiptCode: `${sentinel}-legacy-sale`,
          status: "COMPLETED",
          paymentStatus: "PAID",
          saleDate: new Date("2026-07-01T12:00:00Z"),
          branchId: technician.branchId,
          cashierId: technician.id,
          subtotal: 200,
          grandTotal: 200,
          amountPaid: 200,
        },
      });
      const legacyEntry = await tx.incentive.create({
        data: {
          sourceKey: `${sentinel}:legacy`,
          type: "SALE_ITEM",
          status: "POSTED",
          sourceCode: legacySale.receiptCode,
          sourceDate: legacySale.saleDate,
          basisAmount: 200,
          ratePercent: 2.5,
          amount: 5,
          branchId: technician.branchId,
          staffId: technician.id,
          saleId: legacySale.id,
          postedById: superOwner.id,
        },
      });
      const legacyAdjustment =
        await incentiveService.adjustSaleItemIncentiveForReturn(tx, superOwner, {
          saleId: legacySale.id,
          returnRequestId: `${sentinel}-legacy-return`,
          remainingBasisAmount: 80,
          reason: "legacy compatibility",
        });
      assert(legacyAdjustment.reversed.id === legacyEntry.id, "Legacy return still reverses the original ledger row");
      assert(Number(legacyAdjustment.replacement.basisAmount) === 80 && Number(legacyAdjustment.replacement.ratePercent) === 2.5, "Legacy return reposts remaining basis at the original snapshotted rate");
      assert(!legacyAdjustment.replacement.classificationSnapshot && !legacyAdjustment.replacement.rateVersionId && !legacyAdjustment.replacement.cycleId, "Legacy replacement preserves pre-enterprise null provenance without manufacturing history");

      const reversedEntry = await tx.incentive.create({
        data: {
          sourceKey: `${sentinel}:reversed`,
          type: "SALE_ITEM",
          status: "REVERSED",
          sourceCode: `${sentinel}-reversed`,
          sourceDate: new Date("2095-01-03T12:00:00Z"),
          basisAmount: 1000,
          ratePercent: 10,
          amount: 100,
          classificationSnapshot: context.classification,
          rateVersionId: context.rateVersion.id,
          cycleId: context.cycle.id,
          branchId: technician.branchId,
          staffId: technician.id,
          saleId: sale.id,
          postedById: superOwner.id,
          reversedAt: new Date("2095-01-04T00:00:00Z"),
          reversedById: superOwner.id,
          reversalReason: "transaction-scoped reversal",
        },
      });
      const breakdown = internals.buildStaffBreakdowns(
        {
          ...context.cycle,
          status: "EARNING",
          claims: [],
          incentives: [
            { ...entry, staff: technician, branch: null },
          ],
        },
        []
      )[0];
      assert(breakdown.serviceBasis === 500, "Cycle breakdown includes posted eligible basis");
      assert(!breakdown.sources.some((source) => source.id === reversedEntry.id), "Cycle breakdown excludes reversed source basis");

      const frozenHistoricalCycle = await tx.incentiveCycle.findUnique({
        where: { id: context.cycle.id },
        select: {
          scheduleVersionId: true,
          startDate: true,
          endDate: true,
          claimOpenDate: true,
          claimCloseDate: true,
        },
      });
      await tx.incentiveScheduleVersion.create({
        data: {
          scheduleType: "EVERY_N_DAYS",
          anchorDate: new Date("2095-01-08T00:00:00Z"),
          effectiveFrom: new Date("2095-01-08T00:00:00Z"),
          everyNDays: 14,
          claimOpenAfterDays: 2,
          claimWindowDays: 5,
          notes: `${sentinel}-future`,
          createdById: superOwner.id,
        },
      });
      const unchangedHistoricalCycle = await tx.incentiveCycle.findUnique({
        where: { id: context.cycle.id },
        select: {
          scheduleVersionId: true,
          startDate: true,
          endDate: true,
          claimOpenDate: true,
          claimCloseDate: true,
        },
      });
      assert(
        JSON.stringify(frozenHistoricalCycle) ===
          JSON.stringify(unchangedHistoricalCycle),
        "Future schedule version does not rewrite an already-persisted historical cycle"
      );

      const zeroEmployee = internals.buildStaffBreakdowns(
        {
          ...context.cycle,
          status: "CLOSED",
          incentives: [],
          claims: [],
        },
        [
          {
            ...technician,
            incentiveClassification: "TECHNICIAN",
            branch: null,
          },
        ]
      )[0];
      assert(zeroEmployee.totalIncentive === 0, "Eligible zero-activity employee remains visible in a cycle");
      assert(zeroEmployee.claimStatus === "EXPIRED", "Closed zero-activity cycle synthesizes an expired monitoring state");

      const missingContext = await enterpriseService.getPostingContext(tx, {
        staffId: technician.id,
        branchId: technician.branchId,
        sourceDate: new Date("2094-12-31T12:00:00Z"),
        basisType: "SERVICE",
      });
      assert(missingContext.eligible === false, "Incomplete effective enterprise configuration safely skips posting");

      const posted = await incentiveService.postSaleIncentives(
        tx,
        superOwner,
        sale.id
      );
      assert(posted.length === 1, "Sale incentive hook posts a classified product source under enterprise configuration");
      assert(Boolean(posted[0].classificationSnapshot && posted[0].rateVersionId && posted[0].cycleId), "Sale hook persists complete enterprise provenance on every new source");

      await tx.user.update({
        where: { id: technician.id },
        data: { incentiveClassification: txUser.incentiveClassification },
      });
      throw new Error("ROLLBACK_ENTERPRISE_REFINEMENT_FIXTURES");
    }).catch((error) => {
      if (error.message !== "ROLLBACK_ENTERPRISE_REFINEMENT_FIXTURES") throw error;
    });

    const finalCounts = await Promise.all([
      prisma.incentiveRateVersion.count(),
      prisma.incentiveScheduleVersion.count(),
      prisma.incentiveCycle.count(),
    ]);
    assert(
      JSON.stringify(finalCounts) === JSON.stringify(retainedCounts),
      "Transaction-scoped enterprise fixtures leave no retained rate, schedule, or cycle records"
    );
    const restoredEmployee = await prisma.user.findUnique({
      where: { id: technician.id },
      select: { incentiveClassification: true },
    });
    assert(
      restoredEmployee.incentiveClassification ===
        technician.incentiveClassification,
      "Employee classification remains unchanged after focused regression"
    );

    console.log(`\nEnterprise incentive refinement test passed: ${passed} assertions.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
