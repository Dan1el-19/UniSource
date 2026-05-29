# V2 Migration Hardening Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any verification command fails, use superpowers:systematic-debugging before changing code.

**Goal:** Finish the UniSource V2 migration hardening work safely, verify all gates, and commit only a clean, reviewed state on branch `beta`.

**Architecture:** Backend shared routes remain legacy by default and return V2 envelopes only when the caller opts in with `X-Unisource-API-Version: 2` or `Accept: application/vnd.unisource.v2+json`. V2-only routes under `/v2/*` and `/superadmin/*` are always V2. The SDK V2 client sends opt-in headers automatically and must parse V2 envelopes while preserving compatibility with existing legacy-shaped tests and mocks.

**Tech Stack:** pnpm 11.1.2, Node.js >=22.12.0, Hono on Cloudflare Workers, D1/Miniflare tests via `@cloudflare/vitest-pool-workers`, SvelteKit frontend, `@unisource/sdk` with Zod schemas.

---

## Current Branch And Rule

Branch: `beta`.

Do not merge `beta` into `main` during this handoff.

Do not commit until all required gates below pass.

Use `pnpm` only. Do not use `npm` or `yarn`.

## What Was Wrong

Security finding: shared upload completion routes allowed API-key callers through without consistently requiring the `upload` permission. The critical endpoint was `POST /upload/complete`; multipart endpoints also needed the same permission hardening.

Contract finding: `UnisourceV2Client` sends V2 opt-in headers, but several SDK V2 parsers still expected legacy flat response bodies from shared routes. With opt-in enabled, backend shared routes should return V2 envelopes such as `{ item }`, `{ items, page }`, or action envelopes.

Backend contract finding: some shared routes still returned legacy flat bodies even when V2 opt-in was present. Legacy callers must keep legacy bodies, but V2 opt-in callers must receive V2 envelopes.

CORS finding: `X-Unisource-API-Version` was missing from allowed CORS headers, which could block browser clients from using V2 opt-in.

Audit finding: `pnpm audit --prod` was clean, but full `pnpm audit` still reported dev-only advisories through commit tooling and SvelteKit cookie dependency paths.

## Changes Already Made In This Working Tree

Backend upload hardening:

- Modified `apps/backend/src/routes/upload.ts` to require `requireApiKeyPermission(c, 'upload')` on `/upload/complete`, multipart sign-part, multipart list-parts, multipart complete, and multipart abort paths.
- Added/updated `apps/backend/test/upload-hardening.test.ts` with API-key permission denial tests and multipart lifecycle coverage.

Backend V2 negotiation and envelopes:

- Added `apps/backend/src/lib/v2/negotiation.ts`.
- Added `apps/backend/src/lib/v2/principal.ts`.
- Added `apps/backend/src/lib/v2/responses.ts` with helpers including `itemOrLegacy`, `listOrLegacy`, `unpaginatedListOrLegacy`, and `actionOrLegacy`.
- Modified shared route files so V2 opt-in returns envelopes while legacy remains unchanged: `apps/backend/src/routes/fileRecords.ts`, `apps/backend/src/routes/userFiles.ts`, `apps/backend/src/routes/files.ts`, `apps/backend/src/routes/admin.ts`, `apps/backend/src/routes/shareLinks.ts`, and `apps/backend/src/routes/shares.ts`.
- Modified `apps/backend/src/index.ts` so CORS allows `X-Unisource-API-Version`.

SDK V2 parser compatibility:

- Modified `packages/unisource-sdk/src/v2/transport.ts` so V2 requests send opt-in headers.
- Modified `packages/unisource-sdk/src/v2/folders.ts`, `packages/unisource-sdk/src/v2/my-files-schemas.ts`, `packages/unisource-sdk/src/v2/public-schemas.ts`, `packages/unisource-sdk/src/v2/resources/user-files.ts`, `packages/unisource-sdk/src/v2/resources/share-links.ts`, `packages/unisource-sdk/src/v2/resources/shares.ts`, and `packages/unisource-sdk/src/v2/resources/admin-files.ts` so V2 schemas accept V2 envelopes and existing legacy-shaped fixtures.
- Added `packages/unisource-sdk/src/v2/__tests__/shared-route-schemas.test.ts` to verify V2 shared-route envelopes.

Dependency cleanup started but not finished:

- Ran `pnpm update --latest @sveltejs/kit @sveltejs/adapter-cloudflare` in `apps/frontend`.
- Ran `pnpm update --latest @cloudflare/vitest-pool-workers miniflare wrangler` in `apps/backend`.
- Ran `pnpm update --latest commitizen cz-conventional-changelog` at repo root; it did not update anything.
- Modified root `package.json` to remove `commitizen` and `cz-conventional-changelog` dev dependencies and add `pnpm.overrides.cookie = ^1.1.1`.
- `pnpm-lock.yaml` is changed and must be regenerated/verified after the root `package.json` edit.

## Verification Already Observed

The targeted backend hardening test passed:

```bash
pnpm --filter backend test -- upload-hardening.test.ts
```

The targeted SDK schema compatibility test passed after parser fixes:

```bash
pnpm --filter @unisource/sdk test -- shared-route-schemas.test.ts
```

Observed passing result for the SDK command: 25 test files passed, 458 tests passed.

`pnpm audit --prod` was clean before the last dependency cleanup attempt.

## Files To Inspect First

Run:

```bash
git status --short
git diff --stat
git diff -- package.json pnpm-lock.yaml apps/frontend/package.json apps/backend/package.json
```

Expected: many V2 migration files are modified, plus dependency files. Treat existing user/agent changes as intentional unless they directly conflict with these tasks.

## Task 1: Finish Dependency And Audit Cleanup

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Inspect: `apps/frontend/package.json`
- Inspect: `apps/backend/package.json`

- [ ] **Step 1: Sync lockfile after root package edit**

Run:

```bash
pnpm install
```

Expected: install completes using pnpm 11.1.2 and updates `pnpm-lock.yaml` consistently with root `package.json`.

- [ ] **Step 2: Check production audit**

Run:

```bash
pnpm audit --prod
```

Expected: `No known vulnerabilities found`.

- [ ] **Step 3: Check full audit**

Run:

```bash
pnpm audit
```

Expected after the current cleanup target: no `commitizen`, `lodash`, or `tmp` advisories. If `cookie` still appears through `@sveltejs/kit`, inspect the lockfile and override resolution.

- [ ] **Step 4: Inspect remaining cookie path if audit still fails**

Run:

```bash
pnpm why cookie
```

Expected with a working override: no vulnerable `cookie@0.6.0` path. If `cookie@0.6.0` remains under `@sveltejs/kit`, keep the `pnpm.overrides.cookie` entry and rerun `pnpm install`.

- [ ] **Step 5: Decide whether removing commitizen is acceptable**

Check root `package.json`. If project wants to keep `pnpm dlx commitizen` only, the current removal is acceptable because `AGENTS.md` says commitizen can be used via `npx cz` or `pnpm dlx commitizen`, not that local dev dependencies are required.

If local commitizen support must remain, restore these exact fields and accept that full dev audit may keep reporting advisories until upstream packages update:

```json
"devDependencies": {
  "@changesets/cli": "^2.31.0",
  "commitizen": "^4.3.1",
  "cz-conventional-changelog": "^3.3.0"
},
"config": {
  "commitizen": {
    "path": "cz-conventional-changelog"
  }
}
```

Keep `pnpm.overrides.cookie` only if it does not break frontend typecheck/build.

## Task 2: Run Required Gates

**Files:**

- Verify: all modified backend files
- Verify: all modified SDK files
- Verify: frontend dependency changes

- [ ] **Step 1: SDK typecheck**

Run:

```bash
pnpm --filter @unisource/sdk typecheck
```

Expected: command exits 0.

- [ ] **Step 2: SDK full tests**

Run:

```bash
pnpm --filter @unisource/sdk test
```

Expected: command exits 0. Existing passing targeted run was 25 files and 458 tests when filtered by `shared-route-schemas.test.ts`; full test count may differ.

- [ ] **Step 3: Backend full check**

Run:

```bash
pnpm --filter backend check
```

Expected: command exits 0. Backend scripts build the SDK first through `precheck`; do not manually build SDK unless diagnosing a failure.

- [ ] **Step 4: Frontend typecheck**

Run:

```bash
pnpm --filter frontend typecheck
```

Expected: command exits 0. This is important because frontend SvelteKit dependencies were updated.

- [ ] **Step 5: Production audit**

Run:

```bash
pnpm audit --prod
```

Expected: `No known vulnerabilities found`.

## Task 3: If A Gate Fails, Debug Narrowly

**Files:**

- Inspect the file named by the failing test or typecheck output.
- Do not revert unrelated changes.

- [ ] **Step 1: Capture the exact failing command and error**

Run the failing command again exactly as written in Task 2.

Expected: reproduce the same failure before changing code.

- [ ] **Step 2: For SDK schema failures, check envelope parser shape**

Inspect these files first:

```bash
packages/unisource-sdk/src/v2/folders.ts
packages/unisource-sdk/src/v2/my-files-schemas.ts
packages/unisource-sdk/src/v2/public-schemas.ts
packages/unisource-sdk/src/v2/resources/user-files.ts
packages/unisource-sdk/src/v2/resources/share-links.ts
packages/unisource-sdk/src/v2/resources/shares.ts
packages/unisource-sdk/src/v2/resources/admin-files.ts
packages/unisource-sdk/src/v2/__tests__/shared-route-schemas.test.ts
```

Expected fix pattern: parsers should accept both V2 envelopes and existing legacy-shaped fixtures. Do not transform legacy test expectations unless the existing tests are intentionally being migrated.

- [ ] **Step 3: For backend contract failures, check response helpers**

Inspect these files first:

```bash
apps/backend/src/lib/v2/responses.ts
apps/backend/src/lib/v2/negotiation.ts
apps/backend/src/routes/fileRecords.ts
apps/backend/src/routes/userFiles.ts
apps/backend/src/routes/files.ts
apps/backend/src/routes/admin.ts
apps/backend/src/routes/shareLinks.ts
apps/backend/src/routes/shares.ts
```

Expected fix pattern: legacy default response stays flat; V2 opt-in response uses envelope helpers.

- [ ] **Step 4: For upload permission failures, check API-key permission middleware**

Inspect these files first:

```bash
apps/backend/src/middleware/apiKeyPermissions.ts
apps/backend/src/routes/upload.ts
apps/backend/test/upload-hardening.test.ts
```

Expected fix pattern: API-key callers without `upload` permission receive a forbidden response on upload mutation endpoints, while JWT users and permitted API keys keep working.

- [ ] **Step 5: Re-run the narrow failing test**

Run the smallest command that covers the fix, for example:

```bash
pnpm --filter backend test -- upload-hardening.test.ts
pnpm --filter @unisource/sdk test -- shared-route-schemas.test.ts
```

Expected: the narrow command exits 0 before rerunning all gates.

## Task 4: Final Diff Review Before Commit

**Files:**

- Review: every file shown by `git status --short`

- [ ] **Step 1: Review status and stats**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended V2 hardening, tests, docs, and accepted dependency changes are present.

- [ ] **Step 2: Review security-sensitive diffs**

Run:

```bash
git diff -- apps/backend/src/routes/upload.ts apps/backend/src/middleware/apiKeyPermissions.ts apps/backend/test/upload-hardening.test.ts
```

Expected: upload mutation endpoints require `upload` permission for API-key callers; tests cover denial and allowed flows.

- [ ] **Step 3: Review contract-sensitive diffs**

Run:

```bash
git diff -- apps/backend/src/lib/v2/responses.ts apps/backend/src/lib/v2/negotiation.ts packages/unisource-sdk/src/v2/transport.ts packages/unisource-sdk/src/v2/__tests__/shared-route-schemas.test.ts
```

Expected: V2 opt-in behavior is explicit; SDK sends V2 headers; schema tests verify V2 envelopes.

- [ ] **Step 4: Review dependency diffs**

Run:

```bash
git diff -- package.json pnpm-lock.yaml apps/frontend/package.json apps/backend/package.json
```

Expected: dependency changes are intentional and explained by audit cleanup. If the dependency diff is too broad for this hardening commit, split or revert only dependency changes after asking the user.

## Task 5: Commit After Green Gates

**Files:**

- Stage only intended files from this V2 hardening work.

- [ ] **Step 1: Inspect recent history for message style**

Run:

```bash
git log --oneline -10
```

Expected: observe existing commit style. Conventional Commit style is recommended by `AGENTS.md`.

- [ ] **Step 2: Stage intended files**

Run:

```bash
git add .github/workflows V2_MIGRATION.md apps/backend apps/frontend package.json pnpm-lock.yaml packages/unisource-sdk docs/superpowers/plans/2026-05-29-v2-migration-hardening-handoff.md
```

Expected: intended V2 hardening files are staged. If unrelated user files appear, unstage them with `git restore --staged <path>`; do not discard their contents.

- [ ] **Step 3: Verify staged diff**

Run:

```bash
git diff --cached --stat
git diff --cached
```

Expected: staged diff matches the hardening and dependency cleanup scope.

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "fix(backend): harden v2 shared route contracts"
```

Expected: commit succeeds. If hooks fail, fix the issue and create a new commit attempt; do not amend unless the user explicitly asks.

## Known Risk Areas

Dependency updates touched frontend and backend dev tooling. `apps/frontend/package.json`, `apps/backend/package.json`, and `pnpm-lock.yaml` must be treated as functional changes and verified with frontend typecheck and backend check.

SDK parser compatibility is intentionally permissive for now. It accepts V2 envelopes and legacy test shapes so existing consumers/tests do not break while `UnisourceV2Client` uses V2 opt-in headers.

Public routes must remain anonymous and must not start requiring `X-Service-ID`.

Shared in-place routes must remain legacy by default. Do not make V2 envelopes unconditional on shared routes.

`/v2/*` and `/superadmin/*` are always V2.

## Completion Criteria

The handoff is complete only when these are all true:

- `pnpm --filter @unisource/sdk typecheck` exits 0.
- `pnpm --filter @unisource/sdk test` exits 0.
- `pnpm --filter backend check` exits 0.
- `pnpm --filter frontend typecheck` exits 0.
- `pnpm audit --prod` reports no known vulnerabilities.
- `git diff --cached` has been reviewed before commit.
- A commit exists on `beta` with only intended changes.
