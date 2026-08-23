const AppError = require(
  "../../../utils/appError"
);

const DAY_MS =
  24 * 60 * 60 * 1000;

const BUSINESS_TIME_ZONE =
  "Asia/Manila";

const BUSINESS_DATE_FORMATTER =
  new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        BUSINESS_TIME_ZONE,

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",
    }
  );

const SCHEDULE_TYPES =
  new Set([
    "EVERY_N_DAYS",
    "WEEKLY",
    "MONTHLY",
    "MANUAL",
  ]);

const parseDateOnly = (
  value,
  fieldName = "date"
) => {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(
          value.trim()
        )
      : null;

  if (!match) {
    throw new AppError(
      `${fieldName} must use YYYY-MM-DD format`,
      400,
      "INVALID_DATE_ONLY"
    );
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
  ] = match;

  const year =
    Number(yearText);

  const month =
    Number(monthText);

  const day =
    Number(dayText);

  const valueDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    valueDate.getUTCFullYear() !== year ||
    valueDate.getUTCMonth() !==
      month - 1 ||
    valueDate.getUTCDate() !== day
  ) {
    throw new AppError(
      `${fieldName} is invalid`,
      400,
      "INVALID_DATE_ONLY"
    );
  }

  return valueDate;
};

const localDateOnly = (
  value = new Date()
) => {
  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    throw new AppError(
      "Invalid source date",
      400,
      "INVALID_SOURCE_DATE"
    );
  }

  const parts =
    BUSINESS_DATE_FORMATTER
      .formatToParts(
        parsed
      );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ]
      )
    );

  const year =
    Number(
      values.year
    );

  const month =
    Number(
      values.month
    );

  const day =
    Number(
      values.day
    );

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new AppError(
      "Unable to resolve Philippine business date",
      500,
      "BUSINESS_DATE_RESOLUTION_FAILED"
    );
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );
};

const storedDateOnly = (value) => {
  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate()
    )
  );
};

const addDays = (
  value,
  days
) =>
  new Date(
    value.getTime() +
      days * DAY_MS
  );

const dateText = (value) =>
  storedDateOnly(value)
    .toISOString()
    .slice(0, 10);

const daysBetween = (
  left,
  right
) =>
  Math.floor(
    (
      storedDateOnly(left)
        .getTime() -
      storedDateOnly(right)
        .getTime()
    ) /
      DAY_MS
  );

const daysInUtcMonth = (
  year,
  monthIndex
) =>
  new Date(
    Date.UTC(
      year,
      monthIndex + 1,
      0
    )
  ).getUTCDate();

const monthlyBoundary = (
  year,
  monthIndex,
  anchorDay
) => {
  const normalized =
    new Date(
      Date.UTC(
        year,
        monthIndex,
        1
      )
    );

  const boundaryYear =
    normalized.getUTCFullYear();

  const boundaryMonth =
    normalized.getUTCMonth();

  return new Date(
    Date.UTC(
      boundaryYear,
      boundaryMonth,
      Math.min(
        anchorDay,
        daysInUtcMonth(
          boundaryYear,
          boundaryMonth
        )
      )
    )
  );
};

const calculateCycleBounds = (
  scheduleVersion,
  targetValue
) => {
  const target =
    storedDateOnly(
      targetValue
    );

  const anchor =
    storedDateOnly(
      scheduleVersion.anchorDate
    );

  let startDate;
  let nextStartDate;

  if (
    scheduleVersion.scheduleType ===
      "EVERY_N_DAYS" ||
    scheduleVersion.scheduleType ===
      "WEEKLY"
  ) {
    const cycleDays =
      scheduleVersion.scheduleType ===
      "WEEKLY"
        ? 7
        : Number(
            scheduleVersion.everyNDays
          );

    if (
      !Number.isInteger(
        cycleDays
      ) ||
      cycleDays < 1
    ) {
      throw new AppError(
        "Schedule cycle length is invalid",
        500,
        "INVALID_INCENTIVE_SCHEDULE"
      );
    }

    const cycleIndex =
      Math.floor(
        daysBetween(
          target,
          anchor
        ) /
          cycleDays
      );

    startDate =
      addDays(
        anchor,
        cycleIndex *
          cycleDays
      );

    nextStartDate =
      addDays(
        startDate,
        cycleDays
      );
  } else if (
    scheduleVersion.scheduleType ===
    "MONTHLY"
  ) {
    const anchorDay =
      anchor.getUTCDate();

    startDate =
      monthlyBoundary(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        anchorDay
      );

    if (startDate > target) {
      startDate =
        monthlyBoundary(
          target.getUTCFullYear(),
          target.getUTCMonth() - 1,
          anchorDay
        );
    }

    nextStartDate =
      monthlyBoundary(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth() + 1,
        anchorDay
      );
  } else {
    return null;
  }

  const endDate =
    addDays(
      nextStartDate,
      -1
    );

  const claimOpenDate =
    addDays(
      endDate,
      Number(
        scheduleVersion
          .claimOpenAfterDays
      )
    );

  const claimCloseDate =
    addDays(
      claimOpenDate,
      Number(
        scheduleVersion
          .claimWindowDays
      ) - 1
    );

  return {
    startDate,
    endDate,
    cutoffDate:
      endDate,
    claimOpenDate,
    claimCloseDate,
  };
};

const periodCodeForBounds = (
  bounds
) =>
  `INC-${dateText(
    bounds.startDate
  ).replaceAll("-", "")}-${dateText(
    bounds.endDate
  ).replaceAll("-", "")}`;

const normalizeOptionalText = (
  value
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized || null;
};

const normalizeScheduleInput = (
  payload,
  {
    allowPast = false,
  } = {}
) => {
  const scheduleType =
    payload.scheduleType;

  const anchorDate =
    parseDateOnly(
      payload.anchorDate,
      "anchorDate"
    );

  const effectiveFrom =
    parseDateOnly(
      payload.effectiveFrom,
      "effectiveFrom"
    );

  const claimOpenAfterDays =
    Number(
      payload.claimOpenAfterDays
    );

  const claimWindowDays =
    Number(
      payload.claimWindowDays
    );

  const everyNDays =
    scheduleType ===
    "EVERY_N_DAYS"
      ? Number(
          payload.everyNDays
        )
      : null;

  if (
    !SCHEDULE_TYPES.has(
      scheduleType
    ) ||
    !Number.isInteger(
      claimOpenAfterDays
    ) ||
    claimOpenAfterDays < 1 ||
    !Number.isInteger(
      claimWindowDays
    ) ||
    claimWindowDays < 1 ||
    (
      scheduleType ===
        "EVERY_N_DAYS" &&
      (
        !Number.isInteger(
          everyNDays
        ) ||
        everyNDays < 1
      )
    )
  ) {
    throw new AppError(
      "Incentive schedule values are invalid",
      400,
      "INVALID_INCENTIVE_SCHEDULE"
    );
  }

  if (
    !allowPast &&
    effectiveFrom <
      localDateOnly()
  ) {
    throw new AppError(
      "A new schedule version cannot begin in the past",
      400,
      "INCENTIVE_SCHEDULE_EFFECTIVE_DATE_PAST"
    );
  }

  const normalized = {
    scheduleType,
    anchorDate,
    effectiveFrom,
    everyNDays,
    claimOpenAfterDays,
    claimWindowDays,

    notes:
      normalizeOptionalText(
        payload.notes
      ),
  };

  if (
    scheduleType !==
    "MANUAL"
  ) {
    const firstBounds =
      calculateCycleBounds(
        normalized,
        effectiveFrom
      );

    if (
      !firstBounds ||
      firstBounds.startDate
        .getTime() !==
        effectiveFrom.getTime()
    ) {
      throw new AppError(
        "effectiveFrom must be a valid cycle boundary for the selected anchor",
        400,
        "INCENTIVE_SCHEDULE_BOUNDARY_REQUIRED"
      );
    }
  }

  return normalized;
};

const previewNormalizedSchedule = (
  schedule,
  count = 4,
  startValue =
    schedule.effectiveFrom
) => {
  if (
    schedule.scheduleType ===
    "MANUAL"
  ) {
    return [];
  }

  const periods = [];

  const effectiveFrom =
    storedDateOnly(
      schedule.effectiveFrom
    );

  let cursor =
    storedDateOnly(
      startValue
    );

  if (
    cursor <
    effectiveFrom
  ) {
    cursor =
      effectiveFrom;
  }

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const bounds =
      calculateCycleBounds(
        schedule,
        cursor
      );

    if (
      bounds.startDate <
      effectiveFrom
    ) {
      cursor =
        effectiveFrom;

      continue;
    }

    periods.push({
      periodCode:
        periodCodeForBounds(
          bounds
        ),

      startDate:
        dateText(
          bounds.startDate
        ),

      endDate:
        dateText(
          bounds.endDate
        ),

      cutoffDate:
        dateText(
          bounds.cutoffDate
        ),

      claimOpenDate:
        dateText(
          bounds.claimOpenDate
        ),

      claimCloseDate:
        dateText(
          bounds.claimCloseDate
        ),
    });

    cursor =
      addDays(
        bounds.endDate,
        1
      );
  }

  return periods;
};

module.exports = {
  BUSINESS_TIME_ZONE,
  SCHEDULE_TYPES,

  addDays,
  calculateCycleBounds,
  dateText,
  localDateOnly,
  normalizeScheduleInput,
  parseDateOnly,
  previewNormalizedSchedule,
  storedDateOnly,
};