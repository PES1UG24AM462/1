const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  const requestId = req.requestId || 'unknown';

  // Do not log raw error messages or stacks: database/client errors can contain
  // SQL text or submitted values. The code and request ID are enough to find the
  // corresponding safe operational event without exposing user data.
  logger.error('http.request_error', {
    requestId,
    method: req.method,
    route: req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched',
    status,
    errorName: err.name || 'Error',
    errorCode: err.code || undefined,
  });

  const message = status >= 500
    ? 'Internal server error.'
    : (err.publicMessage || (status === 400 ? 'Invalid request.' : err.message) || 'Request failed.');
  return res.status(status).json({ message, requestId });
}

module.exports = errorHandler;
