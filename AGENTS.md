# Monorepo — kontekst dla agenta AI

## Struktura repo

```
monorepo/
├── apps/
│   ├── frontend/          # Astro + Svelte Islands — private, deploy na hosting
│   └── backend/           # Hono API — private, deploy na serwer
├── packages/
│   └── unisource-sdk/     # @unisource/sdk — PUBLIC, publishowany na npm
├── package.json           # pnpm workspace root (no version, private: true)
└── AGENTS.md              # ten plik
```

## Package manager

**pnpm workspaces** — zawsze używaj `pnpm`, nigdy `npm` ani `yarn` w tym repo.

```bash
pnpm install                      # instalacja wszystkich zależności
pnpm --filter frontend ...        # komenda tylko dla frontendu
pnpm --filter backend ...         # komenda tylko dla backendu
pnpm --filter @unisource/sdk ...  # komenda tylko dla SDK
```

---

## Zasady wersjonowania

### Każdy pakiet żyje własnym życiem

Wersje są **całkowicie niezależne** — zmiana wersji w jednym pakiecie nie wpływa na inne.

| Pakiet | Ścieżka | `private` | Publishowany | Wersjonowanie |
|--------|---------|-----------|--------------|---------------|
| `frontend` | `apps/frontend` | `true` | NIE | Semantic Versioning, opcjonalne |
| `backend` | `apps/backend` | `true` | NIE | Semantic Versioning, opcjonalne |
| `@unisource/sdk` | `packages/unisource-sdk` | `false` | TAK, na npm | Semantic Versioning, obowiązkowe |

### Jak bumpować wersję SDK

```bash
cd <root-monorepo>

# 1. Dodaj changeset opisujący zmiany w @unisource/sdk
pnpm changeset

# 2. Podejrzyj plan release (opcjonalnie)
pnpm changeset status --verbose

# 3. Zbumpuj wersję i changelog na bazie changesetów
pnpm changeset version
```

`pnpm changeset version` nie publikuje paczki i nie tworzy tagów automatycznie.

### Git tagi — format

Tagi zawsze w formacie `<pakiet>@<wersja>`:
- `@unisource/sdk@0.1.1`
- `backend@1.2.0`
- `frontend@2.0.0`

---

## Konwencja commitów (Conventional Commits)

Conventional Commits ze scope'em są rekomendowane dla czytelności historii git,
ale nie są wymagane przez narzędzia release ani pipeline.

Pipeline CI/CD na GitHub Actions uruchamia się na podstawie zmienionych ścieżek (`paths:`),
nie na podstawie treści commit message.

W praktyce scope pomaga zrozumieć, co zmieniasz:

```
<type>(<scope>): <opis>

feat(sdk): dodaj metodę getInvoice()
fix(backend): popraw walidację tokenu auth
feat(frontend): nowa strona kontaktowa
chore(sdk): update zależności
docs(backend): dodaj JSDoc do endpointów
refactor(frontend): wydziel komponent Header
test(sdk): testy jednostkowe dla parseResponse
```

### Dozwolone typy

| Typ | Kiedy |
|-----|-------|
| `feat` | nowa funkcjonalność |
| `fix` | naprawa buga |
| `docs` | tylko dokumentacja |
| `refactor` | refaktoryzacja bez zmiany zachowania |
| `test` | dodanie/zmiana testów |
| `chore` | update deps, konfiguracja, tooling |
| `perf` | optymalizacja wydajności |
| `ci` | zmiany w CI/CD |

### Dozwolone scope'y

| Scope | Lokalizacja |
|-------|-------------|
| `frontend` | `apps/frontend` |
| `backend` | `apps/backend` |
| `sdk` | `packages/unisource-sdk` |
| `root` | pliki w root repo (package.json, pnpm-workspace.yaml itp.) |

### Breaking changes

Jeśli commit wprowadza breaking change, dodaj `!` po scope'ie i opisz w stopce:

```
feat(sdk)!: zmień sygnaturę metody connect()

BREAKING CHANGE: parametr `url` jest teraz obiektem { host, port } zamiast stringa
```

---

## Publishowanie @unisource/sdk na npm

```bash
cd <root-monorepo>

# 1. Upewnij się że jesteś zalogowany
pnpm whoami

# 2. Dodaj changeset dla zmian SDK
pnpm changeset

# 3. Zbumpuj wersję i changelog
pnpm changeset version

# 4. Zbuilduj paczkę SDK
pnpm --filter @unisource/sdk build

# 5. Sprawdź co trafi na npm (dry run)
pnpm --filter @unisource/sdk publish --dry-run --access public --no-git-checks

# 6. Opublikuj paczkę przez changesets
pnpm changeset publish

# 7. Wypchnij commity i ewentualne tagi do GitHub
git push origin main --follow-tags
```

### Przed każdym publishem sprawdź

- [ ] changeset dla SDK istnieje i jest poprawny
- [ ] `CHANGELOG.md` w `packages/unisource-sdk` został zaktualizowany przez `pnpm changeset version`
- [ ] Wersja w `packages/unisource-sdk/package.json` jest zbumpowana
- [ ] Build przechodzi bez błędów
- [ ] Eksportowane typy TypeScript są poprawne

---

## CHANGELOG.md

Każdy pakiet może mieć własny `CHANGELOG.md`, ale dla SDK changelog aktualizuje
`pnpm changeset version`. Ręcznie dopracowuj wpisy tylko gdy to konieczne.

Format:

```markdown
# Changelog

## [0.2.0] - 2024-04-19

### Added
- Metoda `getInvoice(id)` zwracająca szczegóły faktury
- Obsługa błędów 429 (rate limiting)

### Fixed
- Niepoprawny typ zwracany przez `listClients()`

## [0.1.0] - 2024-03-01

### Added
- Inicjalny release
```

---

## Zależności między pakietami

`frontend` i `backend` mogą importować `@unisource/sdk` jako workspace dependency:

```json
// apps/frontend/package.json lub apps/backend/package.json
{
  "dependencies": {
    "@unisource/sdk": "workspace:*"
  }
}
```

pnpm automatycznie linkuje lokalną wersję podczas developmentu.

---

## Czego agent NIE powinien robić

- ❌ Nie synchronizuj wersji między pakietami — każdy żyje własnym życiem
- ❌ Nie używaj `npm` ani `yarn` — tylko `pnpm`
- ❌ Nie pushuj tagów bez zbuildowania i przetestowania paczki
- ❌ Nie publikuj na npm bez dry-run najpierw
- ❌ Nie modyfikuj `version` w `package.json` ręcznie — używaj `pnpm changeset version`

## Co agent POWINIEN robić

- ✅ Zawsze pytaj który pakiet jest zmieniany gdy jest niejednoznaczność
- ✅ Jeśli używasz Conventional Commits, stosuj czytelny scope (`feat(sdk):`, `fix(backend):` itp.)
- ✅ Przy zmianach w `@unisource/sdk` sprawdź czy `apps/frontend` i `apps/backend` nie wymagają aktualizacji
- ✅ Przy breaking change w SDK zaproponuj bump major version i zaktualizuj konsumentów
- ✅ Przypominaj o aktualizacji CHANGELOG przed publishem SDK
- ✅ Przy publishowaniu używaj flagi `--access public` (scoped paczki są domyślnie private na npm)