# Backend Cloudflare Workers — Deploy Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wdrożyć backend `usrc-backend` na Cloudflare Workers i uruchomić CI/CD oparty na GitHub Releases.

**Architecture:** Backend działa jako Cloudflare Worker (Hono + D1 + R2 + Rate Limiter). Deploy ręczny przez `wrangler deploy`; automatyczny przez GitHub Actions — push na `main` tworzy release (semantic-release), release wyzwala deploy. SDK musi być opublikowane na npm zanim zadziała CI/CD.

**Tech Stack:** Wrangler 4, D1 (SQLite), R2, Cloudflare Rate Limiting, GitHub Actions, `cloudflare/wrangler-action@v3`, `pnpm`

---

## Mapa plików

| Plik | Rola |
|------|------|
| `apps/backend/wrangler.jsonc` | Konfiguracja workera (bindingi, cron, nazwa) |
| `apps/backend/src/db/migrations/` | 10 migracji D1 (0001–0010) |
| `apps/backend/.github/workflows/deploy.yml` | Deploy po GitHub Release |
| `apps/backend/.github/workflows/release.yml` | Semantic-release po push na main |
| `apps/backend/.dev.vars` | Lokalne sekrety (NIE w git) |
| `apps/backend/.dev.vars.example` | Szablon sekretów |
| `scripts/set-app-sdk-source.mjs` | Przełącza backend SDK: workspace ↔ npm |

---

## Task 1: Weryfikacja zasobów CF — D1, R2, konto

**Cel:** Upewnić się, że baza D1 i buckety R2 istnieją w CF zanim cokolwiek wyślemy.

**Files:**
- Read: `apps/backend/wrangler.jsonc`

- [ ] **Step 1: Zaloguj się do wranglera**

```bash
cd apps/backend
npx wrangler login
```

Oczekiwane: Otwiera przeglądarkę, potwierdzenie „Successfully logged in".

- [ ] **Step 2: Pobierz account ID**

```bash
npx wrangler whoami
```

Zanotuj `Account ID` (format: 32 znaki hex). Będzie potrzebny w Task 2.

- [ ] **Step 3: Zweryfikuj istnienie bazy D1**

```bash
npx wrangler d1 list
```

Oczekiwane: wiersz `usrc-d1` z ID `548cf71c-49e7-4080-9a16-8a6d143772c8`.

Jeśli baza nie istnieje — utwórz:

```bash
npx wrangler d1 create usrc-d1
```

Skopiuj nowe ID do `wrangler.jsonc` (pole `database_id`).

- [ ] **Step 4: Zweryfikuj istnienie bucketów R2**

```bash
npx wrangler r2 bucket list
```

Oczekiwane: wiersze `unisource` i `blokserwis`.

Jeśli brakuje — utwórz:

```bash
npx wrangler r2 bucket create unisource
npx wrangler r2 bucket create blokserwis
```

- [ ] **Step 5: Sprawdź plan CF pod kątem Rate Limiting**

Rate Limiter używa `namespace_id: 1001` (unsafe binding). To funkcja Workers Free/Paid. Wejdź na `dash.cloudflare.com → Workers & Pages → Plan` i potwierdź, że masz dostęp do Rate Limiting. Jeśli plan jest Free — funkcja działa, ale limit wynosi 1 000 000 req/mies.

---

## Task 2: Dodaj `account_id` do `wrangler.jsonc`

**Cel:** Wrangler w trybie CI musi wiedzieć, do którego konta deployować — bez `account_id` pyta interaktywnie.

> **Już zrobione:** `custom_domains` z `api.usrc.dev` jest już w `wrangler.jsonc`. Wrangler przy pierwszym deployu automatycznie utworzy rekord DNS i certyfikat TLS dla tej domeny (strefa `usrc.dev` jest aktywna w CF).

**Files:**
- Modify: `apps/backend/wrangler.jsonc`

- [ ] **Step 1: Wstaw `account_id` do konfiguracji**

Użyj wartości z `wrangler whoami` (Task 1, Step 2). Edytuj `apps/backend/wrangler.jsonc` — dodaj po `"name"`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "usrc-backend",
  "account_id": "TWOJE_32_ZNAKOWE_ACCOUNT_ID",   // ← dodaj tę linię
  "main": "src/index.ts",
  "custom_domains": [
    { "pattern": "api.usrc.dev", "zone_name": "usrc.dev" }
  ],
  // ...reszta bez zmian
}
```

- [ ] **Step 2: Zweryfikuj poprawność składni**

```bash
cd apps/backend
npx wrangler deploy --dry-run --minify 2>&1 | head -20
```

Oczekiwane: brak błędów parsowania JSONC, komunikat o suchym deployu.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/wrangler.jsonc
git commit -m "chore(backend): add account_id and api.usrc.dev custom domain to wrangler config"
```

---

## Task 3: Zastosuj migracje D1 na produkcję

**Cel:** Stworzyć schemat bazy (tabele files, folders, releases itd.) w produkcyjnej D1.

**Files:**
- Read: `apps/backend/src/db/migrations/` (0001–0010)

- [ ] **Step 1: Podejrzyj aktualny stan migracji**

```bash
cd apps/backend
npx wrangler d1 migrations list usrc-d1
```

Oczekiwane: lista 10 migracji, status „Not applied" dla wszystkich (pierwsza sesja).

- [ ] **Step 2: Zastosuj migracje**

```bash
npx wrangler d1 migrations apply usrc-d1 --remote
```

Oczekiwane: sekwencja „Applying migration 0001_uploads.sql… OK" dla każdej z 10 migracji.

- [ ] **Step 3: Potwierdź**

```bash
npx wrangler d1 migrations list usrc-d1
```

Oczekiwane: wszystkie 10 migracji ze statusem „Applied".

---

## Task 4: Ustaw sekrety produkcyjne w CF Workers

**Cel:** Dostarczyć wszystkie zmienne środowiskowe (sekrety) do produkcyjnego workera.

**Files:**
- Read: `apps/backend/.dev.vars` (lokalne wartości jako odniesienie)
- Read: `apps/backend/.dev.vars.example` (lista kluczy)

Uruchom każde polecenie osobno — wrangler zapyta o wartość interaktywnie:

- [ ] **Step 1: API key dla uploadów**

```bash
cd apps/backend
npx wrangler secret put USRC_API_KEY
```

Wklej wartość z `.dev.vars` (lub wygeneruj nowy token: `openssl rand -hex 32`).

- [ ] **Step 2: Cloudflare Account ID (dla R2 presigned URLs)**

```bash
npx wrangler secret put R2_ACCOUNT_ID
```

Wartość: ten sam account ID co w wrangler.jsonc (Task 2).

- [ ] **Step 3: R2 Access Key ID**

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
```

Wartość z `.dev.vars`. Jeśli klucz R2 jest stary/nieznany — wygeneruj nowy w `dash.cloudflare.com → R2 → Manage R2 API Tokens`.

- [ ] **Step 4: R2 Secret Access Key**

```bash
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

- [ ] **Step 5: Appwrite Endpoint**

```bash
npx wrangler secret put APPWRITE_ENDPOINT
```

Wartość: `https://fra.cloud.appwrite.io/v1`

- [ ] **Step 6: Appwrite Project ID**

```bash
npx wrangler secret put APPWRITE_PROJECT_ID
```

- [ ] **Step 7: Appwrite Bucket ID**

```bash
npx wrangler secret put APPWRITE_BUCKET_ID
```

- [ ] **Step 8: Appwrite API Key**

```bash
npx wrangler secret put APPWRITE_API_KEY
```

- [ ] **Step 9: Potwierdź listę sekretów**

```bash
npx wrangler secret list
```

Oczekiwane: 8 wpisów: `USRC_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_BUCKET_ID`, `APPWRITE_API_KEY`.

> **Uwaga:** `BLOKSERWIS_API_KEY` jest zdefiniowany w typach TypeScript (`worker-configuration.d.ts`), ale nie ma go w `.dev.vars.example` ani w komentarzach `wrangler.jsonc`. Sprawdź w kodzie, czy jest faktycznie używany — jeśli tak, dodaj go przez `wrangler secret put BLOKSERWIS_API_KEY`.

---

## Task 5: Walidacja przed deployem (dry-run)

**Cel:** Upewnić się, że build i testy przechodzą przed wysłaniem na produkcję.

- [ ] **Step 1: Uruchom testy**

```bash
cd apps/backend
pnpm test
```

Oczekiwane: `✓ N tests passed`, zero failures.

- [ ] **Step 2: Sprawdź typy**

```bash
pnpm typecheck
```

Oczekiwane: brak błędów TypeScript.

- [ ] **Step 3: Dry-run deploy**

```bash
pnpm build
```

Wewnętrznie: `wrangler deploy --dry-run --minify`. Oczekiwane: komunikat „--dry-run: exiting now" bez błędów. Sprawdź czy bundle size jest rozsądny (< 1 MB).

---

## Task 6: Pierwszy ręczny deploy

**Cel:** Wysłać workera na CF Workers produkcję.

- [ ] **Step 1: Deploy**

```bash
cd apps/backend
pnpm deploy
```

Oczekiwane końcowe linie:
```
✓ Uploading worker script...
✓ Deployed usrc-backend triggers (Xs)
  https://usrc-backend.<twoj-subdomain>.workers.dev
  https://api.usrc.dev (custom domain)
  Schedule: 0 * * * *
```

Wrangler automatycznie tworzy rekord DNS (`AAAA 100::` proxied) i certyfikat TLS dla `api.usrc.dev`. Propagacja: do 60 sekund.

- [ ] **Step 2: Smoke test — health check przez custom domain**

```bash
curl https://api.usrc.dev/health
```

Oczekiwane: HTTP 200, odpowiedź JSON z `{"status":"ok"}` lub podobna.

- [ ] **Step 3: Smoke test — brak auth**

```bash
curl -i https://api.usrc.dev/files
```

Oczekiwane: HTTP 401 (brak autoryzacji). Potwierdza, że middleware auth działa.

- [ ] **Step 4: Weryfikacja sekretów**

```bash
curl -i -H "X-Service-ID: test" -H "Authorization: Bearer USRC_API_KEY_VALUE" \
  https://api.usrc.dev/upload/init \
  -d '{}' -H "Content-Type: application/json"
```

Oczekiwane: HTTP 400 (brak wymaganych pól) lub 422 — NIE 500. HTTP 500 oznacza problem z sekretami lub bindingami.

---

## Task 7: Skonfiguruj GitHub Actions secrets

**Cel:** Umożliwić automatyczny deploy przez CI/CD po stworzeniu GitHub Release.

**Files:**
- Read: `apps/backend/.github/workflows/deploy.yml`
- Read: `apps/backend/.github/workflows/release.yml`

- [ ] **Step 1: Utwórz Cloudflare API Token**

Wejdź na `dash.cloudflare.com → My Profile → API Tokens → Create Token`.

Szablon: **Edit Cloudflare Workers**. Zakres:
- Account: Workers Scripts — Edit
- Account: Workers KV Storage — Edit  
- Account: D1 — Edit
- Zone: nie trzeba

Skopiuj token (pokazuje się tylko raz).

- [ ] **Step 2: Dodaj `CLOUDFLARE_API_TOKEN` do GitHub**

Repozytorium → Settings → Secrets and variables → Actions → New repository secret:
- Name: `CLOUDFLARE_API_TOKEN`
- Value: token z Step 1

- [ ] **Step 3: Utwórz `SEMANTIC_RELEASE_TOKEN`**

Wejdź na `github.com → Settings → Developer settings → Personal access tokens → Fine-grained`.

Uprawnienia:
- Contents: Read and write
- Metadata: Read
- Pull requests: Read and write (potrzebne dla changelog PR)

Skopiuj token.

- [ ] **Step 4: Dodaj `SEMANTIC_RELEASE_TOKEN` do GitHub**

Repozytorium → Settings → Secrets and variables → Actions → New repository secret:
- Name: `SEMANTIC_RELEASE_TOKEN`
- Value: token z Step 3

- [ ] **Step 5: Zaktualizuj permissions w release.yml**

Workflow `release.yml` ma `permissions: contents: read` — za mało do pisania tagów. Zmień:

```yaml
permissions:
  contents: write
  pull-requests: write
```

```bash
git add apps/backend/.github/workflows/release.yml
git commit -m "fix(ci): fix release workflow permissions for semantic-release"
```

---

## Task 8: Weryfikacja CI/CD — publikacja SDK i test pipeline

**Cel:** Upewnić się, że automatyczny deploy zadziała. Deploy CI (`deploy.yml`) przełącza SDK na wersję z npm (`sdk:deps:npm`) — SDK musi być opublikowane.

- [ ] **Step 1: Sprawdź aktualną wersję SDK na npm**

```bash
npm view @unisource/sdk version 2>/dev/null || echo "SDK nie jest na npm"
```

Jeśli SDK nie jest na npm — **zatrzymaj się tutaj** i opublikuj SDK najpierw:
```bash
# W katalogu głównym:
pnpm run release:sdk
```

(wymaga changelogu — `pnpm changeset` → `pnpm changeset version` → `pnpm changeset publish`)

- [ ] **Step 2: Sprawdź, czy skrypt `sdk:deps:npm` działa poprawnie**

```bash
cd /root  # powróć do katalogu głównego projektu
pnpm run sdk:deps:npm
cat apps/backend/package.json | grep unisource
```

Oczekiwane: `"@unisource/sdk": "^X.Y.Z"` (wersja npm, nie `workspace:*`).

Przywróć workspace po teście:

```bash
pnpm run sdk:deps:workspace
```

- [ ] **Step 3: Zainicjuj test pipeline — push na main**

```bash
git push origin main
```

Wejdź na GitHub → Actions → zakładka **Release**. Obserwuj czy workflow się uruchamia i przechodzi.

- [ ] **Step 4: Zweryfikuj automatyczny deploy**

Po pomyślnym release, GitHub Actions powinien stworzyć release tag i wyzwolić `deploy.yml`. Wejdź na GitHub → Actions → **Deploy Workers** — sprawdź status.

Końcowy smoke test po CI deploy:

```bash
curl https://usrc-backend.<twoj-subdomain>.workers.dev/health
```

---

## Task 9: Monitoring i post-deploy

**Cel:** Potwierdzić, że cron, logi i metryki działają.

- [ ] **Step 1: Weryfikacja crona**

Wejdź na `dash.cloudflare.com → Workers & Pages → usrc-backend → Triggers`. Potwierdź, że widoczny jest cron `0 * * * *`.

Sprawdź logi crona po pierwszym godzinnym uruchomieniu:

```bash
npx wrangler tail --format pretty
```

Oczekiwane: wpis z `cleanupOrphanedUploads` co godzinę.

- [ ] **Step 2: Włącz Workers Logs (opcjonalnie)**

`dash.cloudflare.com → Workers & Pages → usrc-backend → Observability` → Enable Logs. Ustaw retention na 3 dni (free tier).

- [ ] **Step 3: Commit końcowy stanu**

```bash
git add apps/backend/wrangler.jsonc
git status  # upewnij się że .dev.vars NIE jest staged
git commit -m "chore(backend): finalize deploy config" --allow-empty-if-no-changes
```

---

## Checklist — przed uznaniem za ukończone

- [ ] `wrangler d1 migrations list usrc-d1` — 10 migracji ze statusem `Applied`
- [ ] `wrangler secret list` — 8 sekretów na liście
- [ ] `curl /health` → 200
- [ ] `curl /files` bez auth → 401
- [ ] GitHub Actions → Deploy Workers → zielony
- [ ] Cron widoczny w dashboardzie CF

---

---

## Task 10: Przenieś workflows do root `.github/workflows/`

**Cel:** GitHub Actions **tylko** czyta workflows z `{root}/.github/workflows/`. Pliki w `apps/backend/.github/workflows/` są martwe — nigdy nie uruchamiane automatycznie.

**Files:**
- Move: `apps/backend/.github/workflows/deploy.yml` → `.github/workflows/backend-deploy.yml`
- Move: `apps/backend/.github/workflows/release.yml` → `.github/workflows/backend-release.yml`
- Create: `.github/workflows/` (jeśli nie istnieje)

- [ ] **Step 1: Utwórz katalog i przenieś pliki**

```bash
mkdir -p .github/workflows
cp apps/backend/.github/workflows/deploy.yml .github/workflows/backend-deploy.yml
cp apps/backend/.github/workflows/release.yml .github/workflows/backend-release.yml
```

- [ ] **Step 2: Dodaj path filter i workingDirectory do `backend-deploy.yml`**

`wrangler-action` musi wiedzieć, gdzie leży `wrangler.jsonc`. Zastąp całą zawartość:

```yaml
name: Deploy Backend

on:
  release:
    types:
      - published

concurrency:
  group: workers-production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    if: ${{ github.event.release.prerelease == false && startsWith(github.event.release.tag_name, 'backend@') }}
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.release.tag_name }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Switch app SDK dependency source to npm
        run: pnpm run sdk:deps:npm

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile --config.link-workspace-packages=false

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          packageManager: pnpm
          workingDirectory: apps/backend
          command: deploy --minify
```

- [ ] **Step 3: Zaktualizuj `backend-release.yml` — permissions i path filter**

Zastąp całą zawartość:

```yaml
name: Release Backend

on:
  push:
    branches:
      - main
    paths:
      - 'apps/backend/**'
      - '!apps/backend/.github/**'
  workflow_dispatch:

concurrency:
  group: release-backend
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    name: Release
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify backend
        run: pnpm --filter usrc-backend check

      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}
        working-directory: apps/backend
        run: pnpm release
```

- [ ] **Step 4: Usuń stare workflow pliki**

```bash
rm apps/backend/.github/workflows/deploy.yml
rm apps/backend/.github/workflows/release.yml
rmdir apps/backend/.github/workflows
rmdir apps/backend/.github
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/backend-deploy.yml .github/workflows/backend-release.yml
git rm apps/backend/.github/workflows/deploy.yml apps/backend/.github/workflows/release.yml
git commit -m "chore(ci): move workflows to root, add path filters and workingDirectory"
```

---

## Task 11: Skonfiguruj semantic-release dla backendu

**Cel:** Naprawić `pnpm release` (nie istnieje) i skonfigurować semantic-release, który na podstawie commitów Conventional Commits automatycznie tworzy GitHub Release z tagiem `backend@X.Y.Z`, co wyzwala deploy.

**Files:**
- Create: `apps/backend/.releaserc.json`
- Modify: `apps/backend/package.json` — dodaj script `release`
- Install dev deps w `apps/backend`

- [ ] **Step 1: Zainstaluj semantic-release i pluginy**

```bash
pnpm --filter usrc-backend add -D \
  semantic-release \
  @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator \
  @semantic-release/github
```

- [ ] **Step 2: Utwórz `.releaserc.json` w `apps/backend/`**

```json
{
  "branches": ["main"],
  "tagFormat": "backend@${version}",
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "preset": "angular",
      "releaseRules": [
        { "type": "feat", "release": "minor" },
        { "type": "fix", "release": "patch" },
        { "type": "perf", "release": "patch" },
        { "breaking": true, "release": "major" }
      ]
    }],
    "@semantic-release/release-notes-generator",
    ["@semantic-release/github", {
      "successComment": false,
      "failTitle": false
    }]
  ]
}
```

> Tagi w formacie `backend@1.2.3` zapewniają izolację od tagów SDK w tym samym repo.

- [ ] **Step 3: Dodaj script `release` do `apps/backend/package.json`**

W sekcji `"scripts"` dodaj:

```json
"release": "semantic-release"
```

Wynik po edycji:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --minify",
    "deploy": "wrangler deploy --minify",
    "cf-typegen": "wrangler types --env-interface CloudflareBindings",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p test/tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc -p tsconfig.json --noEmit && tsc -p test/tsconfig.json --noEmit && vitest run",
    "release": "semantic-release"
  }
}
```

- [ ] **Step 4: Zweryfikuj lokalnie (dry-run)**

```bash
cd apps/backend
GH_TOKEN=TWOJ_PAT pnpm release --dry-run
```

Oczekiwane: semantic-release analizuje commity od ostatniego tagu, pokazuje planowaną wersję (bez tworzenia release). Jeśli brak tagów `backend@*` w historii — traktuje wszystkie commity jako nowe.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/.releaserc.json apps/backend/package.json pnpm-lock.yaml
git commit -m "chore(backend): configure semantic-release with backend@ tag format"
```

---

## Task 12: Skonfiguruj CI dla publikowania SDK (changesets)

**Cel:** Automatyzacja publikowania `@unisource/sdk` na npm. Changesets Action:
- Na push do `main` z plikami changeset → tworzy/aktualizuje PR „Version Packages"
- Na merge PR → publikuje do npm automatycznie

**Files:**
- Create: `.github/workflows/sdk-release.yml`
- GitHub secret: `NPM_TOKEN`

- [ ] **Step 1: Utwórz npm Automation Token**

Wejdź na `npmjs.com → Account → Access Tokens → Generate New Token → Automation`.

Skopiuj token (format: `npm_...`).

- [ ] **Step 2: Dodaj `NPM_TOKEN` do GitHub Secrets**

Repozytorium → Settings → Secrets and variables → Actions → New repository secret:
- Name: `NPM_TOKEN`
- Value: token z Step 1

- [ ] **Step 3: Utwórz `.github/workflows/sdk-release.yml`**

```yaml
name: Release SDK

on:
  push:
    branches:
      - main
    paths:
      - 'packages/unisource-sdk/**'
      - '.changeset/**'
  workflow_dispatch:

concurrency:
  group: release-sdk
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    name: Release
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify SDK
        run: pnpm --filter @unisource/sdk typecheck && pnpm --filter @unisource/sdk test

      - name: Publish or open Version PR
        uses: changesets/action@v1
        with:
          publish: pnpm run changeset:publish
          version: pnpm run changeset:version
          commit: "chore(sdk): version packages"
          title: "chore(sdk): version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.SEMANTIC_RELEASE_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

> **Jak to działa:** Gdy commitniesz `.changeset/*.md` i pushniesz na main, action tworzy PR „chore(sdk): version packages". Gdy ten PR zostanie zmergowany — action automatycznie publikuje pakiet na npm.

- [ ] **Step 4: Zweryfikuj, czy SDK ma prawidłowe `repository` i `publishConfig` w package.json**

```bash
cat packages/unisource-sdk/package.json | grep -E '"publishConfig|"repository|"access'
```

Oczekiwane: `"access": "public"` (lub `publishConfig.access: "public"`). Jeśli brak:

```json
// dodaj do packages/unisource-sdk/package.json:
"publishConfig": {
  "access": "public"
}
```

- [ ] **Step 5: Test flow — dodaj changeset i push**

```bash
# W katalogu głównym:
pnpm changeset
# → wybierz @unisource/sdk, typ: patch, wpisz opis
```

```bash
git add .changeset/
git commit -m "chore: add changeset for SDK test release"
git push origin main
```

Obserwuj GitHub → Actions → **Release SDK**. Oczekiwane: action tworzy PR „chore(sdk): version packages" z podbita wersją.

- [ ] **Step 6: Commit workflow**

```bash
git add .github/workflows/sdk-release.yml
git commit -m "chore(ci): add SDK release workflow via changesets"
```

---

## Checklist — pełna CI/CD weryfikacja

- [ ] `.github/workflows/backend-release.yml` uruchamia się po push do `main` z commitami w `apps/backend/`
- [ ] `.github/workflows/backend-deploy.yml` uruchamia się po GitHub Release `backend@X.Y.Z`
- [ ] `.github/workflows/sdk-release.yml` uruchamia się po push z plikami `.changeset/`
- [ ] SDK pojawia się na `npmjs.com/@unisource/sdk` po merge PR
- [ ] Backend pojawia się na `https://usrc-backend.*.workers.dev` po merge release PR

---

## Znane pułapki

| Problem | Przyczyna | Rozwiązanie |
|---------|-----------|-------------|
| CI deploy fails: `Cannot find module '@unisource/sdk'` | SDK nie na npm | Opublikuj SDK przed deploy |
| `wrangler secret put` nie znane w CI | Token CF za wąski zakres | Użyj szablonu „Edit Cloudflare Workers" |
| HTTP 500 po deployu | Sekret nie ustawiony lub brak bindingu | `wrangler tail`, szukaj błędu w logach |
| Rate Limiter błąd: `Namespace not found` | namespace_id `1001` jest hardcoded placeholder | Sprawdź w CF dashboard czy Rate Limiting jest aktywne |
| `release.yml` nie pushuje tagu | Zły scope PAT | PAT musi mieć `contents: write` |
| Workflows nie uruchamiają się | Pliki w `apps/backend/.github/` zamiast root `.github/` | Task 10: przenieś do `{root}/.github/workflows/` |
| SDK publish: `403 Forbidden` | Brak `NPM_TOKEN` lub token nie jest Automation type | Utwórz token typu Automation, nie Classic |
| Changesets nie tworzy PR | Brak `.changeset/*.md` przy pushu | Najpierw `pnpm changeset`, potem push |
| `wrangler-action` nie widzi `wrangler.jsonc` | Brak `workingDirectory: apps/backend` | Zaktualizowany `backend-deploy.yml` w Task 10 to naprawia |
