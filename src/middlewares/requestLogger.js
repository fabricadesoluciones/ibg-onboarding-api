const logger = require("../config/logger");

const requestLogger = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.http("HTTP request completed", {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      userId: req.user ? req.user.id : null,
    });
  });

  next();
};

module.exports = requestLogger;
