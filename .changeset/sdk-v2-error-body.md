---
"@unisource/sdk": patch
---

Handle malformed v2 error response bodies by falling back to the HTTP status text instead of throwing a raw TypeError.
