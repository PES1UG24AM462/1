/**
 * responseTime.js
 * SAM-NF-001 — 95th percentile of attendance and report operations must respond within 3 s.
 *
 * Adds an X-Response-Time header to every response (so TC-PERF-01 can measure it from the
 * client) and logs a warning for any request slower than the target.
 */

const TARGET_MS = parseInt(process.env.RESPONSE_TARGET_MS, 10) || 3000;

function responseTime(req, res, next) {
  const start = process.hrtime.bigint();
  const originalWriteHead = res.writeHead;

  // Set the header just before headers are flushed so it reflects handler time.
  res.writeHead = function patchedWriteHead(...args) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) res.setHeader('X-Response-Time', `${ms.toFixed(1)}ms`);
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms > TARGET_MS) {
      console.warn(`[Perf] ${req.method} ${req.originalUrl} took ${ms.toFixed(0)}ms (target ${TARGET_MS}ms)`);
    }
  });

  next();
}

module.exports = responseTime;
