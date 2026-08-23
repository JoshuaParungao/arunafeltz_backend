const jwt = require("jsonwebtoken");

const env = require("../config/env");
const AppError = require("./appError");

const signToken = (payload) => {
  if (!env.jwtSecret) {
    throw new AppError(
      "JWT secret is not configured",
      500,
      "JWT_SECRET_MISSING"
    );
  }

  return jwt.sign(payload, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.jwtExpiresIn,
  });
};

const verifyToken = (token) => {
  if (!env.jwtSecret) {
    throw new AppError(
      "JWT secret is not configured",
      500,
      "JWT_SECRET_MISSING"
    );
  }

  return jwt.verify(token, env.jwtSecret, {
    algorithms: ["HS256"],
  });
};

module.exports = {
  signToken,
  verifyToken,
};
