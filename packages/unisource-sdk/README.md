# @unisource/sdk

Shared UniSource contracts and HTTP client used by both `apps/backend` and `apps/frontend`.

## What is included

- Zod schemas and TypeScript types for uploads, files, folders, services, audit log, and share links
- `UnisourceClient` for authenticated app and admin API calls
- Standalone public share helpers: `getPublicFileInfo()` and `unlockPublicFile()`
- Typed error classes: `UnisourceError` and `UnisourceNetworkError`

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk test
pnpm --filter @unisource/sdk typecheck
```

## Usage

```ts
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({
  baseUrl: 'https://api.example.com',
  serviceId: 'usrc',
  getToken: async () => 'jwt-or-api-key',
});

const files = await client.myFiles.list({ folder_id: null, limit: 25 });
```

Public share flows do not require service headers:

```ts
import { getPublicFileInfo, unlockPublicFile } from '@unisource/sdk';

const info = await getPublicFileInfo('https://api.example.com', 'share-slug');
const unlocked = await unlockPublicFile('https://api.example.com', 'share-slug', 'secret');
```

## Release workflow

Because `@unisource/sdk` is public, changes should ship with a changeset:

```bash
pnpm changeset
pnpm changeset version
pnpm --filter @unisource/sdk build
pnpm changeset publish
```
