const dotenv = require("dotenv");

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const parseOrigins = (value) => String(value || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const defaultDevelopmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigins: process.env.CORS_ORIGINS
    ? parseOrigins(process.env.CORS_ORIGINS)
    : nodeEnv === "development"
      ? defaultDevelopmentOrigins
      : [],
  trustProxy: process.env.TRUST_PROXY === undefined
    ? false
    : /^\d+$/.test(process.env.TRUST_PROXY)
      ? Number(process.env.TRUST_PROXY)
      : process.env.TRUST_PROXY === "true",
};

if (env.nodeEnv === "production") {
  const missing = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (
    !env.jwtSecret ||
    env.jwtSecret === "replace_with_a_long_random_secret" ||
    env.jwtSecret.length < 32
  ) {
    missing.push("JWT_SECRET (minimum 32 characters)");
  }
  if (env.corsOrigins.length === 0) missing.push("CORS_ORIGINS");
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

module.exports = env;
