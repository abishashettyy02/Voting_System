function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  const message = status >= 500 ? 'Internal server error' : err.message;

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(status).json({
    error: {
      code: err.code || 'ERROR',
      message,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
