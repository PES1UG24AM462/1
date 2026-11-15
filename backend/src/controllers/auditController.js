const auditModel = require('../models/auditModel');
const { logOperationalError } = require('../utils/logOperationalError');

function isUtcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

function listAuditEvents(req, res) {
  const { action, actor, startDate, endDate } = req.query;
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

  if ((action !== undefined && (typeof action !== 'string' || !/^[A-Z][A-Z0-9_]{1,99}$/.test(action)))
    || (actor !== undefined && (typeof actor !== 'string' || !actor.trim() || actor.length > 100))
    || (startDate !== undefined && !isUtcDate(startDate))
    || (endDate !== undefined && !isUtcDate(endDate))
    || (startDate !== undefined && endDate !== undefined && startDate > endDate)
    || !Number.isInteger(limit) || limit < 1 || limit > 100
    || !Number.isInteger(offset) || offset < 0) {
    return res.status(400).json({ message: 'Invalid audit history filters.' });
  }

  return auditModel.listEvents({
    action: action || null,
    actor: actor || null,
    startDate: startDate || null,
    endDate: endDate || null,
    limit,
    offset,
  })
    .then((events) => res.status(200).json({ events, limit, offset }))
    .catch((err) => {
      logOperationalError('audit.history_lookup_failed', err, res);
      return res.status(500).json({ message: 'Unable to load audit history. Please try again.' });
    });
}

module.exports = { listAuditEvents };
