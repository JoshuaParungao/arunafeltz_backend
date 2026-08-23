const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const incentiveService = require("../services/incentive.service");
const enterpriseService = require("../services/enterpriseIncentive.service");
const incentiveSettingsV2Service = require("../services/incentiveSettingsV2.service");
const incentiveEngineV2Service = require("../services/incentiveEngineV2.service");

const getIncentives = asyncHandler(async (req, res) => {
  const result = await incentiveService.getIncentives(req.user, req.query);

  return sendSuccess(res, {
    message: "Incentive summary retrieved successfully",
    data: result,
  });
});

const updateRules = asyncHandler(async (req, res) => {
  const rules = await incentiveService.updateRules(req.user, req.body);

  return sendSuccess(res, {
    message: "Incentive rules updated successfully",
    data: {
      rules,
    },
  });
});

const getConfiguration = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Enterprise incentive configuration retrieved successfully",
    data: await enterpriseService.getConfiguration(req.user),
  })
);

const getAccountConfigurations = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive account configuration retrieved successfully",
    data: await incentiveSettingsV2Service.getAccountConfigurations(req.user),
  })
);

const createAccountConfigurationVersion = asyncHandler(
  async (req, res) =>
    sendSuccess(res, {
      statusCode: 201,
      message:
        "Incentive account configuration version created successfully",
      data:
        await incentiveSettingsV2Service.createAccountConfigVersion(
          req.user,
          req.params.accountId,
          req.body
        ),
    })
);

const getProgramRules = asyncHandler(
  async (req, res) =>
    sendSuccess(res, {
      message:
        "Incentive program rules retrieved successfully",

      data:
        await incentiveSettingsV2Service
          .getProgramRules(
            req.user,
            req.query
          ),
    })
);

const createProgramRuleVersion =
  asyncHandler(
    async (req, res) =>
      sendSuccess(res, {
        statusCode: 201,

        message:
          "Incentive program rule version created successfully",

        data:
          await incentiveSettingsV2Service
            .createProgramRuleVersion(
              req.user,
              req.params.programType,
              req.body
            ),
      })
  );

const getProgramSchedules =
  asyncHandler(
    async (req, res) =>
      sendSuccess(res, {
        message:
          "Incentive program schedules retrieved successfully",

        data:
          await incentiveSettingsV2Service
            .getProgramSchedules(
              req.user,
              req.query
            ),
      })
  );

const previewProgramSchedule =
  asyncHandler(
    async (req, res) =>
      sendSuccess(res, {
        message:
          "Incentive program schedule preview generated successfully",

        data:
          await incentiveSettingsV2Service
            .previewProgramSchedule(
              req.user,
              req.params.programType,
              req.body
            ),
      })
  );

const createProgramScheduleVersion =
  asyncHandler(
    async (req, res) =>
      sendSuccess(res, {
        statusCode: 201,

        message:
          "Incentive program schedule version created successfully",

        data:
          await incentiveSettingsV2Service
            .createProgramScheduleVersion(
              req.user,
              req.params.programType,
              req.body
            ),
      })
  );

const sendMaterializationError = (error, res) => {
  if (!error?.details || !error?.statusCode || error.statusCode >= 500) {
    throw error;
  }

  return res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  });
};

const getProgramCycles = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "V2 incentive program cycles retrieved successfully",
    data: await incentiveEngineV2Service.listProgramCycles(req.user, req.query),
  })
);

const getProgramReadiness = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "V2 incentive program readiness retrieved successfully",
    data: await incentiveEngineV2Service.getProgramReadiness(
      req.user,
      req.query
    ),
  })
);

const createManualProgramCycle = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Manual V2 incentive program cycle created successfully",
    data: await incentiveEngineV2Service.createManualProgramCycle(req.user, {
      ...req.body,
      branchId: req.body.branchId || req.user.branchId,
    }),
  })
);

const materializeItemCycleForDate = asyncHandler(async (req, res) => {
  try {
    return sendSuccess(res, {
      message: "V2 item incentive cycle materialized successfully",
      data: await incentiveEngineV2Service.materializeItemCycleForDate(
        req.user,
        {
          ...req.body,
          branchId: req.body.branchId || req.user.branchId,
        }
      ),
    });
  } catch (error) {
    return sendMaterializationError(error, res);
  }
});

const materializeItemCycle = asyncHandler(async (req, res) => {
  try {
    return sendSuccess(res, {
      message: "V2 item incentive cycle materialized successfully",
      data: await incentiveEngineV2Service.materializeItemCycle(
        req.user,
        req.params.id,
        req.body
      ),
    });
  } catch (error) {
    return sendMaterializationError(error, res);
  }
});

const claimProgramCycle = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "V2 incentive claim submitted successfully",
    data: await incentiveEngineV2Service.claimProgramCycle(
      req.user,
      req.params.id,
      req.body
    ),
  })
);

const createRateVersion = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Incentive rate version created successfully",
    data: await enterpriseService.createRateVersion(req.user, req.body),
  })
);

const previewSchedule = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive schedule preview calculated successfully",
    data: await enterpriseService.previewSchedule(req.user, req.body),
  })
);

const createScheduleVersion = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Incentive schedule version created successfully",
    data: await enterpriseService.createScheduleVersion(req.user, req.body),
  })
);

const initializeFromLegacyRules = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Enterprise incentives initialized from saved legacy rates",
    data: await enterpriseService.initializeFromLegacyRules(req.user, req.body),
  })
);

const createManualCycle = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Manual incentive cycle created successfully",
    data: await enterpriseService.createManualCycle(req.user, req.body),
  })
);

const getCycles = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive cycles retrieved successfully",
    data: await enterpriseService.getCycles(req.user, req.query),
  })
);

const getCalendar = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive calendar retrieved successfully",
    data: await enterpriseService.getCalendar(req.user, req.query),
  })
);

const getClaims = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive claims retrieved successfully",
    data: await enterpriseService.getClaims(req.user, req.query),
  })
);

const claimCycle = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: "Incentive claim submitted successfully",
    data: await enterpriseService.claimCycle(req.user, req.params.id, req.body),
  })
);

const approveClaim = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive claim approved successfully",
    data: await enterpriseService.approveClaim(req.user, req.params.id, req.body),
  })
);

const markClaimPaid = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: "Incentive claim marked paid successfully",
    data: await enterpriseService.markClaimPaid(req.user, req.params.id, req.body),
  })
);

module.exports = {
  getIncentives,
  updateRules,
  approveClaim,
  claimCycle,
  createManualCycle,
  createManualProgramCycle,
  createRateVersion,
  createScheduleVersion,
  getCalendar,
  getClaims,
  createAccountConfigurationVersion,
  createProgramRuleVersion,
  createProgramScheduleVersion,
  getAccountConfigurations,
  getProgramRules,
  getProgramSchedules,
  getProgramCycles,
  getProgramReadiness,
  getConfiguration,
  getCycles,
  initializeFromLegacyRules,
  markClaimPaid,
  materializeItemCycle,
  materializeItemCycleForDate,
  previewSchedule,
  previewProgramSchedule,
  claimProgramCycle,
};
