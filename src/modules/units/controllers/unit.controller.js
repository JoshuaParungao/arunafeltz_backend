const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const unitService = require("../services/unit.service");

const createUnit = asyncHandler(async (req, res) => {
  const unit = await unitService.createUnit(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Unit created successfully",
    data: unit,
  });
});

const listUnits = asyncHandler(async (req, res) => {
  const result = await unitService.listUnits(req.query);

  return sendSuccess(res, {
    message: "Units retrieved successfully",
    data: result,
  });
});

const getUnitById = asyncHandler(async (req, res) => {
  const unit = await unitService.getUnitById(req.params.id);

  return sendSuccess(res, {
    message: "Unit retrieved successfully",
    data: unit,
  });
});

const updateUnitById = asyncHandler(async (req, res) => {
  const unit = await unitService.updateUnitById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Unit updated successfully",
    data: unit,
  });
});

module.exports = {
  createUnit,
  listUnits,
  getUnitById,
  updateUnitById,
};
