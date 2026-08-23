const crypto = require("crypto");

const normalizeForFingerprint = (value) => {
  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForFingerprint);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== "idempotencyKey")
        .sort()
        .map((key) => [key, normalizeForFingerprint(value[key])])
    );
  }

  return value;
};

const createIdempotencyFingerprint = (payload) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeForFingerprint(payload)))
    .digest("hex");

const assertIdempotencyMatch = (
  existing,
  fingerprint,
  conflictCode = "IDEMPOTENCY_KEY_REUSED"
) => {
  if (!existing) {
    return;
  }

  if (existing.idempotencyFingerprint !== fingerprint) {
    const error = new Error(conflictCode);
    error.statusCode = 409;
    throw error;
  }
};

module.exports = {
  assertIdempotencyMatch,
  createIdempotencyFingerprint,
  testInternals: {
    normalizeForFingerprint,
  },
};
