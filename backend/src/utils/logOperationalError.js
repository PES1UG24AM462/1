const logger = require('./logger');

/** Log diagnostic codes and request IDs without recording raw SQL or payloads. */
function logOperationalError(event, err, res, fields = {}) {
  logger.error(event, {
    requestId: res?.getHeader?.('X-Request-Id') || 'unknown',
    ...fields,
    errorName: err?.name || 'Error',
    errorCode: err?.code || 'UNKNOWN',
  });
}

module.exports = { logOperationalError };
