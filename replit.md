# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Project: FlyChat COD

SaaS web app for COD ecommerce sellers in Algeria / North Africa.

**Demo Accounts**
- Seller: `demo@flychat.dz` / `demo123456` (role: owner)
- Agent: `agent@flychat.dz` / `agent123456` (role: agent)
- Super Admin: `admin@flychat.dz` / `admin123456` (role: superadmin)

**Features Built**
- Bilingual (EN/FR) marketing website (Home, Features, Pricing, Contact)
- Auth flow: signup, login, onboarding wizard, reset password
- Full seller dashboard: Dashboard, Inbox, Orders (+ detail), Customers (+ detail), Products, Widget, Automation, Channels, Team, Billing, Settings
- Super Admin panel (`/admin`) — visible only to superadmin role
- JWT auth with Bearer token stored in localStorage; injected automatically on all API calls
- Realistic Algerian demo data seeded (5 customers, 5 orders, 5 conversations, 4 products)

**Embeddable Widget (Layer 1)**
- Widget.js loader served at `/api/widget/widget.js` — vanilla JS, creates floating chat button + iframe
- Loader passes parent page URL as `&pageUrl=` query param to the iframe for accurate `sourcePageUrl` tracking
- Mobile-responsive: uses CSS `min()` for sizing, full-screen on viewports < 430px
- Widget embed UI at `/embed/widget?storeId=...&lang=en|fr&pageUrl=...` — standalone React page, no auth required
- Public API endpoints under `/api/widget/public/` for session, conversation, and message management
- All Zod schemas enforce `max(2048)` on URL fields; send endpoint blocks writes to closed conversations
- Visitor sessions tracked in `widget_sessions` table; conversations linked via `visitorId` column
- No polling or Socket.IO yet (Layer 1); messages fetched after each send
- Embed snippet (absolute URL generated from request host): `<script>window.FLYCHAT_CONFIG={storeId:"..."};</script><script src="https://<host>/api/widget/widget.js"></script>`
- `test-widget.html` pre-filled with demo store ID for zero-config local testing

**Architecture**
- Global proxy routes `/api` → API Server (port 8080); `/` → Frontend (port 21894)
- Frontend uses relative `/api/...` URLs — no proxy config needed in Vite
- Auth token auto-injected via `lib/api-client-react/src/custom-fetch.ts`

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port 8080)
│   └── flychat/            # React + Vite frontend (port 21894)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Layer 2: Real-time (Socket.IO) — Remaining Work

1. **Server-side Socket.IO setup** — Install `socket.io` in `api-server`, attach it to the existing HTTP server. Create rooms per `store:<storeId>` and `conv:<conversationId>`.
2. **Inbox socket auth** — On connection, validate the JWT from the `auth` handshake query/header. Join the user to their store's room. Reject unauthenticated connections.
3. **Widget socket (public)** — On connection from the widget iframe, join the socket to the specific `conv:<conversationId>` room. Validate `visitorId` + `storeId` before joining.
4. **Emit on public message send** — After a visitor sends a message via `POST /public/conversations/:id/messages`, emit a `new_message` event to the conversation room and the store room so the Inbox receives it.
5. **Emit on agent reply** — After an agent sends a message via the authenticated send endpoint, emit a `new_message` event to the conversation room so the widget embed receives it.
6. **Inbox frontend subscription** — Connect the Inbox page to the Socket.IO server with the JWT token. Listen for `new_message` events and prepend/update the conversation list + active thread in real-time (invalidate React Query cache or merge directly).
7. **Widget embed subscription** — Connect the widget embed to Socket.IO (no auth, pass `visitorId` + `conversationId`). Listen for `new_message` and append agent replies to the message list without polling.
8. **Typing indicators (optional)** — Emit `typing_start` / `typing_stop` events from both sides so the other party sees "is typing..." status.
9. **Online presence (optional)** — Track connected visitors per store and surface a "1 visitor online" indicator in the Inbox header.
