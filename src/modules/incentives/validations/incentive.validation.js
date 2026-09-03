const { z } = require("zod");

const isValidDateOnly = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(isValidDateOnly, "Date is invalid");

const listIncentivesSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    staffId: z.string().trim().min(1).optional(),
    type: z.enum(["SALE_ITEM", "QUOTATION_SERVICE", "SERVICE_JOB"]).optional(),
    status: z.enum(["POSTED", "REVERSED"]).optional(),
    dateFrom: dateOnly.optional(),
    dateTo: dateOnly.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const updateIncentiveRulesSchema = z.object({
  body: z
    .object({
      enableItemIncentives: z.boolean(),
      enableServiceIncentives: z.boolean(),
      defaultItemIncentivePercent: z.number().finite().min(0).max(100),
      defaultServiceIncentivePercent: z.number().finite().min(0).max(100),
      staffCanViewOwnIncentives: z.boolean(),
      ownerCanViewAllIncentives: z.boolean(),
      requireOwnerApprovalBeforePayout: z.boolean(),
    })
    .strict(),
});

const classification = z.enum([
  "SALES_AGENT",
  "SENIOR_SALES_AGENT",
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);
const scheduleType = z.enum([
  "EVERY_N_DAYS",
  "WEEKLY",
  "MONTHLY",
  "MANUAL",
]);
const notes = z.string().trim().max(1000).optional().nullable();

const rateRow = z
  .object({
    classification,
    productRate: z.coerce.number().finite().min(0).max(100),
    serviceRate: z.coerce.number().finite().min(0).max(100),
  })
  .strict();

const createRateVersionSchema = z.object({
  body: z
    .object({
      effectiveFrom: dateOnly,
      notes,
      rates: z.array(rateRow).length(4),
    })
    .strict(),
});

const scheduleBody = z
  .object({
    scheduleType,
    anchorDate: dateOnly,
    effectiveFrom: dateOnly,
    everyNDays: z.coerce.number().int().positive().optional().nullable(),
    claimOpenAfterDays: z.coerce.number().int().positive(),
    claimWindowDays: z.coerce.number().int().positive(),
    notes,
    count: z.coerce.number().int().min(1).max(12).optional(),
  })
  .strict();

const createScheduleVersionSchema = z.object({ body: scheduleBody.omit({ count: true }) });
const previewScheduleSchema = z.object({ body: scheduleBody });

const createManualCycleSchema = z.object({
  body: z
    .object({
      scheduleVersionId: z.string().trim().min(1),
      startDate: dateOnly,
      endDate: dateOnly,
    })
    .strict(),
});

const listCyclesSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      staffId: z.string().trim().min(1).optional(),
      status: z.enum(["EARNING", "CUT_OFF", "CLAIMABLE", "CLOSED"]).optional(),
      dateFrom: dateOnly.optional(),
      dateTo: dateOnly.optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    })
    .strict(),
});

const calendarSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      staffId: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().positive().max(50).optional(),
    })
    .strict(),
});

const listClaimsSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      staffId: z.string().trim().min(1).optional(),
      cycleId: z.string().trim().min(1).optional(),
      classification: classification.optional(),
      dateFrom: dateOnly.optional(),
      dateTo: dateOnly.optional(),
      status: z
        .enum(["UNCLAIMED", "CLAIMED", "APPROVED", "PAID", "EXPIRED"])
        .optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    })
    .strict(),
});

const cycleIdParamSchema = z.object({
  params: z.object({ id: z.string().trim().min(1) }),
  body: z.object({ notes }).strict(),
});

const claimIdParamSchema = z.object({
  params: z.object({ id: z.string().trim().min(1) }),
  body: z.object({ notes }).strict(),
});

const paidClaimSchema = z.object({
  params: z.object({ id: z.string().trim().min(1) }),
  body: z
    .object({
      payoutReference: z.string().trim().max(191).optional().nullable(),
      notes,
    })
    .strict(),
});

const nullableAccountRate = z.preprocess(
  (value) => (value === "" ? null : value),
  z.coerce
    .number()
    .finite()
    .min(0)
    .max(100)
    .nullable()
);

const nullableRepairFee = z.preprocess(
  (value) => (value === "" ? null : value),
  z.coerce
    .number()
    .finite()
    .min(0)
    .max(9999999999.99)
    .nullable()
);

const accountConfigBody = z
  .object({
    itemEnabled:
      z.boolean(),

    itemRatePercent:
      nullableAccountRate,

    soloSaleEnabled:
      z.boolean().optional().default(false),

    soloSaleRatePercent:
      nullableAccountRate,

    ordinaryRepairEnabled:
      z.boolean(),

    ordinaryRepairRatePercent:
      nullableAccountRate,

    boardRepairEnabled:
      z.boolean(),

    boardRepairRatePercent:
      nullableAccountRate,

    pcBuildEnabled:
      z.boolean().optional().default(false),

    pcBuildRatePercent:
      nullableAccountRate,

    repairFee:
      nullableRepairFee,

    notes,
  })
  .strict()
  .superRefine((body, ctx) => {
    const pairs = [
      {
        enabled:
          body.itemEnabled,

        rate:
          body.itemRatePercent,

        field:
          "itemRatePercent",

        label:
          "Item Incentive",
      },
      {
        enabled:
          body.soloSaleEnabled,

        rate:
          body.soloSaleRatePercent,

        field:
          "soloSaleRatePercent",

        label:
          "Solo Sales Incentive",
      },
      {
        enabled:
          body.ordinaryRepairEnabled,

        rate:
          body.ordinaryRepairRatePercent,

        field:
          "ordinaryRepairRatePercent",

        label:
          "Service Incentive",
      },
      {
        enabled:
          body.boardRepairEnabled,

        rate:
          body.boardRepairRatePercent,

        field:
          "boardRepairRatePercent",

        label:
          "Board Level Repair Incentive",
      },
      {
        enabled:
          body.pcBuildEnabled,

        rate:
          body.pcBuildRatePercent,

        field:
          "pcBuildRatePercent",

        label:
          "PC Build Incentive",
      },
    ];

    for (const entry of pairs) {
      if (
        entry.enabled &&
        (
          entry.rate === null ||
          entry.rate <= 0
        )
      ) {
        ctx.addIssue({
          code:
            z.ZodIssueCode.custom,

          path:
            [entry.field],

          message:
            `${entry.label} rate must be greater than 0 when enabled`,
        });
      }

      if (
        !entry.enabled &&
        entry.rate !== null
      ) {
        ctx.addIssue({
          code:
            z.ZodIssueCode.custom,

          path:
            [entry.field],

          message:
            `${entry.label} rate must be null when disabled`,
        });
      }
    }
  });

const incentiveProgramType = z.enum([
  "ITEM_SALE",
  "ORDINARY_REPAIR",
  "BOARD_LEVEL_REPAIR",
]);

const eligiblePriceTiers = z
  .array(
    z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
  )
  .max(5)
  .superRefine((tiers, ctx) => {
    if (
      new Set(tiers).size !==
      tiers.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Eligible Price Tiers cannot contain duplicates",
      });
    }
  });

const nullableRepairCostPercent =
  z.preprocess(
    (value) =>
      value === ""
        ? null
        : value,

    z.coerce
      .number()
      .finite()
      .min(0)
      .max(100)
      .nullable()
  );

const getProgramRulesSchema =
  z.object({
    query:
      z
        .object({
          branchId:
            z
              .string()
              .trim()
              .min(1)
              .optional(),
        })
        .strict(),
  });

const createProgramRuleVersionSchema =
  z.object({
    params:
      z
        .object({
          programType:
            incentiveProgramType,
        })
        .strict(),

    body:
      z
        .object({
          branchId:
            z
              .string()
              .trim()
              .min(1)
              .optional(),

          eligiblePriceTiers,

          repairCostPercent:
            nullableRepairCostPercent,

          notes,
        })
        .strict()
        .superRefine(
          (body, ctx) => {
            const programType =
              undefined;

            // Cross-program semantic rules are also
            // enforced by the service because
            // programType lives in route params.
            // This schema owns field/type/range rules.
            void programType;
            void ctx;
          }
        ),
  });

const getProgramSchedulesSchema =
  z.object({
    query:
      z
        .object({
          branchId:
            z.string()
              .trim()
              .min(1)
              .optional(),
        })
        .strict(),
  });

const programScheduleBody =
  scheduleBody.extend({
    branchId:
      z.string()
        .trim()
        .min(1)
        .optional(),
  });

const createProgramScheduleVersionSchema =
  z.object({
    params:
      z
        .object({
          programType:
            incentiveProgramType,
        })
        .strict(),

    body:
      programScheduleBody.omit({
        count: true,
      }),
  });

const previewProgramScheduleSchema =
  z.object({
    params:
      z
        .object({
          programType:
            incentiveProgramType,
        })
        .strict(),

    body:
      programScheduleBody,
  });

const listProgramCyclesSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      programType: incentiveProgramType.optional(),
      status: z
        .enum(["EARNING", "CUT_OFF", "CLAIMABLE", "CLOSED"])
        .optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    })
    .strict(),
});

const getProgramReadinessSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).optional(),
    })
    .strict(),
});

const createManualProgramCycleSchema = z.object({
  body: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      programType: incentiveProgramType,
      startDate: dateOnly,
      endDate: dateOnly,
    })
    .strict(),
});

const materializeItemCycleForDateSchema = z.object({
  body: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      targetDate: dateOnly,
      reason: z.string().trim().max(1000).optional().nullable(),
    })
    .strict(),
});

const materializeItemCycleSchema = z.object({
  params: z.object({ id: z.string().trim().min(1) }).strict(),
  body: z
    .object({
      reason: z.string().trim().max(1000).optional().nullable(),
    })
    .strict(),
});

const claimProgramCycleSchema = z.object({
  params: z.object({ id: z.string().trim().min(1) }).strict(),
  body: z.object({ notes }).strict(),
});

const createAccountConfigVersionSchema =
  z.object({
    params:
      z
        .object({
          accountId:
            z.string().trim().min(1),
        })
        .strict(),

    body:
      accountConfigBody,
  });

module.exports = {
  createAccountConfigVersionSchema,
  claimProgramCycleSchema,
  createManualProgramCycleSchema,
  createProgramRuleVersionSchema,
  createProgramScheduleVersionSchema,
  getProgramRulesSchema,
  getProgramReadinessSchema,
  getProgramSchedulesSchema,
  listIncentivesSchema,
  listProgramCyclesSchema,
  materializeItemCycleForDateSchema,
  materializeItemCycleSchema,
  updateIncentiveRulesSchema,
  calendarSchema,
  claimIdParamSchema,
  createManualCycleSchema,
  createRateVersionSchema,
  createScheduleVersionSchema,
  cycleIdParamSchema,
  listClaimsSchema,
  listCyclesSchema,
  paidClaimSchema,
  previewScheduleSchema,
  previewProgramScheduleSchema,
};
