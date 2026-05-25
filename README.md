# UniSource

Monorepo UniSource zawiera prywatny frontend, prywatny backend API oraz publiczny pakiet `@unisource/sdk` z kontraktami TypeScript, schematami Zod i klientami HTTP.

## Branch i status API

Repo utrzymuje dwie główne linie pracy:

- `main` - stabilna linia dla aktualnego API i publikacji stabilnych wersji SDK.
- `beta` - linia rozwojowa dla API v2 oraz publikacji `@unisource/sdk` pod tagiem npm `beta`.

Na branchu `beta` kontrakty v2 są aktywnie rozwijane. Kod może zawierać endpointy i typy v2 przed ich stabilizacją, dlatego traktuj je jako API beta: możliwe są breaking changes przed przeniesieniem do stabilnego release.

## Struktura

```text
apps/
  frontend/          # SvelteKit + Vite, aplikacja prywatna
  backend/           # Hono API na Cloudflare Workers
packages/
  unisource-sdk/     # publiczny pakiet @unisource/sdk
scripts/             # skrypty pomocnicze dla release i workspace
```

Pakiety są zarządzane przez pnpm workspaces:

- `frontend` - aplikacja webowa, prywatna, wersjonowana tagami `frontend@x.y.z`.
- `backend` - API Hono/Cloudflare Workers, prywatne, wersjonowane tagami `backend@x.y.z`.
- `@unisource/sdk` - publiczna paczka npm; stable idzie z `main`, beta v2 z brancha `beta`.

## Wymagania

- Node.js `>=22.12.0`
- pnpm `11.1.2`
- Konto i konfiguracja Cloudflare dla aplikacji Workers

W repo używaj wyłącznie `pnpm`.

## Szybki start

```bash
pnpm install
```

Uruchomienie aplikacji lokalnie:

```bash
pnpm run frontend
pnpm run backend
```

Równoważne komendy filtrowane:

```bash
pnpm --filter frontend dev
pnpm --filter backend dev
pnpm --filter @unisource/sdk dev
```

## Konfiguracja środowiska

Backend i frontend mają przykładowe pliki konfiguracyjne:

- `apps/backend/.dev.vars.example`
- `apps/frontend/.env.example`

Skopiuj je do lokalnych plików używanych przez aplikacje:

```bash
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
cp apps/frontend/.env.example apps/frontend/.env
```

Konfigurację Wranglera można regenerować dla aplikacji:

```bash
pnpm --filter backend generate:wrangler
pnpm --filter frontend generate:wrangler
```

## Najważniejsze komendy

```bash
pnpm --filter frontend build
pnpm --filter frontend typecheck

pnpm --filter backend check
pnpm --filter backend test
pnpm --filter backend build

pnpm --filter @unisource/sdk typecheck
pnpm --filter @unisource/sdk test
pnpm --filter @unisource/sdk build
```

Backend przed sprawdzaniem typów i testami buduje lokalny SDK, bo korzysta z zależności workspace.

## SDK w aplikacjach

Domyślnie aplikacje powinny korzystać z lokalnej wersji SDK:

```json
{
  "dependencies": {
    "@unisource/sdk": "workspace:*"
  }
}
```

Skrypty pomocnicze w root przełączają źródło zależności SDK w aplikacjach:

```bash
pnpm run sdk:deps:workspace
pnpm run sdk:deps:npm
pnpm run sdk:deps:npm-exact
```

Przy zmianach w `packages/unisource-sdk` sprawdź, czy `apps/frontend` i `apps/backend` wymagają aktualizacji.

## API v2 beta

API v2 jest rozwijane równolegle w backendzie i SDK:

- backend montuje trasy `/v2/files` oraz `/v2/folders`;
- SDK eksportuje kontrakty v2 oraz klienta dostępnego z pakietu `@unisource/sdk`;
- wersje testowe SDK publikowane są jako `@unisource/sdk@beta`.

Lokalnie beta SDK nadal jest linkowane przez workspace:

```bash
pnpm --filter @unisource/sdk build
pnpm --filter backend check
```

W zewnętrznych integracjach testujących API v2 instaluj wersję beta:

```bash
pnpm add @unisource/sdk@beta
```

Przed zmianą kontraktu v2 aktualizuj jednocześnie:

- backendowe schematy i handlery w `apps/backend`;
- eksporty i typy w `packages/unisource-sdk`;
- testy backendu oraz SDK;
- konsumentów w `apps/frontend`, jeśli używają zmienianego kontraktu.

## Release i wersjonowanie

Każdy pakiet ma niezależną wersję.

### SDK stable

Stabilny SDK jest publikowany z `main` przez Changesets:

```bash
pnpm run changeset
pnpm run changeset:status
pnpm run changeset:version
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk publish --dry-run --access public --no-git-checks
pnpm run changeset:publish
```

Przed publishem upewnij się, że `packages/unisource-sdk/CHANGELOG.md` i `packages/unisource-sdk/package.json` zostały zaktualizowane przez Changesets.

### SDK beta

Beta SDK dla API v2 jest publikowana z brancha `beta` pod tagiem npm `beta`.

Workflow beta obsługuje prerelease i powinien być używany zamiast ręcznego publikowania paczki:

```bash
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk test
```

Po merge'u zmian v2 do `beta` uruchom workflow `sdk-beta-release.yml` z odpowiednim bumpem prerelease (`patch`, `minor`, `major` albo `next`, zależnie od aktualnej linii beta).

### Frontend i backend

Prywatne aplikacje nie są publikowane do npm. Wersje utrzymywane są przez tagi git:

```bash
git tag backend@1.2.0
git push origin backend@1.2.0

git tag frontend@2.0.0
git push origin frontend@2.0.0
```

Tagi mają format `<pakiet>@<wersja>`, np. `@unisource/sdk@1.1.0`, `backend@1.2.0`, `frontend@2.0.0`.

## Commity

Stosuj Conventional Commits ze scope'em:

```text
feat(sdk): dodaj klienta dla plikow
fix(backend): popraw walidacje tokenu
chore(frontend): zaktualizuj konfiguracje Vite
```

Dozwolone scope'y dla zmian pakietowych to `frontend`, `backend` i `sdk`. Dla zmian w root repo używaj `root`.

## Dokumentacja pakietów

- `apps/backend/README.md` - szczegóły backendu, moduły API, testy i deployment.
- `packages/unisource-sdk/README.md` - instalacja SDK, API v1, API v2 beta i release.
- `CONTRIBUTING.md` - skrócony workflow contributorski i release.
- `AGENTS.md` - instrukcje pracy dla agentów AI.
