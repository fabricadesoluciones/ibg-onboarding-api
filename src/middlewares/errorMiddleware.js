const logger = require("../config/logger");
const AppError = require("../utils/AppError");

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
};

const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  logger.error("Unhandled request error", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message: err.message,
    stack: err.stack,
    details: err.details || null,
  });

  res.status(statusCode).json({
    code: -1,
    message: isOperational ? err.message : "Internal Server Error",
    details: isOperational ? err.details : null,
  });
};

module.exports = {
  notFoundHandler,
  errorMiddleware,
};
