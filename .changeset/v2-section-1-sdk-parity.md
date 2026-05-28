---
"@unisource/sdk": minor
---

## V2 Client — section 1 SDK parity + transport debt

**New resources on UnisourceV2Client:**
- `client.folders.create / get / update / delete / restore` (CRUD beyond list/breadcrumbs)
- `client.myFiles.list / listTrash / move` (separate from `client.userFiles` Plan 2)
- `client.admin.*` — 11 methods covering /admin endpoints
- `client.public.*` — getShareLink, unlockShareLink, buildDownloadUrl (anonymous)

**Auth and error handling:**
- `apiKey` config option for static server-to-server credential (mutually exclusive with `getToken`)
- `auth: 'none'` per-request override for anonymous endpoints
- `V2ErrorCode` typed union exported from `@unisource/sdk/v2`
- `isV2ErrorCode` runtime guard
- `UnisourceV2Error.code: V2ErrorCode | 'unknown'` with `rawCode` for unknown backend codes

**Bulk operations — BREAKING in V2 beta:**
- New canonical `client.<files|folders>.bulk(args)` with discriminated union body
- Convenience wrappers (bulkTrash, bulkRestore, bulkMove) delegate to bulk(...)
- Response shape changed from `{ success, processed_count, failed_ids? }` to
  `{ processed: string[], failed: [{ id, code, message }] }`
- Old `/v2/<resource>/bulk-{trash,restore,move}` endpoints removed; everything
  goes to `/v2/<resource>/bulk` with `action` in body
- bulkMove requires explicit folder_id / parent_id (null = root, but must be present)

V2 beta has no production consumers — these breaking changes do not affect
UnisourceClient (legacy) which remains stable.

**Known limitations (documented in V2_MIGRATION.md):**
- `apiKey` does NOT work for `/v2/files` and `/v2/folders` (backend `/v2/*` is
  user-only auth). Works for `/admin`, `/main`, `/app`, `/public`.
- `client.admin.listUsers` uses offset pagination (Appwrite SDK constraint).
