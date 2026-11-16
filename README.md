# Student Attendance Management System (SAMS)

**Team Repo** | Sprint-1 | Issue: [SAM-F-001] Sign in with username and password

---

## Overview

SAMS is a web-based attendance management system for students, faculty, and administrators.  
Architecture: **React** (frontend) + **Node.js/Express** (REST API) + **MySQL** (database) + **JWT** auth.

Designed and built following:
- SRS v1.0 — Functional & Non-functional Requirements
- SAD v1.0 — System Architecture Design
- Test Plan v1.0 — Test cases and strategy

---

## Sprint-1 — Issues Implemented

| Issue | Title | Branch |
|-------|-------|--------|
| SAM-F-001 | Sign in with username and password | `feature/SAM-F-001-sign-in-username-password` |

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection pool
│   │   ├── controllers/    # authController (SAM-F-001)
│   │   ├── middleware/     # JWT auth + RBAC (SAM-F-002)
│   │   ├── models/         # userModel, auditModel
│   │   ├── routes/         # authRoutes
│   │   ├── utils/          # jwtHelper
│   │   └── server.js       # Express app entry point
│   ├── tests/
│   │   └── auth.test.js    # TC-AUTH-01 unit tests
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/       # LoginPage.js + LoginPage.css
│   │   │   └── dashboard/  # Student/Faculty/Admin dashboards
│   │   ├── context/        # AuthContext (React context + hooks)
│   │   ├── services/       # authService (axios calls)
│   │   ├── App.js          # Router + ProtectedRoute
│   │   └── index.js
│   └── package.json
│
├── database/
│   ├── schema.sql          # Full DB schema (all entities)
│   └── seed.sql            # Dev/test seed data
│
└── .github/workflows/ci.yml  # GitHub Actions CI
```

---

## Setup Instructions

### Prerequisites
- Node.js 20+
- MySQL 8.0+

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DB credentials and a strong JWT_SECRET
npm install
npm run dev
```

### Database

```bash
# Run schema first, then seed
mysql -u root -p < database/schema.sql
mysql -u root -p student_attendance_db < database/migrations/20261115_audit_log_append_only.sql
mysql -u root -p < database/seed.sql
```

Audit history retention, the database append-only guards, backup behavior, and the pending institutional retention-policy decision are documented in [docs/audit-retention.md](docs/audit-retention.md).

### Frontend

```bash
cd frontend
npm install
npm start
```

---

## Running Tests (TC-AUTH-01)

```bash
cd backend
npm test
```

Tests mock the database layer and run without a live MySQL instance.

## Production HTTPS/TLS (SAM-SR-001 / SAM-NF-003)

Approved requirement SAM-SR-001: "The system shall enforce HTTPS/TLS for all
authenticated network communication." Related requirement SAM-NF-003 is "Use
HTTPS/TLS for authenticated traffic." Production must terminate TLS either in
this Node.js server or at the trusted deployment proxy. The API rejects every
request that Express does not recognize as HTTPS with `426 HTTPS Required`
before parsing request bodies; it never redirects credentials or authenticated
data submitted over HTTP.

For direct TLS termination, provide deployment-managed certificate and private
key paths through `TLS_CERT_PATH` and `TLS_KEY_PATH`; the server requires TLS
1.2 or newer (TLS 1.3 is negotiated when supported by Node.js). Never place
certificates or private keys in source control. For proxy termination, leave
both paths unset, configure the proxy to accept only modern TLS, forward
`X-Forwarded-Proto: https`, and list only its exact IP addresses/CIDRs in
`TRUSTED_PROXY_IPS`. Network controls must prevent public access to the
plaintext backend listener; forwarded protocol headers from untrusted clients
are not trusted.

Set `ALLOWED_ORIGINS` to the comma-separated HTTPS origins used by the
production frontend. The API uses bearer JWTs in `Authorization` headers and
session storage; it does not use authentication cookies. The browser-side API
guard prevents production requests from an HTTP page, and the server independently
rejects plaintext requests. HSTS (`max-age=31536000`) is sent only on secure
production responses. Helmet applies the other default security headers. The
local CRA proxy remains HTTP for development only.

The approved acceptance criterion is "Security scan shows no plaintext
application traffic." The automated transport tests exercise application
rejection, trusted-proxy handling, CORS, security headers, and TLS server
configuration. They do not perform a live TLS handshake or scan a deployed
endpoint; run TC-SEC-01 against the configured production deployment before
recording the criterion as verified.
---

## Requirements Traceability

| Req ID | Requirement | Status |
|--------|------------|--------|
| SAM-F-001 | Authenticate users with username + password | ✅ Implemented |
| SAM-SR-002 | Passwords stored as salted bcrypt hash | ✅ Implemented |
| SAM-SR-004 | Failed login attempts, attendance corrections, and administrative changes are audited (AC-SAM-SR-004; TC-AUD-01) | Implemented; see [docs/security-audit.md](docs/security-audit.md) |
| SAM-SR-001 | The system shall enforce HTTPS/TLS for all authenticated network communication. | Application enforcement implemented; deployment scan pending |
| SAM-NF-003 | Use HTTPS/TLS for authenticated traffic. | Application enforcement implemented; deployment scan pending |
| SAM-F-002 | RBAC middleware for protected routes | ✅ Implemented |
| SAM-F-003 | Faculty selects an assigned class and valid attendance date (TC-ATT-01) | ✅ Implemented |
| SAM-F-004 | Display current enrolled roster for the selected assigned class (TC-ATT-01) | ✅ Implemented |
| SAM-F-008 | Students view their own persisted attendance history by course and date (TC-STU-01; AC-SAM-F-008) | Implemented |
| SAM-F-007 | Authorized faculty corrects an existing attendance row; correction is timestamped (TC-ATT-04) | Implemented |
| SAM-NF-002 | 99.5% monthly availability excluding scheduled maintenance (AC-SAM-NF-002; TC-OPS-01) | Health/readiness checks and calculation helper implemented; production uptime requires external monitoring evidence |
| SAM-NF-006 | Retain audit records for at least one academic year or configured institutional period (TC-AUD-02) | Append-only database guards; automatic deletion disabled pending confirmation of institutional policy |

Availability measurement and the operational dependencies for SAM-NF-002 are documented in [docs/availability.md](docs/availability.md).

Security-relevant login, attendance-correction, and administrative audit behavior for SAM-SR-004 / TC-AUD-01 is documented in [docs/security-audit.md](docs/security-audit.md). The source SRS PDF and issue #39 differ on the printed requirement number; see the traceability note in that document.

---

## Dev Seed Credentials (local only)

| Username | Password | Role |
|----------|----------|------|
| admin_user | Admin@1234 | admin |
| faculty1 | Faculty@1234 | faculty |
| student1 | Student@1234 | student |
