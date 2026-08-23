const sendSuccess = (
  res,
  {
    statusCode = 200,
    message = "Request successful",
    data = null,
    meta = undefined,
  } = {}
) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  if (meta !== undefined) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

const sendCreated = (
  res,
  {
    message = "Resource created successfully",
    data = null,
  } = {}
) => {
  return sendSuccess(res, {
    statusCode: 201,
    message,
    data,
  });
};

const sendNoContent = (res) => {
  return res.status(204).send();
};

const sendPaginated = (
  res,
  {
    message = "Records retrieved successfully",
    data = [],
    page = 1,
    limit = 10,
    total = 0,
  } = {}
) => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return sendSuccess(res, {
    statusCode: 200,
    message,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  });
};

module.exports = {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
};
