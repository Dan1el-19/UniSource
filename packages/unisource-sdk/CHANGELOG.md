# @unisource/sdk

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
