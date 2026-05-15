# Backend (Hono on Cloudflare Workers)

## Future technical debt

### Cleanup `usrc` default service (separate refactor)

Current state:
- `SERVICES['usrc']` in `src/config/services.ts`
- `USRC_BUCKET` binding in `wrangler.jsonc`
- `DEFAULT_SERVICE_ID = 'usrc'` (fallback for anonymous service ID in auth middleware)
- `services` D1 row with `id='usrc'`

Not actively used by the frontend (admin UI / superadmin handles only `chmura-blokserwis`).
Kept as a fallback for anonymous service ID resolution.

Cleanup requires:
- audit D1 (`SELECT COUNT(*) FROM files WHERE service_id='usrc'`)
- change `DEFAULT_SERVICE_ID`
- touch auth middleware (`auth.ts:130`, `:142`, `:199`)
- admin route (`admin.ts:101`, `:359`)
- wrangler.jsonc (remove `USRC_BUCKET` binding)
- config/services.ts

Out of scope for the R2 services migration (2026-05-15, see
`docs/superpowers/specs/2026-05-15-r2-services-no-aws-sdk-design.md`).
