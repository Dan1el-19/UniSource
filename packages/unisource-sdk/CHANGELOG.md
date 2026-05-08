# @unisource/sdk

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
