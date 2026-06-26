# 🏛️ Aaple Shasan — आपले शासन
### Government of Maharashtra · AI-Powered Decentralized Civic Platform
### Production-Ready Full-Stack Application — v1.0.0

---

## 🚀 Quick Start

### Option A — Docker (Recommended)
```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — fill in all CHANGE_ME values

# 2. One-command deploy
bash scripts/deploy.sh

# Platform is live at http://localhost
# API health: http://localhost/api/health
```

### Option B — Local Dev (no Docker)
```bash
# Prerequisites: Node 18+, PostgreSQL 14+, Redis 6+
bash scripts/dev.sh
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
```

### Default Credentials (CHANGE IN PRODUCTION)
| Role | Phone | Password |
|------|-------|----------|
| Super Admin | 9000000000 | Admin@123 |
| PWD Admin | 9000000001 | Admin@123 |
| NMC Admin | 9000000002 | Admin@123 |
| Demo Citizen | 9876543210 | Test@123 |

---

## 🏗️ Architecture Overview

```
aaple-shasan/
├── backend/                        # Node.js + Express API
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js         # PostgreSQL pool (pg)
│   │   │   ├── redis.js            # Redis client + cache helpers
│   │   │   └── logger.js           # Winston structured logging
│   │   ├── controllers/
│   │   │   ├── authController.js   # Register, Login (OTP+pwd), Aadhaar, JWT
│   │   │   └── proposalsController.js # Submit, Vote, Sanction, Reject, Revise
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT verify, role guards, Aadhaar check
│   │   │   ├── security.js         # Helmet, CORS, rate limiters, sanitize
│   │   │   ├── upload.js           # Multer + magic-byte file validation
│   │   │   └── validation.js       # Joi schemas for all endpoints
│   │   ├── routes/
│   │   │   └── index.js            # All routes: /auth, /proposals, /admin
│   │   ├── services/
│   │   │   ├── aiService.js        # Anthropic API + local keyword fallback
│   │   │   ├── notificationService.js  # DB notifications
│   │   │   ├── emailService.js     # Nodemailer + HTML templates
│   │   │   └── cronService.js      # Background jobs (OTP cleanup, DBT, etc.)
│   │   ├── utils/
│   │   │   └── socketEmitter.js    # Socket.IO helpers
│   │   ├── __tests__/
│   │   │   └── auth.test.js        # Jest unit + integration tests
│   │   └── server.js               # Express + Socket.IO + graceful shutdown
│   ├── Dockerfile
│   ├── jest.config.js
│   └── package.json
├── frontend/                       # React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── components/shared/
│   │   │   ├── Layout.jsx          # TopBar, Sidebar (Outlet-based routing)
│   │   │   └── ErrorBoundary.jsx   # React error boundary
│   │   ├── hooks/
│   │   │   └── useSocket.js        # Socket.IO client + real-time handlers
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx        # Login (OTP + password) + Register
│   │   │   ├── citizen/
│   │   │   │   ├── CitizenDashboard.jsx
│   │   │   │   ├── SubmitProposal.jsx  # AI pipeline animation
│   │   │   │   ├── CommunityFeed.jsx   # Vote + downvote critique flow
│   │   │   │   ├── MyProposals.jsx
│   │   │   │   ├── WalletPage.jsx
│   │   │   │   ├── NotificationsPage.jsx
│   │   │   │   └── ProfilePage.jsx     # Aadhaar verify + password change
│   │   │   └── admin/
│   │   │       ├── AdminDashboard.jsx  # Intake desk + AI dossier + sanction
│   │   │       ├── AdminUsers.jsx
│   │   │       ├── AdminAnalytics.jsx
│   │   │       ├── AdminAudit.jsx
│   │   │       └── AdminSettings.jsx
│   │   ├── store/
│   │   │   └── authStore.js        # Zustand persisted auth store
│   │   ├── utils/
│   │   │   └── api.js              # Axios + token refresh interceptor
│   │   └── styles/globals.css
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   └── nginx.conf                  # Rate limiting, SSL, WebSocket proxy
├── scripts/
│   ├── init.sql                    # Full PostgreSQL schema + seed data
│   ├── deploy.sh                   # Production deployment script
│   ├── dev.sh                      # Local development launcher
│   └── backup.sh                   # Database backup with rotation
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔐 Security Implementation

| Layer | What's Implemented |
|---|---|
| **Transport** | HTTPS enforced via Nginx, HSTS preload, TLS 1.2/1.3 only |
| **Headers** | Helmet.js: CSP, X-Frame-Options DENY, noSniff, referrer policy |
| **Auth** | JWT (15min access) + rotating httpOnly refresh tokens (7d) |
| **OTP** | 6-digit, SHA-256 hashed, 10-min expiry, 5-attempt lockout |
| **Passwords** | bcrypt cost-12, enforced complexity (uppercase + number) |
| **Rate Limiting** | Global 100/15min · Auth 10/15min · OTP 2/min · Submissions 3/day |
| **Account Security** | Locks after 5 failed logins, auto-unlocks after 24h via cron |
| **Aadhaar** | SHA-256 hash only — raw 12-digit number never persisted |
| **Session Revocation** | Redis blacklist for JWT JTI (instant logout across devices) |
| **SQL Injection** | 100% parameterized queries via pg pool — no raw string queries |
| **XSS** | Input sanitized via sanitize-html + CSP headers prevent execution |
| **CSRF** | SameSite=Strict cookies + CORS allowlist |
| **File Uploads** | MIME type + magic byte double-validation, extension allowlist, 10MB limit |
| **Audit Logging** | All sensitive actions logged with user, IP, timestamp, response code |
| **CORS** | Origin allowlist-based, credentials mode |

---

## 🤖 AI Pipeline

Powered by **Anthropic Claude API** (claude-sonnet-4-6) with local keyword fallback:

```
Citizen submits proposal text (English/Marathi/Hindi)
         ↓
[Step 1] Profanity & harm filter
         ↓
[Step 2] Geospatial extraction (region, ward, district)
         ↓
[Step 3] Intent classification → PWD / NMC / GramPanchayat / RevenueDeskTahsildar / SDMDesk
         ↓
[Step 4] Confidence scoring + budget estimate + executive summary
         ↓
AI-compiled dossier available to admin at threshold
```

**Fallback:** If Anthropic API is unavailable, a local keyword classifier covers Marathi + Hindi + English keywords for all 5 departments.

---

## 💰 Civic Royalty Flow

```
1. Citizen submits proposal (requires Aadhaar verification)
         ↓
2. AI classifies + routes to department
         ↓
3. Community voting (50 upvotes = democratic threshold)
   - Downvotes require mandatory constructive critique
         ↓
4. AI auto-compiles executive dossier for admin desk
         ↓
5. Department officer reviews dossier → Sanctions / Revises / Rejects
         ↓
6. On Sanction: PostgreSQL transaction atomically:
   - Updates proposal status = 'sanctioned'
   - Creates DBT transaction record (status: processing)
   - Credits citizen wallet +₹1,000
         ↓
7. Cron job processes DBT → calls PFMS webhook → marks 'credited'
         ↓
8. Real-time push via Socket.IO → citizen sees wallet update instantly
         ↓
9. Email + in-app notification sent to citizen
```

---

## 🔑 Complete API Reference

### Authentication
```
POST /api/auth/register/otp      — Send registration OTP
POST /api/auth/register/verify   — Verify OTP + create account
POST /api/auth/login/otp         — Send login OTP
POST /api/auth/login/verify      — Verify OTP → access + refresh tokens
POST /api/auth/login/password    — Password login → tokens
POST /api/auth/refresh           — Rotate access token (httpOnly cookie)
POST /api/auth/logout            — Revoke tokens
GET  /api/auth/me                — Current user profile
POST /api/auth/aadhaar/verify    — Link & verify Aadhaar
POST /api/auth/password/change   — Change password (revokes all sessions)
PATCH /api/auth/profile          — Update profile fields
```

### Proposals (Citizen)
```
GET  /api/proposals              — Public feed (filter: dept, status, sort, search)
POST /api/proposals              — Submit proposal (requires Aadhaar, multipart/form-data)
GET  /api/proposals/stats        — Dashboard stats for current user
GET  /api/proposals/my           — My submitted proposals
GET  /api/proposals/:id          — Single proposal detail
POST /api/proposals/:id/vote     — Upvote / Downvote (downvote requires critique)
DEL  /api/proposals/:id          — Withdraw own proposal (if not sanctioned)
```

### Proposals (Admin)
```
GET  /api/proposals/admin/list   — Filtered admin intake queue
GET  /api/proposals/:id/dossier  — AI-compiled executive dossier
POST /api/proposals/:id/sanction — Sanction + trigger DBT
POST /api/proposals/:id/revise   — Request citizen revision
POST /api/proposals/:id/reject   — Reject with reason
```

### Notifications
```
GET   /api/notifications         — Paginated notification list
PATCH /api/notifications/:id/read — Mark one as read
PATCH /api/notifications/read-all — Mark all as read
```

### Wallet
```
GET /api/wallet                  — Balance + DBT transaction history
```

### Admin
```
GET   /api/admin/users              — Paginated user list (filter: role, search)
PATCH /api/admin/users/:id/toggle-lock — Lock/unlock account
PATCH /api/admin/users/:id/deactivate  — Deactivate + revoke all sessions
POST  /api/admin/users/admin         — Create admin account (superadmin only)
GET   /api/admin/audit-logs          — Audit trail with filters
GET   /api/admin/system/config       — System configuration
PATCH /api/admin/system/config/:key  — Update config value
GET   /api/admin/system/stats        — Platform-wide statistics
GET   /api/admin/dbt/transactions    — DBT transaction overview
```

---

## 🐳 Docker Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| postgres | postgres:16-alpine | 5432 | Primary database |
| redis | redis:7-alpine | 6379 | Sessions, cache, rate limiting |
| backend | node:20-alpine (custom) | 5000 | REST API + WebSocket |
| frontend | nginx:alpine (custom) | 3000 | React SPA |
| nginx | nginx:alpine | 80/443 | Reverse proxy, SSL termination |

---

## ⚙️ Background Jobs (Cron)

| Schedule | Job |
|----------|-----|
| Every 5 min | Clean expired OTPs, warm config cache |
| Every 15 min | Process pending DBT transactions |
| Every 30 min | Purge expired refresh tokens |
| Every 1 hour | Recalculate proposal voting thresholds |
| Every 6 hours | Auto-unlock accounts locked > 24h |
| Daily 00:00 | Purge audit logs > 90 days |
| Daily 02:00 | Purge old rate-limit logs |

---

## 🧪 Running Tests

```bash
cd backend
npm test              # Run all tests
npm test -- --coverage # With coverage report
```

---

## 📦 Production Checklist

- [ ] Copy `.env.example` → `.env`, fill **all** `CHANGE_ME` values
- [ ] Generate strong JWT secrets: `openssl rand -base64 64`
- [ ] Replace self-signed SSL cert with Let's Encrypt: `certbot certonly --nginx`
- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Configure real SMS provider (MSG91/Twilio) for OTP delivery
- [ ] Configure SMTP for email notifications
- [ ] Add Anthropic API key for AI classification
- [ ] Configure DBT/PFMS webhook URL for real disbursements
- [ ] Set up log rotation and monitoring (e.g. Datadog, Grafana)
- [ ] Configure automated backups: `crontab -e` → `0 2 * * * /path/backup.sh`
- [ ] Change default admin password immediately after first login
- [ ] Configure firewall: only expose ports 80/443 publicly

---

*Built for the Government of Maharashtra · Aaple Shasan AI Civic Initiative*
*ISO 27001 Security Framework · PDPB Compliant Data Handling*
