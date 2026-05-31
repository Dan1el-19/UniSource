# @unisource/sdk

## 1.1.0

### Minor Changes

- 0d5cc57: [beta] Add 27 typed methods to `UnisourceV2Client` covering folders, files, shares, share links, main storage, user files, and app endpoints:

  - `folders`: `breadcrumbs`, `bulkTrash`, `bulkRestore`, `bulkMove`
  - `files`: `bulkTrash`, `bulkRestore`, `bulkMove`
  - `shares`: `list`, `create`, `get`, `delete`
  - `shareLinks`: `create`, `listForFile`, `update`, `delete`
  - `mainStorage`: `list`, `get`, `update`, `delete`, `restore`
  - `userFiles`: `get`, `update`, `delete`, `restore`, `downloadUrl`
  - `app`: `latestRelease`

  All methods reuse existing schemas from V1 SDK + `legacy-draft.ts`, follow the V2 error contract (`UnisourceV2Error` with `X-Request-Id`), and accept optional `AbortSignal` and `asUser` admin override.

- 8128221: ## V2 Client — section 1 SDK parity + transport debt

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

  **Known limitation (documented in V2_MIGRATION.md):**

  - `client.admin.listUsers` uses offset pagination (Appwrite SDK constraint).

- ca9c958: ## V2 Client — section 2 upload resource

  **New resource on UnisourceV2Client:**

  - `client.upload.*` — 8 methods covering full single + multipart R2 upload flow:
    - `r2Init(body)` — start single R2 upload (presigned PUT URL)
    - `appwriteInit(body)` — start Appwrite upload (file metadata + JWT for user paths)
    - `complete(uploadId, options?)` — finalize an upload and create the file row
    - `multipartCreate(body)` — start a multipart R2 upload (returns r2_upload_id)
    - `multipartSignPart(uploadId, partNumber)` — get presigned URL for one part
    - `multipartListParts(uploadId)` — paginated list of uploaded parts (V2 list envelope)
    - `multipartComplete(uploadId, parts)` — finalize multipart upload
    - `multipartAbort(uploadId)` — cancel multipart upload, release quota

  **New error codes (closed set, was 11 → now 13):**

  - `file_too_large` (413) with typed `details.max_bytes`
  - `quota_exceeded` (409) with typed `details.scope` and `details.requested_bytes`

  **BREAKING (V2 beta only):**

  - `POST /upload/fail` removed — clients should rely on TTL expiry and resource
    cleanup via `multipartAbort` instead. Legacy SDK (`UnisourceClient`) is
    unaffected; only the V2 surface had access to this endpoint and it had no
    production consumers.

  **Wire shape:** all 8 endpoints now return V2 envelope `{ item }` (single resource)
  or `{ items, page }` (list-parts), with errors as `{ error: { code, message,
details?, request_id } }`. See `V2_MIGRATION.md` for full handler list.

- 391d846: Add `UnisourceV2Client.releases.*` with full V2 release upload, multipart, management, and sync coverage.
- 3783a11: [stable] Add `/v2` subpath export while preserving legacy v2 draft schemas at the package root. Freeze `UnisourceClient.v2` (no new methods). Drop `src` from npm files (dist-only).

### Patch Changes

- 7abf123: Handle malformed v2 error response bodies by falling back to the HTTP status text instead of throwing a raw TypeError.

## 1.0.0

### Major Changes

- Release `@unisource/sdk` 1.0.0 as the stable public API.

## 0.8.0

### Minor Changes

- Export v2 file and folder schemas required by backend deploy builds.

## 0.7.0

### Minor Changes

- c6c66b6: Audit 2026-05-13 fixes:

  - Add `recommendedUploadDestinationSchema` (`r2 | appwrite | hybrid`) and `RecommendedUploadDestination` type.
  - `serviceSchema.recommended_upload_destination` and `adminServiceSettingsRequestSchema` now accept `hybrid`.
  - `fileRecordSchema.size` is now non-negative (zero-byte files are valid).
  - `fileUpdateRequestSchema.filename` now hard-caps at 255 chars to mirror backend.
  - `admin.listUploads()` accepts an optional `destination` filter.
  - New `app.releases.latest(channel)` helper backed by `GET /app/releases/latest`.
  - New `nonNegativeInt` primitive and `AppReleaseLatestResponse` / `AppReleaseLatestQuery` types.

## 0.6.0

### Minor Changes

- d73b42a: Add multipart upload helpers under `releases.upload.multipart` (`create`, `signPart`, `listParts`, `complete`, `abort`) so consumers can upload large release artifacts via S3 presigned URLs without touching the AWS SDK.

## 0.5.0

### Minor Changes

- Add multipart upload helpers under `releases.upload.multipart` (`create`, `signPart`, `listParts`, `complete`, `abort`) so consumers can upload large release artifacts via S3 presigned URLs without touching the AWS SDK.

## 0.3.2

### Patch Changes

- 28a9b33: Fix upload request types so defaulted `is_main_storage` remains optional for SDK consumers.

## 0.3.1

### Patch Changes

- 3348a8c: Dostosowano kontrakty mainStorage do backendowych endpointów /main, w tym response rename jako `{ file }` oraz walidację limitu listowania.

## 0.3.0

### Minor Changes

- 6ca7513: Align folder trash query aliases, add public share helpers, and expose full typed coverage for admin `/files` endpoints.

### Patch Changes

- 0af63d6: Add `AdminQuotaReconcileResponse` type and `adminQuotaReconcileResponseSchema` for the admin quota reconciliation endpoint (`POST /admin/quota/reconcile`). Exposes `affected` (file count) and `delta_bytes` (storage drift corrected) fields.

## 0.2.0

### Minor Changes

- - Added a full type-safe HTTP client (`UnisourceClient`) that handles automatic Dual-Auth integration and Cloudflare service isolation.
  - Extensively restructured definitions to group R2, Appwrite, files, folders and admin interfaces correctly.
  - Removed outdated `FileRecordFullResponse` and unified responses format.
