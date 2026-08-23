const env = require("../config/env");

const getTimestamp = () => {
  return new Date().toISOString();
};

const formatMessage = (level, message, meta) => {
  const log = {
    timestamp: getTimestamp(),
    level,
    message,
  };

  if (meta !== undefined) {
    log.meta = meta;
  }

  return JSON.stringify(log);
};

const logger = {
  info: (message, meta) => {
    console.log(formatMessage("INFO", message, meta));
  },

  warn: (message, meta) => {
    console.warn(formatMessage("WARN", message, meta));
  },

  error: (message, meta) => {
    console.error(formatMessage("ERROR", message, meta));
  },

  debug: (message, meta) => {
    if (env.nodeEnv === "development") {
      console.debug(formatMessage("DEBUG", message, meta));
    }
  },
};

module.exports = logger;
