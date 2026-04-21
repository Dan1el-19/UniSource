# CLAUDE.md

**Always use `pnpm`** — never `npm` or `yarn`.

## Commands

```
pnpm --filter frontend dev       # localhost:5173
pnpm --filter frontend e2e       # Playwright tests
pnpm --filter backend dev        # localhost:8787 (wrangler)
pnpm --filter backend test       # Vitest
pnpm --filter @unisource/sdk dev # watch mode
```

## Monorepo

- `apps/frontend` — SvelteKit 2 + Svelte 5
- `apps/backend` — Hono on Cloudflare Workers
- `packages/unisource-sdk` — published to npm (use changesets)

## Architecture

Frontend (SvelteKit) ← HTTP → Backend (Hono) ← D1 (SQLite) / R2 / Appwrite

**Key points:**
- Upload flow: `init()` (get presigned URL) → upload to R2 → `complete()` (create D1 record)
- Auth: JWT from Appwrite OR API key (sets `userId='system'`)
- Every request needs `X-Service-ID` header (enforces service isolation)
- Files soft-delete by default (`is_trashed=1`); hard delete needs `?permanent=true`
- When changing backend routes, update SDK types in `@unisource/sdk`

## Conventions

- Commits: `feat(sdk):`, `fix(backend):`, `refactor(frontend):`, `chore(root):` — add `!` for breaking changes
- SDK: never manually edit `version` — use `pnpm changeset version`
- Design: see `DESIGN.md` for tokens
- Routes: protected routes in frontend guarded by `hooks.server.ts` (checks `unisource_auth` cookie)
