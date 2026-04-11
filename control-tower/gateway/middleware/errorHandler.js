'use strict';
const logger = require('../../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} → ${err.message}`);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

module.exports = { errorHandler, notFound };
