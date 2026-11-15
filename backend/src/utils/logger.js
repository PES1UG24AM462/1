/** Small JSON logger for operational events. Callers must pass safe metadata only. */
function write(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const output = JSON.stringify(entry);
  if (level === 'error') return console.error(output);
  if (level === 'warn') return console.warn(output);
  return console.log(output);
}

module.exports = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};
