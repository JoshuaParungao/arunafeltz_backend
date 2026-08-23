require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const credentials = {
  superOwner: { identifier: "superowner", password: "Password123!" },
  admin: { identifier: "mainadmin", password: "Password123!" },
  technician: { identifier: "pendingtech", password: "Password123!" },
};

let passed = 0;

const check = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) {
      console.dir(details, { depth: null });
    }
    throw new Error(message);
  }

  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const main = async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token
          ? { Authorization: `Bearer ${options.token}` }
          : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  };

  const login = async (label, account) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: account,
    });
    check(result.status === 200, `${label} can log in`, result.body);
    check(Boolean(result.body?.data?.token), `${label} receives a token`);
    return result.body.data;
  };

  const createJob = async (token, body) => {
    return request("/service-jobs", {
      method: "POST",
      token,
      body,
    });
  };

  try {
    const [superOwner, admin, technician] = await Promise.all([
      login("Super Owner", credentials.superOwner),
      login("Admin", credentials.admin),
      login("Technician", credentials.technician),
    ]);

    const branchId = admin.user?.branch?.id || admin.user?.branchId;
    check(Boolean(branchId), "Admin has an assigned branch");

    const technicianLookup = await request(
      `/service-jobs/technicians?branchId=${branchId}`,
      { token: admin.token }
    );
    check(technicianLookup.status === 200, "Eligible technician lookup succeeds");
    const assignedTechnician = technicianLookup.body?.data?.find(
      (entry) => entry.id === technician.user.id
    );
    check(Boolean(assignedTechnician), "Active same-branch technician is eligible");

    const anonymousRelease = await request("/service-jobs/not-a-job/release", {
      method: "POST",
      body: {
        releaseOutcome: "UNREPAIRED",
        finalServiceCharge: 0,
      },
    });
    check(anonymousRelease.status === 401, "Release action requires authentication");

    const marker = `ENTERPRISE-JO-${Date.now()}`;
    const quickCreate = await createJob(admin.token, {
      customerNameSnapshot: "Enterprise Quick Walk-in",
      customerContactSnapshot: "09170000000",
      assignedTechnicianId: technician.user.id,
      jobTitle: `${marker} LAN cable crimping`,
      deviceDescription: "Three-meter CAT6 cable",
      serialNumber: "CABLE-N/A",
      problemDescription: "Crimp and test both ends",
      accessoriesReceived: "Cable and two RJ45 connectors",
      receivingRemarks: "Materials received in good condition",
      estimatedServiceCharge: 250,
      isQuickService: true,
    });
    check(quickCreate.status === 201, "Admin can receive a quick-service JO", quickCreate.body);
    const quickJob = quickCreate.body.data;
    check(quickJob.isQuickService === true, "Quick-service classification is persisted");
    check(quickJob.customerNameSnapshot === "Enterprise Quick Walk-in", "Walk-in name snapshot is persisted");
    check(quickJob.serialNumber === "CABLE-N/A", "Receiving serial/reference is persisted");
    check(quickJob.accessoriesReceived.includes("RJ45"), "Accessories received are persisted");
    check(quickJob.receivedBy?.id === admin.user.id, "Received By is the authenticated creator");
    check(quickJob.assignedTechnician?.id === technician.user.id, "Assigned performer is distinct and persisted");

    const technicianAssignmentManipulation = await createJob(technician.token, {
      assignedTechnicianId: admin.user.id,
      jobTitle: `${marker} forbidden technician assignment manipulation`,
      problemDescription: "Direct API assignment manipulation fixture",
      estimatedServiceCharge: 0,
    });
    check(
      [403, 404].includes(technicianAssignmentManipulation.status),
      "Technician cannot assign a new JO to another/non-eligible user through the API",
      technicianAssignmentManipulation.body
    );

    const quickReady = await request(`/service-jobs/${quickJob.id}/status`, {
      method: "PATCH",
      token: admin.token,
      body: {
        status: "READY_FOR_RELEASE",
        diagnosis: "Cable continuity confirmed",
        serviceNotes: "Crimped and tested both ends",
      },
    });
    check(quickReady.status === 200, "Quick JO can skip IN_PROGRESS and mark service performed", quickReady.body);
    check(quickReady.body?.data?.status === "READY_FOR_RELEASE", "Quick JO becomes ready for release");
    check(Boolean(quickReady.body?.data?.readyAt), "Quick service-performed timestamp is recorded");

    const clearReadyPerformer = await request(`/service-jobs/${quickJob.id}/assignment`, {
      method: "PATCH",
      token: admin.token,
      body: { assignedTechnicianId: null },
    });
    check(clearReadyPerformer.status === 200, "Management can correct an active ready-job assignment");

    const unassignedCompletedRelease = await request(`/service-jobs/${quickJob.id}/release`, {
      method: "POST",
      token: admin.token,
      body: {
        releaseOutcome: "SERVICE_COMPLETED",
        releaseNotes: "Must not release without a recorded performer",
        finalServiceCharge: 250,
      },
    });
    check(unassignedCompletedRelease.status === 400, "Completed release is blocked after performer assignment is cleared");
    check(
      unassignedCompletedRelease.body?.errorCode === "ASSIGNED_TECHNICIAN_REQUIRED",
      "Completed release returns the explicit performer-required error",
      unassignedCompletedRelease.body
    );

    const restoreReadyPerformer = await request(`/service-jobs/${quickJob.id}/assignment`, {
      method: "PATCH",
      token: admin.token,
      body: { assignedTechnicianId: technician.user.id },
    });
    check(restoreReadyPerformer.status === 200, "Management can restore the eligible performer before release");

    const quickRelease = await request(`/service-jobs/${quickJob.id}/release`, {
      method: "POST",
      token: admin.token,
      body: {
        releaseOutcome: "SERVICE_COMPLETED",
        releaseNotes: "Tested with customer present",
        finalServiceCharge: 250,
        diagnosis: "Cable continuity confirmed",
        serviceNotes: "Crimped and tested both ends",
      },
    });
    check(quickRelease.status === 200, "Completed quick JO can be explicitly released", quickRelease.body);
    check(quickRelease.body?.data?.status === "COMPLETED", "Completed release maps to COMPLETED");
    check(quickRelease.body?.data?.releaseOutcome === "SERVICE_COMPLETED", "Release outcome is explicit");
    check(Boolean(quickRelease.body?.data?.releasedAt), "Released At is recorded");
    check(quickRelease.body?.data?.releasedBy?.id === admin.user.id, "Released By is the authenticated action actor");

    const quickDetail = await request(`/service-jobs/${quickJob.id}`, {
      token: admin.token,
    });
    check(quickDetail.status === 200, "Released JO detail is readable");
    check(Array.isArray(quickDetail.body?.data?.actionHistory), "Detail exposes safe action history");
    check(Boolean(quickDetail.body?.data?.lastAction), "Detail exposes the latest action");
    check(
      quickDetail.body.data.actionHistory.some(
        (entry) =>
          entry.action === "SERVICE_JOB_RELEASED" &&
          entry.actor?.id === admin.user.id &&
          entry.metadata?.previousStatus === "READY_FOR_RELEASE" &&
          entry.metadata?.status === "COMPLETED"
      ),
      "Release audit distinguishes actor and status transition",
      quickDetail.body.data.actionHistory
    );
    check(
      !JSON.stringify(quickDetail.body.data).includes("passwordHash"),
      "JO detail and action history do not expose password hashes"
    );

    const quickIncentives = await prisma.incentive.findMany({
      where: { serviceJobId: quickJob.id },
      select: { staffId: true, status: true, basisAmount: true },
    });
    check(
      quickIncentives.every((entry) => entry.staffId === technician.user.id),
      "Any quick-service incentive credits the assigned performer, never the release actor",
      quickIncentives
    );

    const quickPayment = await request(`/service-jobs/${quickJob.id}/payment`, {
      method: "POST",
      token: admin.token,
      body: {
        paymentMethod: "GCASH",
        amount: 250,
        referenceNo: marker,
        remarks: "Enterprise JO non-cash payment test",
      },
    });
    check(quickPayment.status === 201, "Exact payment remains supported after explicit release", quickPayment.body);
    check(quickPayment.body?.data?.collectedBy?.id === admin.user.id, "Payment collector remains separately attributed");

    const duplicatePayment = await request(`/service-jobs/${quickJob.id}/payment`, {
      method: "POST",
      token: admin.token,
      body: { paymentMethod: "GCASH", amount: 250 },
    });
    check(duplicatePayment.status === 400, "One-payment invariant remains enforced");

    const terminalAssignment = await request(`/service-jobs/${quickJob.id}/assignment`, {
      method: "PATCH",
      token: admin.token,
      body: { assignedTechnicianId: null },
    });
    check(terminalAssignment.status === 400, "Terminal JO assignment is locked");

    const unrepairedCreate = await createJob(admin.token, {
      customerNameSnapshot: "Enterprise Pull-out Walk-in",
      customerContactSnapshot: "walkin@example.test",
      jobTitle: `${marker} unrepaired pull-out`,
      deviceDescription: "Desktop system unit",
      problemDescription: "Intermittent boot",
      receivingRemarks: "Scratches on side panel",
      estimatedServiceCharge: 500,
      isQuickService: true,
    });
    check(unrepairedCreate.status === 201, "Unassigned quick JO can be received before work begins", unrepairedCreate.body);
    const unrepairedJob = unrepairedCreate.body.data;

    const unassignedReady = await request(`/service-jobs/${unrepairedJob.id}/status`, {
      method: "PATCH",
      token: admin.token,
      body: {
        status: "READY_FOR_RELEASE",
        serviceNotes: "Must not be accepted without an actual performer",
      },
    });
    check(unassignedReady.status === 400, "Unassigned quick JO cannot be marked service performed");
    check(
      unassignedReady.body?.errorCode === "ASSIGNED_TECHNICIAN_REQUIRED",
      "Unassigned service-performed attempt returns an explicit safe error",
      unassignedReady.body
    );

    const selfClaim = await request(`/service-jobs/${unrepairedJob.id}/assignment`, {
      method: "PATCH",
      token: technician.token,
      body: { assignedTechnicianId: technician.user.id },
    });
    check(selfClaim.status === 200, "Technician can safely claim an unassigned own-branch JO", selfClaim.body);
    check(selfClaim.body?.data?.assignedTechnician?.id === technician.user.id, "Self-claim assigns only the authenticated technician");

    const technicianClear = await request(`/service-jobs/${unrepairedJob.id}/assignment`, {
      method: "PATCH",
      token: technician.token,
      body: { assignedTechnicianId: null },
    });
    check(technicianClear.status === 403, "Technician cannot clear or reassign an existing assignment");

    const managerClear = await request(`/service-jobs/${unrepairedJob.id}/assignment`, {
      method: "PATCH",
      token: admin.token,
      body: { assignedTechnicianId: null },
    });
    check(managerClear.status === 200, "Management can clear an active JO assignment");

    const managerAssign = await request(`/service-jobs/${unrepairedJob.id}/assignment`, {
      method: "PATCH",
      token: admin.token,
      body: { assignedTechnicianId: technician.user.id },
    });
    check(managerAssign.status === 200, "Management can assign an eligible same-branch technician");

    const unrepairedRelease = await request(`/service-jobs/${unrepairedJob.id}/release`, {
      method: "POST",
      token: admin.token,
      body: {
        releaseOutcome: "UNREPAIRED",
        releaseNotes: "Customer requested pull-out before repair",
        finalServiceCharge: 0,
        diagnosis: "Further bench testing declined",
      },
    });
    check(unrepairedRelease.status === 200, "Pending JO can be released unrepaired", unrepairedRelease.body);
    check(unrepairedRelease.body?.data?.status === "CANCELLED", "Unrepaired release does not falsely mark COMPLETED");
    check(unrepairedRelease.body?.data?.releaseOutcome === "UNREPAIRED", "Unrepaired outcome is retained");
    check(Boolean(unrepairedRelease.body?.data?.releasedAt), "Unrepaired release records Released At");
    check(!unrepairedRelease.body?.data?.completedAt, "Unrepaired release has no completed timestamp");
    check(unrepairedRelease.body?.data?.paymentState === "NO_CHARGE", "Zero-charge unrepaired release is explicitly NO CHARGE");

    const unrepairedIncentiveCount = await prisma.incentive.count({
      where: { serviceJobId: unrepairedJob.id },
    });
    check(unrepairedIncentiveCount === 0, "Unrepaired zero-charge release creates no incentive");

    const zeroPayment = await request(`/service-jobs/${unrepairedJob.id}/payment`, {
      method: "POST",
      token: admin.token,
      body: { paymentMethod: "GCASH", amount: 0 },
    });
    check(zeroPayment.status === 400, "Zero-charge released JO cannot create a payment");

    const chargedPullOutCreate = await createJob(admin.token, {
      customerNameSnapshot: "Enterprise Charged Pull-out",
      customerContactSnapshot: "09171111111",
      assignedTechnicianId: technician.user.id,
      jobTitle: `${marker} charged diagnostic pull-out`,
      deviceDescription: "Laptop computer",
      problemDescription: "Diagnostic only; customer declined repair",
      estimatedServiceCharge: 350,
    });
    check(chargedPullOutCreate.status === 201, "Charged diagnostic pull-out JO can be received", chargedPullOutCreate.body);
    const chargedPullOutJob = chargedPullOutCreate.body.data;

    const chargedPullOutRelease = await request(
      `/service-jobs/${chargedPullOutJob.id}/release`,
      {
        method: "POST",
        token: admin.token,
        body: {
          releaseOutcome: "DECLINED",
          releaseNotes: "Diagnostic performed; customer declined quoted repair",
          finalServiceCharge: 350,
          diagnosis: "Storage device requires replacement",
          serviceNotes: "Diagnostic service only",
        },
      }
    );
    check(chargedPullOutRelease.status === 200, "Charged unrepaired JO can be explicitly released", chargedPullOutRelease.body);
    check(chargedPullOutRelease.body?.data?.status === "CANCELLED", "Charged declined release remains terminal CANCELLED");
    check(chargedPullOutRelease.body?.data?.releaseOutcome === "DECLINED", "Charged release retains explicit DECLINED outcome");
    check(chargedPullOutRelease.body?.data?.paymentState === "UNPAID", "Positive released charge becomes UNPAID");

    const chargedPullOutIncentives = await prisma.incentive.count({
      where: { serviceJobId: chargedPullOutJob.id },
    });
    check(chargedPullOutIncentives === 0, "Charged unrepaired release creates zero service incentives");

    const chargedPullOutPayment = await request(
      `/service-jobs/${chargedPullOutJob.id}/payment`,
      {
        method: "POST",
        token: admin.token,
        body: {
          paymentMethod: "GCASH",
          amount: 350,
          referenceNo: `${marker}-DECLINED`,
        },
      }
    );
    check(chargedPullOutPayment.status === 201, "Exact GCASH payment is allowed for charged unrepaired release", chargedPullOutPayment.body);
    check(chargedPullOutPayment.body?.data?.paymentMethod === "GCASH", "Charged unrepaired payment method is retained");
    check(Number(chargedPullOutPayment.body?.data?.amount) === 350, "Charged unrepaired exact amount is retained");

    const duplicateChargedPullOutPayment = await request(
      `/service-jobs/${chargedPullOutJob.id}/payment`,
      {
        method: "POST",
        token: admin.token,
        body: { paymentMethod: "GCASH", amount: 350 },
      }
    );
    check(duplicateChargedPullOutPayment.status === 400, "Charged unrepaired JO still permits only one payment");

    const branches = await request("/branches", { token: superOwner.token });
    const otherBranch = branches.body?.data?.find((branch) => branch.id !== branchId);
    if (otherBranch) {
      const otherBranchCreate = await createJob(superOwner.token, {
        branchId: otherBranch.id,
        customerNameSnapshot: "Other Branch Enterprise Walk-in",
        jobTitle: `${marker} cross-branch release guard`,
        problemDescription: "Cross-branch security fixture",
        estimatedServiceCharge: 0,
      });
      check(otherBranchCreate.status === 201, "Super Owner can receive a JO for a selected active branch", otherBranchCreate.body);

      const crossBranchDetail = await request(
        `/service-jobs/${otherBranchCreate.body.data.id}`,
        { token: admin.token }
      );
      check(crossBranchDetail.status === 404, "Branch Admin cannot read another branch JO");

      const closeOtherBranchFixture = await request(
        `/service-jobs/${otherBranchCreate.body.data.id}/release`,
        {
          method: "POST",
          token: superOwner.token,
          body: {
            releaseOutcome: "CUSTOMER_PULL_OUT",
            releaseNotes: "Enterprise cross-branch fixture closed",
            finalServiceCharge: 0,
          },
        }
      );
      check(closeOtherBranchFixture.status === 200, "Super Owner can safely close the selected-branch fixture");
    } else {
      check(true, "Cross-branch JO guard skipped because only one branch exists");
      check(true, "Selected-branch fixture close skipped because only one branch exists");
      check(true, "Super Owner selected-branch create skipped because only one branch exists");
    }

    const frontendRoot = path.resolve(__dirname, "../arunafeltz-frontend/src");
    const servicesSource = fs.readFileSync(
      path.join(frontendRoot, "pages/services/ServicesPage.jsx"),
      "utf8"
    );
    const printCss = fs.readFileSync(path.join(frontendRoot, "index.css"), "utf8");
    check(servicesSource.includes("CUSTOMER COPY"), "Printable JO includes a Customer Copy");
    check(servicesSource.includes("STORE COPY"), "Printable JO includes a Store Copy");
    check(servicesSource.includes("CUT HERE"), "Printable JO includes a visible cut line label");
    check(printCss.includes("size: A4 portrait"), "Printable JO uses A4 portrait print rules");
    check(printCss.includes("grid-template-rows: minmax(0, 1fr) 6mm minmax(0, 1fr)"), "Printable JO fixes two half-page copies to one sheet");
    check(!servicesSource.includes("passwordHash"), "Printable JO source contains no password-hash field");
    check(!servicesSource.includes("acquisitionUnitCost"), "Printable JO source contains no internal acquisition costing");
    check(
      servicesSource.includes('user?.role !== "TECHNICIAN" || selectedTechnicianId === user?.id') &&
        servicesSource.includes("{canActOnSelected ? lifecycleChoices(selectedJob)") &&
        servicesSource.includes("{canActOnSelected && selectedIsActive ?"),
      "Technician lifecycle and release controls are visible only for the assigned technician"
    );

    console.log(`\nENTERPRISE_SERVICE_JOB_ORDER_PASS assertions=${passed}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

main()
  .catch((error) => {
    console.error("\nENTERPRISE_SERVICE_JOB_ORDER_FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
