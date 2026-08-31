const omnisearchService = require("../services/omnisearch.service");
const { sendSuccess } = require("../../../utils/apiResponse");

const search = async (req, res, next) => {
  try {
    const { q, branchId } = req.query;
    const results = await omnisearchService.executeOmnisearch(req.user, {
      query: q,
      branchId,
    });

    return sendSuccess(res, {
      message: "Omnisearch results retrieved successfully",
      data: results,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  search,
};
