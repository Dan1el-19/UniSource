---
'@unisource/sdk': patch
---

Add `AdminQuotaReconcileResponse` type and `adminQuotaReconcileResponseSchema` for the admin quota reconciliation endpoint (`POST /admin/quota/reconcile`). Exposes `affected` (file count) and `delta_bytes` (storage drift corrected) fields.
