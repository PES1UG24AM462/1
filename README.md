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
mysql -u root -p < database/seed.sql
```

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

## Production HTTPS/TLS (SAM-NF-003)

Production must terminate TLS either in this Node.js server or at the trusted
deployment proxy. The API rejects every request that Express does not recognize
as HTTPS with `426 HTTPS Required`; it never redirects requests containing
credentials or authenticated data. A TLS proxy must forward
`X-Forwarded-Proto: https`, and its exact IP address/CIDR must be listed in
`TRUSTED_PROXY_IPS`. Do not trust forwarded headers from arbitrary clients.

For direct TLS termination, provide deployment-managed certificate and private
key paths through `TLS_CERT_PATH` and `TLS_KEY_PATH`; the server requires TLS
1.2 or newer. Never place certificates or private keys in source control. For
proxy termination, leave both paths unset and configure the proxy to accept only
modern TLS. Set `ALLOWED_ORIGINS` to the comma-separated HTTPS origins used by
the production frontend. HSTS (`max-age=31536000`) is sent only on secure
production responses. The local CRA proxy remains HTTP for development only.

---

## Requirements Traceability

| Req ID | Requirement | Status |
|--------|------------|--------|
| SAM-F-001 | Authenticate users with username + password | ✅ Implemented |
| SAM-SR-002 | Passwords stored as salted bcrypt hash | ✅ Implemented |
| SAM-SR-004 | Login success/failure recorded in audit log | ✅ Implemented |
| SAM-NF-003 | HTTPS/TLS enforced (via Helmet + proxy) | ✅ Implemented |
| SAM-F-002 | RBAC middleware for protected routes | ✅ Implemented |
| SAM-F-003 | Faculty selects an assigned class and valid attendance date (TC-ATT-01) | ✅ Implemented |
| SAM-F-004 | Display current enrolled roster for the selected assigned class (TC-ATT-01) | ✅ Implemented |
| SAM-F-008 | Students view their own persisted attendance history by course and date (TC-STU-01; AC-SAM-F-008) | Implemented |
| SAM-F-007 | Authorized faculty corrects an existing attendance row; correction is timestamped (TC-ATT-04) | Implemented |

---

## Dev Seed Credentials (local only)

| Username | Password | Role |
|----------|----------|------|
| admin_user | Admin@1234 | admin |
| faculty1 | Faculty@1234 | faculty |
| student1 | Student@1234 | student |
