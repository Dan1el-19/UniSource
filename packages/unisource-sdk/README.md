# @unisource/sdk

Publiczny pakiet TypeScript dla UniSource. Zawiera kontrakty API, schematy Zod oraz klienty HTTP używane przez frontend, backend i integracje zewnętrzne.

## Instalacja

```bash
pnpm add @unisource/sdk
```

Wersja stabilna jest publikowana pod tagiem `latest`:

```bash
pnpm add @unisource/sdk@latest
```

Wersje testowe API v2 są publikowane pod tagiem `beta`:

```bash
pnpm add @unisource/sdk@beta
```

Aktualne tagi npm:

- `latest` - stabilne API v1
- `beta` - API v2 w fazie beta, z możliwymi zmianami breaking przed stabilizacją

## Co zawiera pakiet

- Typy TypeScript i schematy Zod dla plików, folderów, uploadów, share linków, storage, usług, użytkowników i audytów.
- `UnisourceClient` dla stabilnego API v1.
- `UnisourceV2Client` oraz kontrakty v2 dostępne z `@unisource/sdk/v2`.
- Helpery publicznych linków: `getPublicFileInfo()` i `unlockPublicFile()`.
- Klasy błędów dla v1 oraz v2.

## Stabilne API v1

```ts
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({
  baseUrl: 'https://api.example.com',
  serviceId: 'default',
  getToken: async () => 'jwt-or-api-key',
});

const files = await client.myFiles.list({
  folder_id: null,
  limit: 25,
});
```

### Publiczne linki

```ts
import { getPublicFileInfo, unlockPublicFile } from '@unisource/sdk';

const info = await getPublicFileInfo('https://api.example.com', 'share-slug');

const unlocked = await unlockPublicFile(
  'https://api.example.com',
  'share-slug',
  'password'
);
```

## API v2 beta

API v2 jest dostępne w wersjach `@unisource/sdk@beta`. Importuj je z osobnego entrypointu:

```ts
import { UnisourceV2Client } from '@unisource/sdk/v2';

const client = new UnisourceV2Client({
  baseUrl: 'https://api.example.com',
  serviceId: 'default',
  getToken: async () => 'jwt-or-api-key',
  silentBeta: true,
});

const files = await client.files.list({
  folder_id: null,
  trash: 'active',
  sort_by: 'updated_at',
  sort_dir: 'desc',
  limit: 50,
});

const folders = await client.folders.list({
  parent_id: undefined,
  trash: 'active',
  sort_by: 'name',
  sort_dir: 'asc',
});
```

### Typy i schematy v2

```ts
import {
  UnisourceV2Error,
  v2FileSchema,
  v2FolderSchema,
  v2ListResponseSchema,
  type V2File,
  type V2Folder,
  type V2ListResponse,
} from '@unisource/sdk/v2';
```

V2 używa odpowiedzi stronicowanych w formacie:

```ts
interface V2ListResponse<T> {
  items: T[];
  page: {
    limit: number;
    next_cursor: string | null;
  };
}
```

### V2 paths

`UnisourceV2Client` calls dedicated `/v2/*` endpoints. Direct HTTP consumers select the V2 contract through the `/v2` URL prefix; headers do not change stable endpoint behavior.

For API-key access to user-scoped V2 storage endpoints, pass `X-Target-User-ID` through the SDK method option when the method supports acting on a target user. API keys require `files:read` for list/read operations and `files:delete` for destructive bulk operations.

## Błędy

```ts
import { UnisourceError, UnisourceNetworkError } from '@unisource/sdk';
import { UnisourceV2Error } from '@unisource/sdk/v2';

try {
  await client.myFiles.list();
} catch (error) {
  if (error instanceof UnisourceError) {
    console.error(error.status, error.message);
  }

  if (error instanceof UnisourceNetworkError) {
    console.error('Network error', error.cause);
  }
}
```

## Rozwój lokalny

Repozytorium używa pnpm workspaces.

```bash
pnpm install
pnpm --filter @unisource/sdk typecheck
pnpm --filter @unisource/sdk test
pnpm --filter @unisource/sdk build
```

W aplikacjach z tego samego monorepo używaj zależności workspace:

```json
{
  "dependencies": {
    "@unisource/sdk": "workspace:*"
  }
}
```

## Release

Stable release jest publikowany przez Changesets i workflow `Release SDK` z brancha `main`.

Beta release jest uruchamiany ręcznie z tego samego workflowu:

- branch workflowu: `main`
- `channel`: `beta`
- `bump`: `patch`, `minor`, `major` albo `next`

Pierwsza beta dla nowej linii wersji wymaga `patch`, `minor` albo `major`. Kolejne bety tej samej linii publikuj przez `next`.
