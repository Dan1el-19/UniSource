# Action Menu Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ujednolicić przycisk akcji 3 kropek w widoku tabeli adminów z kanonicznym wzorcem z `FileItem.svelte` (lista: opacity 0→1 na hover wiersza, ikona MoreVertical, z-index 50).

**Architecture:** Jedyna modyfikacja dotyczy `apps/frontend/src/routes/(app)/admin/users/+page.svelte` — zmiana ikony, owinięcie triggera w wrapper z CSS opacity, korekta z-index. `FileItem.svelte` jest wzorcem referencyjnym i nie jest modyfikowany.

**Tech Stack:** SvelteKit 2, Svelte 5, CSS variables z DESIGN.md

---

## Files

- Modify: `apps/frontend/src/routes/(app)/admin/users/+page.svelte`

---

### Task 1: Zmiana ikony MoreHorizontal → MoreVertical

**Files:**
- Modify: `apps/frontend/src/routes/(app)/admin/users/+page.svelte:4`

- [ ] **Krok 1: Zaktualizuj import ikon**

W linii 4 zmień:
```ts
import { onMount } from 'svelte';
import { KeyRound, LoaderCircle, MoreHorizontal, RefreshCw, Save } from 'lucide-svelte';
```
na:
```ts
import { onMount } from 'svelte';
import { KeyRound, LoaderCircle, MoreVertical, RefreshCw, Save } from 'lucide-svelte';
```

- [ ] **Krok 2: Zamień użycie ikony w szablonie**

W linii ~374 zmień:
```svelte
<MoreHorizontal size={16} />
```
na:
```svelte
<MoreVertical size={16} />
```

- [ ] **Krok 3: Zweryfikuj wizualnie**

Uruchom dev server i przejdź na `/admin/users` — przycisk powinien pokazywać pionowe 3 kropki.

```bash
pnpm --filter frontend dev
```

---

### Task 2: Wrapper + opacity pattern dla triggera

**Files:**
- Modify: `apps/frontend/src/routes/(app)/admin/users/+page.svelte` (template + CSS)

- [ ] **Krok 1: Owiń AdminButton w div.row-action-btn**

Znajdź fragment (~linia 365–375):
```svelte
<div class="action-anchor" data-user-action-anchor>
  <AdminButton
    variant="ghost"
    size="sm"
    iconOnly={true}
    onclick={() => toggleUserMenu(user.id)}
    aria-expanded={activeMenuUserId === user.id}
    aria-label={`Opcje dla ${user.email}`}
  >
    <MoreVertical size={16} />
  </AdminButton>

  {#if activeMenuUserId === user.id}
```

Zmień na:
```svelte
<div class="action-anchor" data-user-action-anchor>
  <div class="row-action-btn">
    <AdminButton
      variant="ghost"
      size="sm"
      iconOnly={true}
      onclick={() => toggleUserMenu(user.id)}
      aria-expanded={activeMenuUserId === user.id}
      aria-label={`Opcje dla ${user.email}`}
    >
      <MoreVertical size={16} />
    </AdminButton>
  </div>

  {#if activeMenuUserId === user.id}
```

- [ ] **Krok 2: Dodaj CSS dla opacity pattern**

W sekcji `<style>`, po bloku `.action-anchor { position: relative; }` (linia ~686), dodaj:

```css
.row-action-btn :global(button) {
  opacity: 0;
  transition: opacity var(--duration-fast) linear;
}

.users-page :global(.user-row:hover) .row-action-btn :global(button),
.users-page :global(.user-row:focus-within) .row-action-btn :global(button),
.action-anchor:focus-within .row-action-btn :global(button) {
  opacity: 1;
}

@media (max-width: 959px) {
  .row-action-btn :global(button) {
    opacity: 1;
  }
}
```

- [ ] **Krok 3: Sprawdź czy AdminListRow ma klasę user-row**

Sprawdź czy wiersz w tabeli ma klasę `user-row` (używaną w selektorze CSS). W pliku `+page.svelte` poszukaj:
```
:global(.user-row)
```
Jeśli klasa się różni, dopasuj selektor CSS do właściwej klasy.

- [ ] **Krok 4: Zweryfikuj wizualnie**

Na `/admin/users`: najedź myszą na wiersz użytkownika — przycisk powinien pojawiać się płynnie. Poza hoverem ma być niewidoczny.

---

### Task 3: Korekta z-index dropdownu

**Files:**
- Modify: `apps/frontend/src/routes/(app)/admin/users/+page.svelte` (CSS linia ~694)

- [ ] **Krok 1: Podnieś z-index**

Zmień:
```css
.action-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 12;
```
na:
```css
.action-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
```

- [ ] **Krok 2: Zweryfikuj**

Otwórz menu na `/admin/users` — dropdown powinien być wyświetlany nad wszystkimi elementami strony (sticky header, sidebar).

---

### Task 4: Commit

- [ ] **Krok 1: Zatwierdź zmiany**

```bash
git add apps/frontend/src/routes/\(app\)/admin/users/+page.svelte
git commit -m "fix(frontend): unify admin action menu with file list pattern"
```
