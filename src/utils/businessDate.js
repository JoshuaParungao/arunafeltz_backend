const BUSINESS_TIME_ZONE = "Asia/Manila";

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getBusinessDateParts = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error("INVALID_BUSINESS_DATE");
    error.statusCode = 400;
    throw error;
  }

  const parts = Object.fromEntries(
    BUSINESS_DATE_FORMATTER.formatToParts(date).map((part) => [
      part.type,
      part.value,
    ])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
};

const businessDateText = (value = new Date()) => {
  const { year, month, day } = getBusinessDateParts(value);
  return `${year}-${month}-${day}`;
};

const businessDateCode = (value = new Date()) =>
  businessDateText(value).replaceAll("-", "");

const BUSINESS_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const parseTransactionDate = (value, fallback = new Date()) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      const error = new Error("Invalid transaction date");
      error.statusCode = 400;
      throw error;
    }
    return value;
  }

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const now = new Date();
    if (raw === businessDateText(now)) {
      return now;
    }

    const timePartRaw = BUSINESS_TIME_FORMATTER.format(now);
    const timePart = /^\d{2}:\d{2}:\d{2}$/.test(timePartRaw) ? timePartRaw : "12:00:00";
    const parsedDateOnly = new Date(`${raw}T${timePart}+08:00`);

    if (Number.isNaN(parsedDateOnly.getTime())) {
      const error = new Error("Invalid transaction date");
      error.statusCode = 400;
      throw error;
    }

    return parsedDateOnly;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error("Invalid transaction date");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

module.exports = {
  BUSINESS_TIME_ZONE,
  businessDateCode,
  businessDateText,
  getBusinessDateParts,
  parseTransactionDate,
};
