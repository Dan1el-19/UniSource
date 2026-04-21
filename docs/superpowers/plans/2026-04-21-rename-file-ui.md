# Rename File UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable file rename in DriveBrowser by wiring up `apiClient.myFiles.update` in `handleRename`, updating state in-place from the API response.

**Architecture:** Single function change in DriveBrowser.svelte. Both folder and file branches use the API response to patch their respective state arrays (`folders[]` / `files[]`) via `.map()` — no full `loadData()` needed.

**Tech Stack:** SvelteKit 2, Svelte 5, `@unisource/sdk` (`apiClient.myFiles.update`, `apiClient.folders.update`)

---

### Task 1: Update `handleRename` in DriveBrowser.svelte

**Files:**
- Modify: `apps/frontend/src/components/files/DriveBrowser.svelte:342-354`

- [ ] **Step 1: Apply the change**

Replace lines 342–354 in `DriveBrowser.svelte`:

```ts
// BEFORE
async function handleRename(name: string) {
  if (!renameTarget) {
    return;
  }

  if (!isFolderItem(renameTarget)) {
    throw new Error('Zmiana nazwy plików nie jest jeszcze dostępna po stronie API.');
  }

  await apiClient.folders.update(renameTarget.folder.id, { name });
  await loadData();
  setOperationMessage(`Zmieniono nazwę folderu na: ${name}`);
}
```

```ts
// AFTER
async function handleRename(name: string) {
  if (!renameTarget) {
    return;
  }

  if (isFolderItem(renameTarget)) {
    const { folder } = await apiClient.folders.update(renameTarget.folder.id, { name });
    folders = folders.map((f) => (f.id === folder.id ? folder : f));
    setOperationMessage(`Zmieniono nazwę folderu na: ${name}`);
  } else {
    const { file } = await apiClient.myFiles.update(renameTarget.file.id, { filename: name });
    files = files.map((f) => (f.id === file.id ? file : f));
    setOperationMessage(`Zmieniono nazwę pliku na: ${name}`);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/files/DriveBrowser.svelte docs/superpowers/specs/2026-04-21-rename-file-ui-design.md docs/superpowers/plans/2026-04-21-rename-file-ui.md
git commit -m "feat(frontend): wire up file rename via myFiles.update with in-place state patch"
```
