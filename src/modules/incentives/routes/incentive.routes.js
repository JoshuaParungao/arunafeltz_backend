const express = require("express");

const { protect } = require("../../../middlewares/auth.middleware");
const validate = require("../../../middlewares/validate.middleware");
const incentiveController = require("../controllers/incentive.controller");
const {
  listIncentivesSchema,
  updateIncentiveRulesSchema,
  calendarSchema,
  claimProgramCycleSchema,
  claimIdParamSchema,
  createAccountConfigVersionSchema,
  createProgramRuleVersionSchema,
  createProgramScheduleVersionSchema,
  getProgramRulesSchema,
  getProgramReadinessSchema,
  getProgramSchedulesSchema,
  createManualCycleSchema,
  createManualProgramCycleSchema,
  createRateVersionSchema,
  createScheduleVersionSchema,
  cycleIdParamSchema,
  listClaimsSchema,
  listCyclesSchema,
  listProgramCyclesSchema,
  materializeItemCycleForDateSchema,
  materializeItemCycleSchema,
  paidClaimSchema,
  previewScheduleSchema,
  previewProgramScheduleSchema,
} = require("../validations/incentive.validation");

const router = express.Router();

router.get(
  "/program-readiness",
  protect,
  validate(getProgramReadinessSchema),
  incentiveController.getProgramReadiness
);

router.get(
  "/program-cycles",
  protect,
  validate(listProgramCyclesSchema),
  incentiveController.getProgramCycles
);

router.post(
  "/program-cycles/manual",
  protect,
  validate(createManualProgramCycleSchema),
  incentiveController.createManualProgramCycle
);

router.post(
  "/program-cycles/item/materialize",
  protect,
  validate(materializeItemCycleForDateSchema),
  incentiveController.materializeItemCycleForDate
);

router.post(
  "/program-cycles/:id/materialize",
  protect,
  validate(materializeItemCycleSchema),
  incentiveController.materializeItemCycle
);

router.post(
  "/program-cycles/:id/claim",
  protect,
  validate(claimProgramCycleSchema),
  incentiveController.claimProgramCycle
);

router.get(
  "/account-configurations",
  protect,
  incentiveController.getAccountConfigurations
);

router.post(
  "/account-configurations/:accountId/versions",
  protect,
  validate(createAccountConfigVersionSchema),
  incentiveController.createAccountConfigurationVersion
);
router.get(
  "/program-rules",
  protect,
  validate(getProgramRulesSchema),
  incentiveController.getProgramRules
);

router.post(
  "/program-rules/:programType/versions",
  protect,
  validate(createProgramRuleVersionSchema),
  incentiveController.createProgramRuleVersion
);

router.get(
  "/program-schedules",
  protect,
  validate(getProgramSchedulesSchema),
  incentiveController.getProgramSchedules
);

router.post(
  "/program-schedules/:programType/preview",
  protect,
  validate(previewProgramScheduleSchema),
  incentiveController.previewProgramSchedule
);

router.post(
  "/program-schedules/:programType/versions",
  protect,
  validate(createProgramScheduleVersionSchema),
  incentiveController.createProgramScheduleVersion
);

router.get("/configuration", protect, incentiveController.getConfiguration);
router.post(
  "/rate-versions",
  protect,
  validate(createRateVersionSchema),
  incentiveController.createRateVersion
);
router.post(
  "/schedule/preview",
  protect,
  validate(previewScheduleSchema),
  incentiveController.previewSchedule
);
router.post(
  "/schedule-versions",
  protect,
  validate(createScheduleVersionSchema),
  incentiveController.createScheduleVersion
);
router.post(
  "/initialize-from-legacy",
  protect,
  validate(createScheduleVersionSchema),
  incentiveController.initializeFromLegacyRules
);
router.get(
  "/calendar",
  protect,
  validate(calendarSchema),
  incentiveController.getCalendar
);
router.get(
  "/cycles",
  protect,
  validate(listCyclesSchema),
  incentiveController.getCycles
);
router.post(
  "/cycles/manual",
  protect,
  validate(createManualCycleSchema),
  incentiveController.createManualCycle
);
router.post(
  "/cycles/:id/claim",
  protect,
  validate(cycleIdParamSchema),
  incentiveController.claimCycle
);
router.get(
  "/claims",
  protect,
  validate(listClaimsSchema),
  incentiveController.getClaims
);
router.patch(
  "/claims/:id/approve",
  protect,
  validate(claimIdParamSchema),
  incentiveController.approveClaim
);
router.patch(
  "/claims/:id/paid",
  protect,
  validate(paidClaimSchema),
  incentiveController.markClaimPaid
);
router.get("/", protect, validate(listIncentivesSchema), incentiveController.getIncentives);
router.patch(
  "/rules",
  protect,
  validate(updateIncentiveRulesSchema),
  incentiveController.updateRules
);

module.exports = router;
