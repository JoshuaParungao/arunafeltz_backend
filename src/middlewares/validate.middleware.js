const AppError = require("../utils/appError");

const formatZodIssues = (issues = []) => {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
};

const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const details = formatZodIssues(result.error.issues);

      return next(
        new AppError(
          "Validation failed",
          400,
          "VALIDATION_ERROR"
        )
      );
    }

    return next();
  };
};

module.exports = validate;
