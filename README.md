# Sample-to-PO CRM — Wholesale Production Tracker

An internal, multi-user CRM that tracks the wholesale product lifecycle:

> sample request → quote → order form → proforma invoice (PI) → purchase order (PO) → production → customer-PO matching → packing-list reconciliation

Built for an ops team handling 500+ sample requests/month. Dense, fast, keyboard-friendly.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, TypeScript), server components + server actions |
| Database | PostgreSQL (Neon / Supabase compatible) via Prisma |
| Auth | NextAuth (Auth.js v5) — Microsoft Entra ID (Azure AD) + dev credentials |
| Inbound email | Postmark Inbound webhook → `/api/inbound/email` |
| Outbound email | Resend + React Email templates |
| Background jobs | Vercel Cron → `/api/cron/*` (idempotent) |
| File storage | Vercel Blob (polymorphic `Attachment` records) |
| UI | Tailwind v4 + shadcn-style components, TanStack Table |
| Exports | `exceljs` (xlsx, primary) + `@react-pdf/renderer` (PDF) |
| Validation | Zod on every API route & server action |
| E2E | Playwright |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env          # fill in DATABASE_URL etc.

# 3. Create the schema + seed realistic data (50 samples across the pipeline)
npm run db:migrate            # or: npm run db:push
npm run db:seed

# 4. Run
npm run dev                   # http://localhost:3000
```

### Local auth (no Azure tenant required)

Set `DEV_AUTH_ENABLED="true"` and sign in on `/login` with a seeded email:

- `admin@ourdomain.com` (admin)
- `morgan@ourdomain.com` (member)
- `casey@ourdomain.com` (viewer)

In production, set `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID` and the Microsoft button appears.

## Environment variables

See [`.env.example`](./.env.example). Key ones: `DATABASE_URL`, `NEXTAUTH_SECRET`,
`AZURE_AD_*`, `POSTMARK_INBOUND_TOKEN`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
`CRON_SECRET`, `TOKEN_SIGNING_SECRET`.

When `RESEND_API_KEY` / `BLOB_READ_WRITE_TOKEN` are absent (local dev), outbound
emails are logged to the console and uploads use placeholder URLs, so every flow
stays exercisable without external credentials.

## Core behaviors (non-negotiables)

- **Unique sample #** — enforced at the DB level; UI surfaces conflicts gracefully.
- **ETAs never silently overwritten** — every change writes an `EtaRevision` (original shown struck-through, revision count badge, factory slip stats).
- **Order forms can't be sent** with any missing UPC or style #; the builder blocks and offers a one-click "Request missing info" email.
- **FOB match engine** — every PI line is auto-compared to the recorded sample FOB; variances get a red badge ($ + %), a match-summary banner, and admin alert emails; each variance requires explicit approve/dispute resolution.
- **Cumulative 3-way match** — PI qty vs cumulative units shipped across *all* packing lists on the PI (partial shipments), per-SKU matched/short/over + a PI-level progress bar.
- **Customer PO ↔ internal PO is many-to-many** (`CustomerPoLink`); global search traces a customer PO → internal PO(s) → PI → originating samples (and back).
- **Margin %** shown wherever FOB + customer sell price both exist.
- **Everything material is audit-logged** (status, ETA, FOB, link/unlink) and rendered as a timeline.
- All money is `Decimal` (never float) with currency stored alongside; all dates stored UTC, displayed `America/New_York`.
- Mobile-responsive; role-gated (`admin` / `member` / `viewer`).

## Status pipeline

Sample lifecycle (single source of truth in `src/lib/status.ts`):

`sample_requested → eta_set → sample_received → quoted → on_order_form → pi_received → pi_matched → po_issued → in_production → shipped → packing_list_matched → closed` (+ terminal `dropped`).

PO production sub-pipeline: `issued → deposit_paid → in_production → inspection → ready_to_ship → shipped → delivered`.

Transitions happen automatically where possible (received date → `sample_received`,
FOB entered → `quoted`, order form sent → `on_order_form`, PO issued → `po_issued`,
packing list fully matched → `packing_list_matched`). Admins can override; overrides are audit-logged.

## Inbound email (the Asana-style cc workflow)

`POST /api/inbound/email` (Postmark, token-verified):

1. Stores the raw `InboundEmail`.
2. Parses sample #, brand, category (admin-configurable regex patterns; subject first, then body).
3. Duplicate sample # → appends the email as a comment tagged `duplicate-email` (reply-threading).
4. All fields present → creates the `Sample` (`sample_requested`).
5. Missing fields → creates the sample anyway, marks the email `needs_review`, and emails the sender a 7-day signed magic-link to a no-login mini-form (`/missing-info`).
6. Attachments saved as `Attachment`s; failed parses land in the **Needs Review** inbox.

## Cron automations (Vercel Cron, daily; see `vercel.json`)

`/api/cron/*`, authorized by `CRON_SECRET` (Bearer), all idempotent:

- `follow-ups` — weekly sample follow-up to factory + requester (cadence per sample; snooze / stop via signed links).
- `eta-watchdog` — ETA within 3 days reminders; overdue alerts.
- `missing-upc-nag` — draft order forms with missing UPC/style # > 2 days.
- `variance-digest` — daily digest of unresolved FOB variances to admins.
- `morning-digest` — opt-in per-user daily summary.

> Vercel Cron runs in UTC; `0 12 * * *` ≈ 8am ET (EDT). Adjust for EST if desired.

## Scripts

```bash
npm run dev          # dev server
npm run build        # prisma generate + next build
npm run db:migrate   # prisma migrate dev
npm run db:seed      # seed 50 samples + factories + users
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test:e2e     # Playwright (needs dev server running + seeded DB)
```

## Project structure

```
prisma/                 schema.prisma + seed.ts + migrations
src/
  app/
    (app)/              authenticated UI (dashboard, samples, order-forms, pis, pos,
                        customer-pos, packing-lists, needs-review, factories, settings)
    api/                webhooks (inbound), cron, search, exports, auth
    login/ missing-info/ public routes
  components/           UI primitives (shadcn-style) + shared widgets
  emails/               React Email templates
  lib/                  db, auth/session, audit, status engine, FOB/3-way match,
                        eta revisions, money/date utils, parser, settings, tokens,
                        exports, metrics
```
