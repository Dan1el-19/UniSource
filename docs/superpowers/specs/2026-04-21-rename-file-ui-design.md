# Rename File UI — Design Spec

**Date:** 2026-04-21  
**Status:** Approved

## Summary

Wire up file rename in the UI. All scaffolding (RenameDialog, ContextMenu action, renameTarget state) already exists. The only missing piece is the file branch in `handleRename` — currently it throws a "not yet available" error.

## Change

**File:** `apps/frontend/src/components/files/DriveBrowser.svelte`  
**Function:** `handleRename` (lines 342–354)

Replace the current guard-and-throw pattern with a branched handler that:

1. **Folder:** calls `apiClient.folders.update(id, { name })`, uses the returned `folder` to update `folders[]` in-place via `.map()`
2. **File:** calls `apiClient.myFiles.update(id, { filename: name })`, uses the returned `file` to update `files[]` in-place via `.map()`

No `loadData()` call — both API methods return the full updated record, so the state can be patched without a round-trip refetch.

Side effect: folder rename also gains the optimistic update (previously it called `loadData()`).

## SDK Methods

- `apiClient.myFiles.update(id, { filename }): Promise<{ file: FileRecord }>` — exists in `client.ts:198`
- `apiClient.folders.update(id, { name }): Promise<{ folder: Folder }>` — exists in `client.ts:218`

## No other files change

RenameDialog, ContextMenu, renameTarget state, and dialog rendering in DriveBrowser are all complete and correct.
