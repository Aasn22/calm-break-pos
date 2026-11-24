# Calm Break

Separate customer/staff ordering and café/shop operations, backed by one PostgreSQL database.

## What works

- `/`: combined café and shop catalog, basket, customer sign-up/sign-in, account allergy notes, orders and item-level delivery estimates, account bills.
- `/operations`: operator/manager sign-in. No public portal selector or customer-facing operations links.
- Operators create counter sales for registered customer/staff accounts, confirm orders and set each item's timeframe (prefilled from the manager's item defaults). Each order line can be delivered separately. Completion is derived only when all lines are delivered.
- Managers add/edit/hide items, set default fulfilment times and escalation thresholds, create staff/operator/manager accounts, and record payments received outside the app.
- Shared database records refresh every five seconds while either portal is open. Concurrent order changes use optimistic locking; checkout retries use an idempotency key.
- Allergy notes are snapshotted at checkout. Operators additionally see the latest profile note and an indication if it differs, including on existing orders.
- Manager attention alerts appear in the order board when an unconfirmed order exceeds its configured threshold or an undelivered item exceeds its confirmed deadline plus its escalation threshold. Delivered items do not escalate. These are **in-app alerts**, not background email/SMS/push notifications. Managers must keep the board open for immediate alerts; overdue work is also visible when they return.
- Existing prices are in USD. Payments are not collected online. A recorded payment is an operator-entered accounting record, not a payment processor confirmation.

## Required setup before accepting real orders

There was no database, authentication or environment configuration in the original project. There is deliberately no localStorage order database, shared demo password, automatic manager creation or auth bypass.

1. Connect an isolated PostgreSQL database for each environment. Set `DATABASE_URL` in the application environment; use your provider's secure connection string. Do not disable TLS certificate verification. Do not share the production database with untrusted PR previews.
2. The current app uses Better Auth and the Drizzle schema in `lib/db/schema.ts`, not the legacy `cb_*` schema. On a trusted machine, run `pnpm db:migrate` with `DATABASE_URL` set through your local environment to apply the generated baseline additively. Existing `cb_*` tables are preserved; legacy accounts/orders are not automatically converted into the new auth system. Then supply `BETTER_AUTH_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12–128 characters), optionally `ADMIN_NAME`, through that local environment and run `pnpm db:setup`. This initializes the current administrator without changing an existing account's password. Set `SEED_STARTER_CATALOG=true` only to add the starter catalog. Do not paste credentials in chat or command arguments, and do not commit them. Remove bootstrap credentials after setup.

   For an explicitly approved remote deployment, `CALM_BREAK_MIGRATE=true` in the **build environment** enables the same transactional migration before Next.js builds. It runs in the selected deployment environment, never on public requests. Migration failure fails the build. Ordinary builds do not migrate unless explicitly enabled. No administrator or known password is automatically created.
3. Sign in at `/operations`. Review the starter catalog, prices, preparation times and escalation thresholds, and create the staff/operator accounts you need. Registered customers cannot grant themselves a staff or operations role. Provisioning passwords should be handed over through your organisation's secure credential process. Password reset and self-service password changes are not implemented yet; do not reuse credentials.
4. Review the preview and merge the PR to release through the project's GitHub deployment integration.

Without a database, both portals display a setup message and refuse sign-in/checkout. Schema changes are explicit, never executed by public requests or silently against production during a preview build.

## Two different domains

The code supports both same-project hostnames with strict host isolation. Assign your chosen two domains to the same Vercel project, then set **both** environment variables to hostnames only (no scheme or path):

- `CUSTOMER_HOST`: customer/staff ordering hostname.
- `OPERATIONS_HOST`: private operations hostname.

With both configured, the operations hostname's root opens operations sign-in. Customer hosts cannot access operations pages/APIs, and operations hosts cannot access customer pages/APIs. Unknown hostnames and partial/misconfigured host settings fail closed. Cookies are host-only, HTTP-only, Secure in production, SameSite=Strict and expire after 12 hours. All writes require a same-origin request. API role enforcement is independent of the hostname restriction.

Until names are chosen and assigned, previews use `/` and `/operations` with separate, non-interchangeable authenticated roles. **Different paths are not different domains.** Do not configure production host restrictions on unrelated PR preview hosts; use separate preview environment configuration. `robots: noindex` on operations is not an access control; authentication is.

## Development and checks

Node 24+; pnpm as declared in `package.json`.

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Tests use an isolated in-process PostgreSQL engine (PGlite), not production data. They cover real schema/order SQL, combined checkouts, server-owned prices and defaults, idempotency, allergy snapshots, ownership filtering, partial delivery, confirmation validation, concurrent writes, manager payment permission, escalation boundaries, password hashing and disjoint portal/host policies.

### Preview verification

The public landing/menu shell and operations login are reachable without an application account. Full ordering/manager flows require an isolated preview database initialised with `pnpm db:setup`, then a test manager creating test staff/operator accounts. There are no documented shared credentials or bypasses. A READY build alone does not verify these signed-in flows.

## Operational limits to address before a larger rollout

- In-app polling, not a durable email/SMS notification service; no automatic dispatch or delivery provider.
- Per-account login throttling is persisted in PostgreSQL. Add perimeter abuse controls before opening public registration at scale.
- Account recovery, password rotation UI, refunds, tax rules, inventory quantities, partial-quantity fulfilment and external payment processing are not implemented. Delivery is tracked per order line, including all units on that line.
- Current bills/orders load the account history (or the shared operations history). Add pagination/archival for large histories.

## Schema repair safety

`migrations/0000_current_portal_schema.sql` is generated by `pnpm exec drizzle-kit generate` from the current Drizzle schema. The adoption runner creates missing tables/columns and missing named foreign keys/indexes inside one transaction guarded by an advisory lock. It never drops tables, truncates data, retypes columns, resets credentials, or changes roles. Incompatible populated tables cause a rollback rather than destructive repair. Existing inline constraints on pre-existing tables are not automatically rewritten. Future schema changes require a new reviewed migration; this runner adopts this baseline only. The old `scripts/setup.ts` is retained solely for the legacy API and is no longer the `db:setup` entry point.

Database/authentication exceptions now log only a context label and error code, not SQL, passwords, cookies, connection strings or user data. The public setup page deliberately does not expose internal errors.
