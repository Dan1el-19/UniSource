# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

**Always use `pnpm`** — never `npm` or `yarn`.

```bash
pnpm install                      # install all workspace dependencies
pnpm --filter frontend <cmd>      # run command in apps/frontend
pnpm --filter backend <cmd>       # run command in apps/backend
pnpm --filter @unisource/sdk <cmd> # run command in packages/unisource-sdk
```

## Monorepo Structure

```
UniSource/
├── apps/
│   ├── backend/         # Cloudflare Worker API (Hono) — private, deployed via wrangler
│   └── frontend/        # SvelteKit 2 + Svelte 5 web app — private
├── packages/
│   └── unisource-sdk/   # @unisource/sdk — published to npm
└── .changeset/          # changesets for SDK versioning
```

## Commands

### Backend (`apps/backend`)

| Command | Purpose |
|---------|---------|
| `pnpm --filter backend dev` | Dev server on `localhost:8787` (wrangler dev) |
| `pnpm --filter backend test` | Run all tests (Vitest + Cloudflare Workers pool) |
| `pnpm --filter backend test test/auth-decision.test.ts` | Run a single test file |
| `pnpm --filter backend typecheck` | TypeScript validation |
| `pnpm --filter backend check` | typecheck + test combined |
| `pnpm --filter backend deploy` | Deploy to Cloudflare Workers |
| `pnpm --filter backend cf-typegen` | Regenerate `CloudflareBindings` type definitions |

### Frontend (`apps/frontend`)

| Command | Purpose |
|---------|---------|
| `pnpm --filter frontend dev` | Dev server on `localhost:5173` |
| `pnpm --filter frontend typecheck` | `svelte-kit sync` + `svelte-check` |
| `pnpm --filter frontend e2e` | Playwright E2E tests (headless) |
| `pnpm --filter frontend e2e e2e/smoke.spec.ts` | Run a single E2E test file |
| `pnpm --filter frontend e2e:headed` | E2E with browser visible (Chromium) |
| `pnpm --filter frontend e2e:ui` | Playwright interactive UI mode |
| `pnpm --filter frontend build` | Production build |

### SDK (`packages/unisource-sdk`)

| Command | Purpose |
|---------|---------|
| `pnpm --filter @unisource/sdk dev` | Watch mode — rebuilds on changes |
| `pnpm --filter @unisource/sdk build` | Build for distribution to `dist/` |
| `pnpm --filter @unisource/sdk test` | Unit tests (requires build first) |
| `pnpm --filter @unisource/sdk typecheck` | TypeScript validation |

## Architecture

### Component Overview

```
Frontend (SvelteKit) ──HTTP──► Backend (Hono Worker) ──► Cloudflare D1 (SQLite)
     │                                                 └──► Cloudflare R2 (files)
     │                                                 └──► Appwrite (auth verify)
     │
     └── Auth: Appwrite SDK (account.createJWT())
     └── File ops: @unisource/sdk UnisourceClient
```

### File Upload Flow (Presigned URL Pattern)

The Worker **never** handles binary data. Instead:

1. Frontend calls `apiClient.upload.r2.init()` → Backend returns presigned URL + `upload_id` (valid 1hr)
2. Frontend uploads directly to R2 using the presigned URL
3. Frontend calls `apiClient.upload.r2.complete({ upload_id })` → Backend creates record in D1
4. If not confirmed within 60 minutes, cron job auto-cleans the orphaned upload

### Authentication (Dual-Auth Middleware)

`apps/backend/src/middleware/auth.ts` supports two modes:

- **JWT (B2C)**: Frontend gets JWT via `account.createJWT()` from Appwrite, sends as `Authorization: Bearer <jwt>`. Backend verifies with Appwrite.
- **API Key (B2B)**: Static key stored as Cloudflare secret. Sets `userId = 'system'`. Used for server-to-server and admin routes.

Every request also requires `X-Service-ID` header. Backend verifies the user belongs to that service in the `service_users` table — this prevents cross-service data leakage.

### Multi-Service Isolation

All D1 tables include `service_id`. Every query filters by both `service_id` AND `user_id`. The `services` table is pre-seeded with `usrc` and `blokserwis`.

### Soft Delete

Files and folders are never hard-deleted by default. They get `is_trashed = 1` and `trashed_at` set. Hard deletion requires `?permanent=true` or happens on account deletion.

### SDK as Contract

`@unisource/sdk` defines the shared schemas and types between frontend and backend. When changing backend routes, update the SDK accordingly. The frontend initializes the client in `apps/frontend/src/lib/api.ts`.

## Environment Variables

**Frontend** (`.env.local` in `apps/frontend/`):
```
PUBLIC_API_URL=http://localhost:8787
PUBLIC_SERVICE_ID=usrc
PUBLIC_APPWRITE_ENDPOINT=<appwrite-url>
PUBLIC_APPWRITE_PROJECT=<appwrite-project-id>
```

**Backend** (Cloudflare secrets via `wrangler secret put`):
```
USRC_API_KEY, BLOKSERWIS_API_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_BUCKET_ID, APPWRITE_API_KEY
```

## Versioning & Releasing

Package versions are **fully independent** — never sync them across packages.

| Package | Published | Version trigger |
|---------|-----------|----------------|
| `frontend` | No | git tag `frontend@X.Y.Z` |
| `backend` | No | git tag `backend@X.Y.Z` |
| `@unisource/sdk` | npm | changesets |

**SDK release workflow:**
```bash
pnpm changeset                        # describe changes
pnpm changeset version                # bump version + update CHANGELOG.md
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk publish --dry-run --access public --no-git-checks
pnpm changeset publish                # publish to npm
git push origin main --follow-tags
```

Never modify `version` in `package.json` manually — use `pnpm changeset version`.

## Commit Convention

Conventional Commits with scope: `feat(sdk):`, `fix(backend):`, `refactor(frontend):`, `chore(root):`.

Breaking changes: add `!` after scope and include `BREAKING CHANGE:` footer.

## Design System

`DESIGN.md` at the repo root contains the full design token system (colors, typography, spacing, animations). The UI aesthetic is dark-first, premium, inspired by One UI 8.5 + iOS 26 + Linear/Raycast. Follow it for any frontend work.

## Frontend Route Structure

Protected routes (`/drive`, `/settings`, `/shared`, `/trash`, `/search`) are guarded by `hooks.server.ts` — it checks for the `unisource_auth` cookie and redirects to `/login` if absent.
