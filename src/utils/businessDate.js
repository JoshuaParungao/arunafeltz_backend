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

module.exports = {
  BUSINESS_TIME_ZONE,
  businessDateCode,
  businessDateText,
  getBusinessDateParts,
};
