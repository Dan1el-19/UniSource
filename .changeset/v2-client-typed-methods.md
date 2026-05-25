---
"@unisource/sdk": minor
---

[beta] Add 27 typed methods to `UnisourceV2Client` covering folders, files, shares, share links, main storage, user files, and app endpoints:

- `folders`: `breadcrumbs`, `bulkTrash`, `bulkRestore`, `bulkMove`
- `files`: `bulkTrash`, `bulkRestore`, `bulkMove`
- `shares`: `list`, `create`, `get`, `delete`
- `shareLinks`: `create`, `listForFile`, `update`, `delete`
- `mainStorage`: `list`, `get`, `update`, `delete`, `restore`
- `userFiles`: `get`, `update`, `delete`, `restore`, `downloadUrl`
- `app`: `latestRelease`

All methods reuse existing schemas from V1 SDK + `legacy-draft.ts`, follow the V2 error contract (`UnisourceV2Error` with `X-Request-Id`), and accept optional `AbortSignal` and `asUser` admin override.
