# CLAUDE.md — Project Brief: ReviewDrop (Working Title)
## Client Feedback & Website Proofing SaaS

> **Read this entire file before touching any code.**
> This is the single source of truth for every agent, every session, every task.
> If something contradicts this file, this file wins.

---

## 1. WHAT WE ARE BUILDING

A web-based SaaS tool that lets freelance web designers share a link with their clients. The client clicks anywhere on a live website preview to drop a pinned comment. The designer gets organised, in-context feedback — without the client ever creating an account.

**The one-line pitch:**
> "Client feedback on your website drafts, without the $79/month or the login friction."

**The trigger event that created this opportunity:**
Markup.io (previously $29/month) raised its only paid plan to $79/month in January 2025 — a 172% increase that hit existing customers, removed the free tier, and triggered a mass public exodus. Over 150 agency owners in a single Facebook group (The Admin Bar) are actively hunting for alternatives. We are building that alternative.

**The product does three things and only three things at v1.0:**
1. Renders a staging/preview website inside a canvas
2. Lets clients drop pinned comments anywhere on the page (no login)
3. Gives the designer an organised, filterable, exportable comment dashboard

---

## 2. THE USER

### Primary user (the one who pays): Freelance web designer or small studio (2–5 people)
- Builds websites in WordPress, Webflow, Showit, Squarespace, or custom code
- Sends staging links to clients for review and gets feedback via email/WhatsApp (fragmented, vague, slow)
- Was paying Markup.io $29/month and is now either paying $79 or actively looking for something else
- Technically competent but time-poor
- Pays for tools that save them hours; allergic to complex setup and per-seat pricing
- Often UK or US based, solo or small team
- Earns £25,000–£80,000/year freelancing

### Secondary user (the one who uses it for free): The designer's client
- Non-technical; does not understand web dev
- Will abandon any flow that requires account creation
- Accesses the tool via a shared link only
- Uses it once or twice per project, then disappears
- Their experience is the product — if they find it confusing, the designer churns

---

## 3. CORE VALUE PROPOSITIONS (in priority order)

1. **No client login** — share a link, client clicks to comment, done
2. **Flat, fair pricing** — not $79/month; no per-seat nonsense
3. **Clean status tracking** — Open / In Progress / Resolved, filterable, searchable
4. **It just works** — reliable rendering, fast load, no setup friction for the designer
5. **Built for solo designers** — not a bloated enterprise tool

---

## 4. WHAT WE ARE NOT BUILDING (v1.0 hard limits)

Do not build any of these. If a task asks you to build one of these, flag it and stop.

- ❌ Video / screen-recording feedback
- ❌ Live CSS / content editing on the reviewed site
- ❌ PM integrations (Asana, Jira, ClickUp, Linear)
- ❌ Built-in Kanban board
- ❌ PDF / image / video asset review
- ❌ Team roles / permissions / multi-seat billing
- ❌ White-label / custom domain branding
- ❌ @-mentions or tagging in comments
- ❌ Mobile app (iOS or Android)
- ❌ Browser extension
- ❌ AI features of any kind
- ❌ Real-time collaborative cursors / live sync
- ❌ Two-way integrations with any third-party tool

Everything above is v2+. Ship the narrow core first.

---

## 5. TECH STACK (canonical — do not deviate without flagging)

### Frontend
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 18 | Functional components only, no class components |
| Build tool | Vite | Fast HMR, native ESM |
| Language | TypeScript (strict mode) | All files `.tsx` or `.ts` |
| Styling | Tailwind CSS v3 | Utility-first; no custom CSS unless Tailwind can't do it |
| Component library | shadcn/ui | Copy components into `/components/ui/`, never import from node_modules |
| State (server) | TanStack Query v5 | All API calls go through Query; no raw fetch in components |
| State (local) | Zustand | Only for global UI state (modals, active project, user session) |
| Forms | React Hook Form + Zod | All forms validated with Zod schemas |
| Routing | React Router v6 | File-based convention in `/pages/` |
| HTTP client | Axios | Configured instance in `/lib/api.ts` with base URL + auth header injection |
| Icons | Lucide React | Consistent icon set throughout |
| Toast notifications | Sonner | Lightweight, works with shadcn |
| Date formatting | date-fns | No moment.js |

### Backend
| Concern | Choice | Notes |
|---|---|---|
| Framework | FastAPI (Python 3.11+) | Async throughout; use `async def` for all route handlers |
| ORM | SQLAlchemy 2.0 (async) | Use `AsyncSession`; never use sync session |
| Migrations | Alembic | Every DB change needs a migration; never alter tables manually |
| Validation | Pydantic v2 | All request/response models are Pydantic BaseModel |
| Auth | JWT (python-jose) + fastapi-users | Access token (15min expiry) + refresh token (7 days) |
| Password hashing | bcrypt via passlib | Never store plaintext passwords |
| Background tasks | FastAPI BackgroundTasks | For email sending; Celery only if task queue becomes complex |
| CORS | fastapi middleware | Configured in `main.py`; only allow frontend origin |
| Environment | python-dotenv + Pydantic Settings | All config from `.env`; never hardcode secrets |

### Database
| Concern | Choice | Notes |
|---|---|---|
| Database | PostgreSQL 15+ | Managed instance (Railway or Supabase free tier in dev) |
| Connection pooling | asyncpg | Driver for async SQLAlchemy |
| Schema conventions | snake_case | All table names plural (e.g. `projects`, `comments`, `users`) |
| IDs | UUID v4 | Never auto-increment integers for public-facing IDs |
| Timestamps | `created_at`, `updated_at` | On every table; `updated_at` auto-updates via SQLAlchemy event |
| Soft deletes | `deleted_at` nullable | Never hard-delete records |

### Website Rendering (the critical component)
| Concern | Choice | Notes |
|---|---|---|
| Approach | Server-side proxy (v1) | FastAPI route fetches target site, strips `X-Frame-Options` and CSP `frame-ancestors`, rewrites relative URLs to absolute, serves via iframe |
| Screenshots | Playwright (Python) | Chromium only; on-demand (not always running); scale-to-zero |
| Screenshot storage | Cloudflare R2 | S3-compatible; zero egress fees; Python SDK: `boto3` with R2 endpoint |
| Proxy endpoint | `GET /api/proxy?url=<encoded_url>` | Auth-gated; only processes URLs belonging to a logged-in user's project |
| Security | Block private/internal IPs (SSRF protection) | Use `ipaddress` module to reject RFC-1918 ranges before proxying |
| Fallback | If proxy fails → serve screenshot | Always capture screenshot on project creation as fallback |

### Infrastructure & Hosting
| Service | Choice | Notes |
|---|---|---|
| Frontend hosting | Vercel | Free tier; auto-deploys from `main` branch |
| Backend hosting | Render (Standard, $25/mo) | 2GB RAM needed for Playwright; auto-deploy from `main` |
| Database | Railway Postgres ($5–10/mo) | Or Supabase free tier in dev |
| File storage | Cloudflare R2 | Free: 10GB storage + 1M Class A ops/month |
| Email | Resend | Free: 3,000 emails/month; simple API |
| Billing | Stripe | Checkout Sessions + Customer Portal + Webhooks |
| DNS / CDN | Cloudflare | Free tier; proxy all traffic |
| Monitoring | Sentry (free tier) | Error tracking on both frontend and backend |
| Analytics | Plausible (or self-hosted Umami) | Privacy-respecting; no cookie banner needed |

### Dev Environment
- **Package manager:** pnpm (frontend), pip + venv (backend)
- **Monorepo structure:** `/frontend` and `/backend` in same repo
- **Docker:** `docker-compose.yml` for local dev (Postgres + backend + frontend)
- **Linting:** ESLint + Prettier (frontend); Ruff + Black (backend)
- **Git conventions:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branch strategy:** `main` (production), `dev` (staging), feature branches off `dev`

---

## 6. PROJECT STRUCTURE

```
reviewdrop/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn components (Button, Input, Badge, etc.)
│   │   │   ├── layout/          # Sidebar, Header, AppShell
│   │   │   ├── dashboard/       # ProjectCard, CommentList, StatusBadge
│   │   │   ├── canvas/          # ReviewCanvas, PinOverlay, CommentPin, CommentThread
│   │   │   └── shared/          # LoadingSpinner, EmptyState, ErrorBoundary
│   │   ├── pages/
│   │   │   ├── auth/            # Login.tsx, Register.tsx, ForgotPassword.tsx
│   │   │   ├── dashboard/       # Dashboard.tsx (project list)
│   │   │   ├── project/         # ProjectView.tsx (per-project comments)
│   │   │   ├── canvas/          # CanvasView.tsx (the review interface)
│   │   │   ├── review/          # ReviewPage.tsx (public guest view — no auth)
│   │   │   ├── settings/        # Settings.tsx, Billing.tsx
│   │   │   └── landing/         # Landing.tsx (marketing page)
│   │   ├── lib/
│   │   │   ├── api.ts           # Axios instance + interceptors
│   │   │   ├── auth.ts          # Token storage + refresh logic
│   │   │   └── utils.ts         # cn(), formatDate(), truncate()
│   │   ├── hooks/
│   │   │   ├── useProjects.ts   # TanStack Query hooks for projects
│   │   │   ├── useComments.ts   # TanStack Query hooks for comments
│   │   │   └── useAuth.ts       # Auth state hook
│   │   ├── stores/
│   │   │   └── uiStore.ts       # Zustand: active project, modal states
│   │   ├── types/
│   │   │   └── index.ts         # All shared TypeScript types/interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.py      # /auth/login, /auth/register, /auth/refresh
│   │   │   │   ├── projects.py  # CRUD for projects
│   │   │   │   ├── reviews.py   # Create review link, get review by slug
│   │   │   │   ├── comments.py  # CRUD for comments + status updates
│   │   │   │   ├── proxy.py     # GET /proxy — the rendering proxy
│   │   │   │   ├── screenshots.py # Playwright screenshot endpoint
│   │   │   │   ├── billing.py   # Stripe checkout, portal, webhooks
│   │   │   │   └── export.py    # PDF/CSV export
│   │   │   └── deps.py          # FastAPI dependencies (get_current_user, get_db)
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings (reads .env)
│   │   │   ├── security.py      # JWT creation/verification, password hashing
│   │   │   └── database.py      # AsyncEngine, AsyncSession, Base
│   │   ├── models/
│   │   │   ├── user.py          # User ORM model
│   │   │   ├── project.py       # Project ORM model
│   │   │   ├── review.py        # Review (shareable link) ORM model
│   │   │   ├── comment.py       # Comment ORM model
│   │   │   └── guest.py         # GuestSession ORM model
│   │   ├── schemas/
│   │   │   ├── user.py          # UserCreate, UserRead, UserUpdate
│   │   │   ├── project.py       # ProjectCreate, ProjectRead, ProjectUpdate
│   │   │   ├── review.py        # ReviewCreate, ReviewRead
│   │   │   ├── comment.py       # CommentCreate, CommentRead, CommentUpdate
│   │   │   └── billing.py       # CheckoutSession, PortalSession
│   │   ├── services/
│   │   │   ├── proxy_service.py       # URL fetching, header stripping, URL rewriting
│   │   │   ├── screenshot_service.py  # Playwright orchestration
│   │   │   ├── email_service.py       # Resend integration
│   │   │   ├── storage_service.py     # R2 upload/download
│   │   │   └── stripe_service.py      # Stripe API calls
│   │   └── main.py              # FastAPI app init, middleware, router includes
│   ├── alembic/
│   │   ├── versions/            # Migration files
│   │   └── env.py
│   ├── tests/
│   │   ├── test_auth.py
│   │   ├── test_projects.py
│   │   ├── test_comments.py
│   │   └── test_proxy.py
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
│
├── docker-compose.yml
├── .gitignore
├── README.md
└── CLAUDE.md                    # This file
```

---

## 7. DATABASE SCHEMA

### users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
email         VARCHAR(255) UNIQUE NOT NULL
hashed_password VARCHAR(255) NOT NULL
full_name     VARCHAR(255)
plan          VARCHAR(50) DEFAULT 'free'  -- 'free' | 'pro' | 'studio'
stripe_customer_id VARCHAR(255)
stripe_subscription_id VARCHAR(255)
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

### projects
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id       UUID REFERENCES users(id) NOT NULL
name          VARCHAR(255) NOT NULL
client_name   VARCHAR(255)
url           TEXT NOT NULL           -- the staging URL being reviewed
thumbnail_url TEXT                    -- R2 URL of screenshot
status        VARCHAR(50) DEFAULT 'active'  -- 'active' | 'archived'
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

### reviews
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id    UUID REFERENCES projects(id) NOT NULL
slug          VARCHAR(12) UNIQUE NOT NULL  -- random string for share URL
name          VARCHAR(255)                 -- e.g. "Round 1 Review"
is_active     BOOLEAN DEFAULT true
expires_at    TIMESTAMPTZ                  -- optional expiry
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
```

### guest_sessions
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
review_id     UUID REFERENCES reviews(id) NOT NULL
display_name  VARCHAR(255) NOT NULL        -- captured on first comment
email         VARCHAR(255)                 -- optional
session_token VARCHAR(255) UNIQUE NOT NULL -- stored in client localStorage
created_at    TIMESTAMPTZ DEFAULT now()
```

### comments
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
review_id     UUID REFERENCES reviews(id) NOT NULL
parent_id     UUID REFERENCES comments(id)  -- NULL = top-level; set = reply
author_user_id UUID REFERENCES users(id)   -- set if designer commented
author_guest_id UUID REFERENCES guest_sessions(id)  -- set if client commented
body          TEXT NOT NULL
status        VARCHAR(50) DEFAULT 'open'   -- 'open' | 'in_progress' | 'resolved'
page_url      TEXT NOT NULL               -- exact page URL where comment was made
-- Pin coordinates (hybrid system)
pin_x_percent FLOAT                       -- x% within target element
pin_y_percent FLOAT                       -- y% within target element
element_selector TEXT                     -- CSS selector path to nearest element
viewport_width INT                        -- viewport width at time of comment
viewport_height INT
pin_x_absolute INT                        -- fallback absolute coordinates
pin_y_absolute INT
screenshot_url TEXT                       -- R2 URL of auto-captured screenshot
-- Client metadata (for developers)
browser_name  VARCHAR(100)
browser_version VARCHAR(50)
os_name       VARCHAR(100)
screen_width  INT
screen_height INT
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

---

## 8. API ROUTES (canonical contract)

All routes prefixed `/api/v1/`. All responses are JSON. Auth routes use Bearer JWT in `Authorization` header.

### Auth
```
POST   /auth/register          body: {email, password, full_name}
POST   /auth/login             body: {email, password} → {access_token, refresh_token}
POST   /auth/refresh           body: {refresh_token} → {access_token}
POST   /auth/forgot-password   body: {email}
POST   /auth/reset-password    body: {token, new_password}
GET    /auth/me                → UserRead
```

### Projects
```
GET    /projects               → ProjectRead[]  (current user's projects)
POST   /projects               body: ProjectCreate → ProjectRead
GET    /projects/{id}          → ProjectRead
PATCH  /projects/{id}          body: ProjectUpdate → ProjectRead
DELETE /projects/{id}          → 204
```

### Reviews (shareable links)
```
POST   /projects/{id}/reviews  body: ReviewCreate → ReviewRead (includes share URL)
GET    /projects/{id}/reviews  → ReviewRead[]
PATCH  /reviews/{id}           body: {is_active, name, expires_at}
DELETE /reviews/{id}           → 204

-- Public (no auth, uses slug)
GET    /r/{slug}               → ReviewRead + ProjectRead (for guest canvas)
POST   /r/{slug}/session       body: {display_name, email?} → {session_token}
```

### Comments
```
-- Designer (authenticated)
GET    /projects/{id}/comments          → CommentRead[] (all comments, filterable)
GET    /reviews/{id}/comments           → CommentRead[]
PATCH  /comments/{id}                  body: {status} → CommentRead
POST   /comments/{id}/reply            body: {body} → CommentRead
DELETE /comments/{id}                  → 204

-- Guest (session_token in header X-Guest-Token)
POST   /r/{slug}/comments              body: CommentCreate → CommentRead
GET    /r/{slug}/comments              → CommentRead[] (read own + see others' pins)
```

### Proxy & Screenshots
```
GET    /proxy        ?url=<encoded>     → Proxied HTML (auth-gated, SSRF-protected)
POST   /screenshots  body: {url}        → {screenshot_url} (triggers Playwright)
```

### Billing
```
POST   /billing/checkout       body: {plan, interval} → {checkout_url}
POST   /billing/portal         → {portal_url}
POST   /billing/webhook        body: Stripe event (raw body, signature verified)
```

### Export
```
GET    /projects/{id}/export?format=pdf   → PDF file
GET    /projects/{id}/export?format=csv   → CSV file
```

---

## 9. KEY BUSINESS LOGIC RULES

### Plan limits (enforced in backend, not just frontend)
| Feature | Free | Pro (~£15/mo) | Studio (~£39/mo) |
|---|---|---|---|
| Active projects | 2 | Unlimited | Unlimited |
| Reviews per project | 1 | Unlimited | Unlimited |
| Guest commenters | Unlimited | Unlimited | Unlimited |
| Export (PDF/CSV) | ❌ | ✅ | ✅ |
| Branding watermark | ✅ (shown) | ❌ | ❌ |
| Team members | 1 | 1 | 3 |

### Comment coordinates
- Always store both the CSS selector path AND the absolute pixel coordinates
- Always capture a Playwright screenshot at time of commenting and store to R2
- On replay: try selector first → fallback to scaled absolute → fallback to screenshot
- Never error silently on coordinate mismatch; always show the screenshot fallback

### Guest sessions
- `session_token` is a random 32-char hex string (secrets.token_hex(16))
- Stored in browser localStorage under key `rd_guest_{review_slug}`
- Passed as `X-Guest-Token` header on all guest requests
- Name/email captured once per review, stored against GuestSession
- Guest can see all comments on the review but can only edit their own

### Share links
- Slug is 8 random alphanumeric characters (nanoid)
- Never expose internal UUIDs in share URLs
- Expired reviews return 410 Gone
- Inactive reviews return 403 Forbidden

### Proxy security
- Only proxy URLs that belong to a project owned by the authenticated user
- Block all RFC-1918 / loopback IPs before making external requests
- Strip `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` from proxied responses
- Rewrite all relative URLs in proxied HTML to absolute using the target origin
- Rewrite `src`, `href`, `action`, `srcset`, `data-src`, and inline CSS `url()` references
- Set `Content-Security-Policy: sandbox` on the proxy response to prevent JS execution from reaching outside the iframe
- Rate-limit proxy endpoint: 60 requests/minute per user

---

## 10. FRONTEND DESIGN SYSTEM

### Colour palette
```css
--brand-primary: #6366F1      /* Indigo — primary buttons, active states, pins */
--brand-primary-hover: #4F46E5
--background: #FAFAFA          /* Off-white page background */
--surface: #FFFFFF             /* Cards, panels */
--surface-elevated: #F4F4F5    /* Hover states, secondary surfaces */
--border: #E4E4E7              /* Default borders */
--text-primary: #09090B        /* Headings, body */
--text-secondary: #71717A      /* Labels, metadata */
--text-muted: #A1A1AA          /* Placeholders, disabled */
--status-open: #EF4444         /* Red — open comments */
--status-in-progress: #F59E0B  /* Amber — in progress */
--status-resolved: #22C55E     /* Green — resolved */
--pin-dot: #6366F1             /* Numbered pin circles */
--destructive: #EF4444
--success: #22C55E
```

### Typography
- **Display/headings:** Inter (via Google Fonts or Fontsource)
- **Body:** Inter, 14px base, 1.5 line height
- **Monospace (metadata, URLs):** JetBrains Mono or `font-mono` (Tailwind)
- **Scale:** 12 / 14 / 16 / 20 / 24 / 32 / 40px (Tailwind defaults)

### Key UI components (describe behaviour, not just style)

**ProjectCard** — shows thumbnail screenshot, project name, client name, open-comment count (red badge), last activity date, quick-action menu (archive, delete, copy share link).

**StatusBadge** — pill with coloured dot. Three variants: `open` (red), `in_progress` (amber), `resolved` (green). Always shows lowercase text.

**CommentPin** — absolutely positioned circle over the canvas iframe. Shows comment number (1, 2, 3…). Indigo when open, amber when in progress, green when resolved. Clicking expands CommentThread.

**CommentThread** — popover anchored to pin. Shows: commenter name + initials avatar, timestamp, comment body, status dropdown, reply box, screenshot thumbnail (click to expand). Replies are indented below.

**ReviewCanvas** — the main workspace. Top bar has: project name, page URL breadcrumb, Browse/Comment mode toggle (keyboard: `B` / `C`), device size switcher (desktop/tablet/mobile widths), share button. Left sidebar: page list with comment counts. Right sidebar: comment list for current page, filterable by status.

**GuestCanvas** — the public review view. Same canvas but: no sidebar, no auth, floating bottom bar with "Click anywhere to comment" instruction that fades after first comment. Name capture modal on first comment.

### UX rules
- Comment mode freezes iframe interaction (pointer-events: none on iframe, pointer-events: all on pin overlay)
- Browse mode re-enables iframe interaction; pins are visible but don't block clicks
- Pins are numbered sequentially per-page
- Resolved pins are greyed out and hidden by default; "Show resolved" toggle reveals them
- All status changes are optimistic (update UI immediately, roll back on error)
- Loading states use skeleton screens, never spinners on content areas
- Empty states are actionable ("No comments yet — share the link with your client")
- All destructive actions require a confirmation dialog
- Keyboard shortcuts documented in a `?` help modal

---

## 11. EMAIL TEMPLATES (sent via Resend)

### To designer:
1. **new_comment** — "Your client [Name] left [N] new comment(s) on [Project Name]" — sent max once per hour (batched)
2. **review_summary** — daily digest of all open comments across all projects
3. **welcome** — on registration
4. **subscription_activated** — on Stripe checkout success

### To guest (client):
1. **comment_confirmation** — "Thanks, [Name] — your feedback on [Project Name] was received"
2. **comment_replied** — "The designer replied to your comment on [Project Name]" — includes magic link back to exact comment
3. **comment_resolved** — "Your feedback has been resolved" — includes link to review

All emails: plain HTML, minimal design, text-heavy, no heavy images. Use Resend's React Email templates if possible.

---

## 12. STRIPE BILLING SETUP

### Products to create in Stripe Dashboard:
- **Pro Monthly** — £15/mo (`price_pro_monthly`)
- **Pro Annual** — £144/yr (`price_pro_annual`) — saves ~20% vs monthly
- **Studio Monthly** — £39/mo (`price_studio_monthly`)
- **Studio Annual** — £374/yr (`price_studio_annual`)

### Webhook events to handle:
```
checkout.session.completed       → activate subscription, update user.plan
customer.subscription.updated    → update user.plan (upgrades/downgrades)
customer.subscription.deleted    → downgrade to free
invoice.payment_failed           → send failed-payment email, mark account at-risk
invoice.payment_succeeded        → renew subscription, confirm active
```

### Implementation rules:
- Always verify webhook signature (`stripe.construct_event`)
- Process webhooks idempotently (check if already processed using event ID)
- Never trust frontend for plan status — always check `user.plan` from DB
- Customer Portal handles all self-serve cancellations — never build a custom cancel flow

---

## 13. SECURITY CHECKLIST

Every PR that touches any of these areas must confirm these are in place:

- [ ] All API endpoints (except `/auth/*` and `/r/{slug}/*`) require valid JWT
- [ ] Guest endpoints require valid `X-Guest-Token` matching the review slug
- [ ] SSRF protection on proxy: block RFC-1918 ranges (10.x, 172.16-31.x, 192.168.x, 127.x)
- [ ] Rate limiting on proxy (60 req/min per user) and auth endpoints (10 req/min per IP)
- [ ] Stripe webhook signature verified before processing
- [ ] File uploads (screenshots) validated: only JPEG/PNG, max 5MB, scanned for path traversal
- [ ] All SQL via SQLAlchemy ORM — no raw string interpolation in queries
- [ ] Passwords hashed with bcrypt, never stored plaintext
- [ ] Sensitive config (API keys, DB URL, JWT secret) only from environment variables
- [ ] CORS restricted to frontend origin only
- [ ] HTTPS enforced (Cloudflare handles this)
- [ ] Content-Security-Policy header on all app responses

---

## 14. TESTING STANDARDS

- **Unit tests:** all services in `backend/tests/` using pytest + pytest-asyncio
- **API tests:** use `httpx.AsyncClient` with FastAPI's test client
- **Frontend tests:** Vitest for utility functions; no UI component tests at v1
- **Coverage target:** 70%+ on backend services (especially proxy_service, stripe_service)
- **Test database:** separate Postgres DB, reset between test runs
- **Never test against production Stripe** — use test mode keys only

---

## 15. ENVIRONMENT VARIABLES (`.env.example`)

```bash
# App
APP_NAME=ReviewDrop
APP_ENV=development                  # development | staging | production
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/reviewdrop

# Auth
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=reviewdrop-screenshots
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_MONTHLY_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...

# Resend
RESEND_API_KEY=re_...
EMAIL_FROM=hello@reviewdrop.io

# Sentry
SENTRY_DSN=https://...
```

---

## 16. BUILD ORDER (critical path — follow this sequence)

Build features in this exact order. Do not skip ahead.

```
Phase 1 — Foundation (Weeks 1–2)
├── [1] Repo setup: monorepo, Docker, linting, git hooks
├── [2] Database: schema + Alembic migrations for all tables
├── [3] Auth: register, login, JWT, refresh, /me endpoint
└── [4] Frontend auth: login page, register page, protected routes

Phase 2 — The Hard Part (Weeks 3–5) ← CRITICAL PATH
├── [5] Proxy service: fetch URL, strip headers, rewrite relative URLs
├── [6] Proxy endpoint: auth-gated, SSRF-protected, rate-limited
├── [7] Frontend iframe wrapper: load proxied URL, handle failures
└── [8] Screenshot service: Playwright capture → R2 upload

Phase 3 — Core Product (Weeks 6–10)
├── [9]  Projects CRUD: backend routes + frontend pages
├── [10] Reviews/share links: create, slug generation, guest access
├── [11] Guest session: token generation, name capture flow
├── [12] Pin overlay: click-to-pin in Comment mode, coordinate capture
├── [13] Comment storage: create comment with coordinates + screenshot
├── [14] Comment display: pins rendered over iframe, numbered
├── [15] Comment threads: expand pin → thread → reply
└── [16] Status management: Open/In Progress/Resolved + filters

Phase 4 — Completeness (Weeks 11–14)
├── [17] Designer dashboard: project list, comment inbox
├── [18] Email notifications: new comment, reply, daily digest (Resend)
├── [19] Stripe billing: checkout, portal, webhooks, plan enforcement
└── [20] Export: PDF + CSV of comments per project

Phase 5 — Launch Prep (Weeks 15–16)
├── [21] Landing page: marketing page at /
├── [22] Pricing page
├── [23] Error handling + loading states audit
├── [24] Performance: lighthouse audit, lazy loading, caching
├── [25] Sentry integration (frontend + backend)
└── [26] Deploy: Vercel (frontend) + Render (backend) + Railway (DB)
```

---

## 17. AGENT TASK ASSIGNMENT GUIDE

When assigning tasks to Claude Code or Cowork agents, use these scoped task descriptions and always include the relevant section numbers from this file.

| Agent | Task scope | Files to touch | Context to include |
|---|---|---|---|
| **Agent: DB & Models** | Build database schema + all ORM models + Alembic migrations | `backend/app/models/*`, `backend/alembic/versions/*` | Sections 7, 5 (DB choices) |
| **Agent: Auth** | JWT auth, register/login endpoints, password reset | `backend/app/api/routes/auth.py`, `backend/app/core/security.py` | Sections 8 (Auth routes), 5 (Auth stack), 13 (Security) |
| **Agent: Proxy** | The proxy service — fetch, strip headers, rewrite URLs, SSRF protection | `backend/app/services/proxy_service.py`, `backend/app/api/routes/proxy.py` | Sections 9 (Proxy security rules), 5 (Rendering), 16 (Phase 2) |
| **Agent: Screenshots** | Playwright screenshot capture, R2 upload, async orchestration | `backend/app/services/screenshot_service.py`, `backend/app/services/storage_service.py` | Section 5 (Playwright + R2), Section 7 (comments.screenshot_url) |
| **Agent: Projects API** | Projects CRUD endpoints + schemas | `backend/app/api/routes/projects.py`, `backend/app/schemas/project.py` | Sections 7, 8, 9 |
| **Agent: Comments API** | Comments CRUD, status updates, replies, guest comments | `backend/app/api/routes/comments.py`, `backend/app/schemas/comment.py` | Sections 7, 8, 9 (comment coordinate rules) |
| **Agent: Billing** | Stripe checkout, portal, webhook handlers | `backend/app/services/stripe_service.py`, `backend/app/api/routes/billing.py` | Sections 12, 9 (Plan limits), 15 (env vars) |
| **Agent: Email** | Resend email templates + sending logic | `backend/app/services/email_service.py` | Section 11 |
| **Agent: Frontend Auth** | Login/register pages, JWT storage, route protection | `frontend/src/pages/auth/*`, `frontend/src/lib/auth.ts`, `frontend/src/hooks/useAuth.ts` | Sections 5 (Frontend stack), 10 (design system), 8 (auth endpoints) |
| **Agent: Dashboard UI** | Project list page, ProjectCard, comment inbox | `frontend/src/pages/dashboard/*`, `frontend/src/components/dashboard/*` | Sections 10 (design system), 6 (structure) |
| **Agent: Canvas UI** | ReviewCanvas, PinOverlay, CommentPin, CommentThread | `frontend/src/pages/canvas/*`, `frontend/src/components/canvas/*` | Sections 10 (canvas component specs), 9 (comment mode rules) |
| **Agent: Guest Canvas** | Public review page (no auth), GuestCanvas, name capture | `frontend/src/pages/review/*` | Sections 9 (guest sessions), 10 (GuestCanvas spec) |
| **Agent: Landing Page** | Marketing landing page + pricing page | `frontend/src/pages/landing/*` | Section 10 (design system), Section 3 (value props) |
| **Agent: Export** | PDF + CSV export endpoints | `backend/app/api/routes/export.py` | Section 7 (comment schema), Section 9 (plan limits) |

### How to brief each agent
Start every Claude Code session with:

```
You are working on ReviewDrop — a client website feedback SaaS.
Read CLAUDE.md fully before starting.
Your task today is: [TASK NAME] (Section [X] of CLAUDE.md).
Only touch files in: [FILE LIST].
Do not build anything outside this scope — see Section 4 (what not to build).
Follow all conventions in Section 5 (tech stack) exactly.
When done, write a brief summary of what you built and any decisions you made.
```

---

## 18. DEFINITION OF DONE

A feature is done when:
- [ ] Backend endpoint(s) written, tested (pytest), and returning correct responses
- [ ] Frontend component(s) built and connected to backend via TanStack Query
- [ ] Loading, error, and empty states all handled
- [ ] TypeScript: no `any` types, no type errors
- [ ] No hardcoded strings that should be env vars
- [ ] Alembic migration written if DB schema changed
- [ ] Conventional commit message written
- [ ] Tested manually in local Docker environment

---

## 19. THINGS TO NEVER DO

- Never use `any` in TypeScript — use proper types or `unknown`
- Never store secrets in code — always use environment variables
- Never use `eval()` or `dangerouslySetInnerHTML` without sanitisation
- Never make sync database calls — always `await`
- Never skip Alembic migrations — never alter tables manually
- Never build v2 features in a v1 task — scope is sacred
- Never use auto-increment integers for public-facing IDs — always UUID
- Never process Stripe webhooks without signature verification
- Never proxy a URL without SSRF protection
- Never deploy with `APP_ENV=development` — always check env before deploying

---

## 20. QUICK REFERENCE — KEY DECISIONS AND WHY

| Decision | Why |
|---|---|
| Proxy approach (not script tag) for v1 | Zero client setup is the core value prop — designers can't ask clients to install anything |
| Hybrid coordinates (selector + absolute + screenshot) | Pin drift is unavoidable; triple fallback ensures comments are never lost |
| UUID primary keys | Share URLs must be unpredictable; no sequential ID enumeration |
| Guest sessions (no account) | This is the #1 differentiator vs competitors — non-negotiable |
| Three statuses only (not custom) | Complexity kills adoption; Open/In Progress/Resolved covers 99% of use cases |
| Cloudflare R2 not S3 | Zero egress fees; screenshots are read heavily |
| Resend not SendGrid | Simpler API, generous free tier, better deliverability for transactional |
| Flat pricing (not per-seat) | Per-seat is exactly what users hate about the incumbents |
| No credit card to trial | Markup.io requires card; this is a selling point for us |
| shadcn/ui over a component library | We copy components in; no dependency on external package updates |
| FastAPI over Django/Node | Async-native, fast, type-safe with Pydantic, your existing Python skills |

---

*Last updated: June 2026*
*Product: ReviewDrop (working title)*
*Developer: Solo founder, UK*
*Stack: React + TypeScript + FastAPI + PostgreSQL + Playwright + Cloudflare R2 + Stripe + Resend*
