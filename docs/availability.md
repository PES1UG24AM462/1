# SAM-NF-002 Availability Operations

## Approved requirement and traceability

The SRS states: “The system shall provide at least 99.5% monthly availability excluding scheduled maintenance.” GitHub issue #51 records acceptance criterion `AC-SAM-NF-002`: monthly uptime is at least 99.5%, excluding scheduled maintenance. The approved test plan maps this to `TC-OPS-01`: availability monitoring demonstrates at least 99.5% monthly availability excluding scheduled maintenance.

## Measurement method

Measure each calendar month in UTC. Define the measurement interval as the first instant of the month through the first instant of the next month. Exclude only scheduled maintenance intervals that were recorded before they began; unplanned downtime remains in the measurement. Do not infer maintenance exclusions from an outage after the fact.

For a month with complete monitoring data:

```text
measurement time = calendar month duration - scheduled maintenance duration
availability (%) = (measurement time - unavailable time) / measurement time * 100
```

Count overlapping outage intervals once. Downtime during an approved scheduled maintenance interval is excluded with that interval. When there is no scheduled maintenance, a 30-day month permits at most 3 hours 36 minutes unavailable, a 31-day month 3 hours 43 minutes 12 seconds, a 29-day month 3 hours 28 minutes 48 seconds, and a 28-day month 3 hours 21 minutes 36 seconds at the 99.5% threshold.

The `calculateAvailability` utility accepts measured outage and maintenance intervals and returns `status: incomplete` with a null percentage unless the caller confirms complete monitoring coverage. It is a calculation helper, not a monitor or an uptime data store.

## Health endpoints

- `GET /api/health` is a lightweight process liveness check. It does not query MySQL.
- `GET /api/ready` is a readiness check. It runs a bounded `SELECT 1` against the MySQL pool and returns only `ready` or `not_ready`; it does not disclose database details.

Configure an external uptime monitor to probe `/api/ready` at a regular cadence and retain the raw probe results and outage intervals for each UTC calendar month. A month without complete monitor evidence is unmeasured, not 100% available. This repository does not configure an external monitoring provider or contain production probe history, so it cannot establish actual monthly availability.

## Runtime behavior

- MySQL uses a bounded connection pool and bounded waiter queue. Connection and readiness-probe timeouts are configurable through `DB_CONNECT_TIMEOUT_MS` and `DB_PROBE_TIMEOUT_MS`.
- Startup retries only the idempotent database connectivity check, at most `DB_STARTUP_ATTEMPTS` times, using capped exponential backoff with jitter from `DB_STARTUP_RETRY_DELAY_MS`. Data-changing operations are not automatically retried.
- Production startup requires database connection settings and `JWT_SECRET`; missing settings fail with their names in a startup log.
- `SIGINT` and `SIGTERM` stop accepting new connections, allow active requests up to `SHUTDOWN_TIMEOUT_MS` to finish, and then close the pool.
- Request IDs are returned in `X-Request-Id`. Slow requests and server errors are JSON logs with route templates and request IDs; request bodies, query strings, SQL messages, and stacks are not included.
- The frontend uses a 10-second request timeout by default (override with `REACT_APP_API_TIMEOUT_MS`) and maps network, timeout, and server failures to a retryable service-unavailable message. It does not automatically replay writes; existing UI retry actions remain user initiated.

## Infrastructure dependencies and limits

Achieving the target still depends on the hosting platform keeping the process reachable, reliable MySQL service and backups, network/DNS availability, capacity, deployments, and an external monitor retaining complete records. The project has no deployment manifest, container orchestration, multi-instance failover, or configured external monitoring service. A single application instance is not high availability. `TC-OPS-01` can be passed only after a complete month of monitoring evidence is reviewed; automated tests cover endpoint and calculation behavior, not real monthly uptime.
