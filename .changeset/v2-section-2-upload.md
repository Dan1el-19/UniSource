---
"@unisource/sdk": minor
---

## V2 Client — section 2 upload resource

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
