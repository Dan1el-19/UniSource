# AGENTS.md — kontekst dla agenta AI

## Package manager

**Zawsze `pnpm`** — nigdy `npm` ani `yarn`. Wymagany Node.js `>=22.12.0`, pnpm `11.1.2`.

```bash
pnpm install                        # instalacja wszystkich zależności
pnpm --filter frontend ...          # komenda tylko dla frontendu
pnpm --filter backend ...           # komenda tylko dla backendu
pnpm --filter @unisource/sdk ...    # komenda tylko dla SDK
```

`pnpm-workspace.yaml` definiuje `'apps/*'` i `'packages/unisource-sdk'` jako pakiety workspace. W `allowBuilds` są `esbuild`, `sharp`, `workerd` — to wymagane dla Cloudflare Workers.

---

## Struktura

```
├── apps/
│   ├── frontend/          # SvelteKit 2 + Svelte 5 (adapter: Cloudflare Workers)
│   └── backend/           # Hono API na Cloudflare Workers
├── packages/
│   └── unisource-sdk/     # @unisource/sdk — PUBLIC, publishowany na npm
├── scripts/               # skrypty pomocnicze (changesets, wersje, deploy)
└── AGENTS.md
```

**Branch `main`** — stabilna linia (API v1, stabilne wersje SDK).
**Branch `beta`** — rozwojowa linia API v2, SDK publikowane pod tagiem npm `beta`.

---

## Komendy developerskie

### Uruchamianie lokalnie

```bash
pnpm run frontend       # frontend dev → localhost:5173
pnpm run backend        # backend dev (wrangler) → localhost:8787
pnpm --filter @unisource/sdk dev   # watch mode SDK
```

### Testowanie i sprawdzanie typów

```bash
pnpm --filter frontend typecheck
pnpm --filter frontend e2e           # Playwright (jeśli skonfigurowany)

pnpm --filter backend typecheck      # tsc --noEmit dla src i test (ale PRZED tym buduje SDK!)
pnpm --filter backend check          # typecheck + vitest run (jedna komenda, też buduje SDK przed)
pnpm --filter backend test           # vitest run (buduje SDK przed przez pretest hook)

pnpm --filter @unisource/sdk typecheck
pnpm --filter @unisource/sdk test    # build SDK + vitest
```

**Ważne:** Backend ma hooki `pretypecheck`, `pretest`, `precheck` → `pnpm --filter @unisource/sdk build`. Nie musisz ręcznie budować SDK przed testowaniem backendu.

### Budowanie

```bash
pnpm --filter frontend build
pnpm --filter backend build          # wrangler deploy --dry-run --minify
pnpm --filter @unisource/sdk build   # tsdown
```

### Generowanie konfiguracji Wranglera (CI/deploy)

```bash
pnpm --filter backend generate:wrangler
pnpm --filter frontend generate:wrangler
```

Używa `scripts/generate-wrangler-config.mjs` i zmiennych środowiskowych (`WORKER_NAME`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_NAME` itd.).

---

## Konfiguracja środowiska lokalnego

```bash
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
cp apps/frontend/.env.example apps/frontend/.env
```

Frontend ma też `BYPASS_CF_ACCESS=true` jako dev bypass dla Cloudflare Access (patrz `hooks.server.ts`).

---

## Architektura i kluczowe koncepty

```
Frontend (SvelteKit) ← HTTP → Backend (Hono) ← D1 (SQLite) / R2 / Appwrite
```

**Upload flow:** `init()` → backend zwraca presigned URL → upload do R2 → `complete()` → backend tworzy rekord w D1.

**Auth:** Backend obsługuje JWT z Appwrite ORAZ API key (API key ustawia `userId='system'`). Frontend autoryzuje przez Cloudflare Access JWT (cookie `CF_Authorization` lub header `Cf-Access-Jwt-Assertion`).

**X-Service-ID:** Endpointy `/v2/*` wymagają nagłówka `X-Service-ID`. Stable zachowuje kompatybilny fallback `default` z `main`. Middleware wymusza izolację danych między serwisami.

**Soft-delete:** Pliki są domyślnie usuwane miękko (`is_trashed=1`). Hard delete wymaga parametru `?permanent=true`.

**Rate limiting:** Zdefiniowany w `wrangler.jsonc` (limity: general 1000/min, upload init 30/min, public read 300/min, auth fail 10/min, share password 5/min).

**SDK subpath eksporty:**
- `@unisource/sdk` — API v1 (stable)
- `@unisource/sdk/v2` — API v2 (beta, tylko na branchu `beta`)

**Backend testy:** Używają `@cloudflare/vitest-pool-workers` z Miniflare. D1 migrations są wczytywane z `src/db/migrations/`. Testy nie mogą być równoległe (`fileParallelism: false`).

---

## Zależności SDK w aplikacjach

Domyślnie aplikacje używają lokalnego SDK przez workspace:

```json
{ "dependencies": { "@unisource/sdk": "workspace:*" } }
```

Skrypty do przełączania źródła:

```bash
pnpm run sdk:deps:workspace    # workspace:* (lokalny link)
pnpm run sdk:deps:npm          # ^wersja z packages/unisource-sdk/package.json
pnpm run sdk:deps:npm-exact    # dokładna wersja (pinowana)
```

Skrypt `set-app-sdk-source.mjs` odmawia ustawienia prerelease w trybach `npm` i `npm-exact` — backend deploy wymaga stabilnego SDK.

---

## Wersjonowanie i release

Każdy pakiet ma **niezależną wersję** — nie synchronizuj ich.

| Pakiet | Publikowany | Wersjonowanie |
|--------|-------------|---------------|
| `frontend` | NIE | SemVer + git tag `frontend@x.y.z` (trigger CI/CD) |
| `backend` | NIE | SemVer + git tag `backend@x.y.z` (trigger CI/CD) |
| `@unisource/sdk` | TAK, na npm | Changesets (NIGDY nie edytuj `version` ręcznie) |

### SDK stable (z main)

```bash
pnpm run changeset                   # utwórz changeset
pnpm run changeset:status            # podejrzyj plan release
pnpm run changeset:version           # zbumpuj wersję + CHANGELOG
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk publish --dry-run --access public --no-git-checks
pnpm run changeset:publish           # publish przez changesets
```

### SDK beta (z brancha beta)

Nie używaj changesets dla beta. Uruchom workflow `sdk-beta-release.yml` przez `workflow_dispatch` z odpowiednim bumpem (`patch`, `minor`, `major`, albo `next`). Workflow automatycznie bumpuje wersję, publikuje z tagiem `beta` na npm i wypycha commit + tag.

### Frontend/backend deploy

```bash
git tag backend@1.2.0 && git push origin backend@1.2.0
git tag frontend@2.0.0 && git push origin frontend@2.0.0
```

Tagi triggerują workflow deployu. Backend deploy dodatkowo aplikuje D1 migrations przed deployem.

### Git tagi — format

`<pakiet>@<wersja>`: `@unisource/sdk@1.1.0`, `backend@1.2.0`, `frontend@2.0.0`

---

## Konwencja commitów

Conventional Commits ze scope'em — rekomendowane, nie wymuszane przez tooling. CI/CD triggeruje się przez `paths:`, nie przez commit message.

```
feat(sdk): ...
fix(backend): ...
refactor(frontend): ...
chore(root): ...
```

Dodaj `!` dla breaking changes: `feat(sdk)!: ...`

Można użyć `npx cz` / `pnpm dlx commitizen` do interaktywnego tworzenia commitów.

---

## Skrypty pomocnicze w `scripts/`

| Skrypt | Cel |
|--------|-----|
| `require-sdk-changeset.mjs` | CI: sprawdza czy zmiany w SDK mają changeset |
| `require-sdk-stable-on-deploy.mjs` | CI: blokuje deploy backendu z beta SDK |
| `set-app-sdk-source.mjs` | Przełącza source SDK w apps między workspace/npm/npm-exact |
| `bump-sdk-prerelease.mjs` | CI beta: bumpuje prerelease wersję SDK |
| `generate-wrangler-config.mjs` | Generuje `wrangler.generated.jsonc` z template'u i zmiennych env |

Każdy skrypt (poza `generate-wrangler-config`) ma odpowiadający plik `.test.mjs`.

---

## Zasady

- Nie modyfikuj `version` w `package.json` ręcznie — używaj `pnpm changeset version`
- Nie publikuj na npm bez dry-run
- Przy zmianach w `@unisource/sdk` sprawdź, czy `apps/frontend` i `apps/backend` nie wymagają aktualizacji
- Przy zmianach kontraktów v2 aktualizuj jednocześnie: backend, SDK, testy, frontend
- Przy publishowaniu SDK zawsze używaj `--access public`
- Design tokens → zobacz `DESIGN.md`
