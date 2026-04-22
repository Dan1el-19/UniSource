# UniSource Frontend

SvelteKit application for the UniSource user interface. The frontend consumes the private backend API and shared contracts from `@unisource/sdk`.

## Local development

From the monorepo root:

```bash
pnpm install
pnpm --filter ./apps/frontend dev -- --host 127.0.0.1 --port 4321
```

The app expects the backend API at `http://localhost:8787` by default.

## Environment

Copy [`.env.example`](/A:/Projects/UniSource/apps/frontend/.env.example) to `.env.local` and fill in the values you need:

```bash
PUBLIC_API_URL=http://127.0.0.1:8787
PUBLIC_SERVICE_ID=usrc
PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
PUBLIC_APPWRITE_PROJECT=...
```

## Useful commands

```bash
pnpm --filter ./apps/frontend typecheck
pnpm --filter ./apps/frontend e2e
pnpm --filter ./apps/frontend build
```

## Integration notes

- Auth is handled with Appwrite JWTs created in the browser.
- Protected app routes (`/drive`, `/trash`, `/admin`, `/settings`) use `UnisourceClient` from `@unisource/sdk`.
- Public share pages under `/s/[slug]` use SDK helper functions for unauthenticated backend access.
- Drive uploads support both R2 and Appwrite; the target folder is sent at upload init time.
