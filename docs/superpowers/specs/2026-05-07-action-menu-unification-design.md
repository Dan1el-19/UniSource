# Action Menu Unification — Design Spec
Date: 2026-05-07

## Goal

Unify all "3-dot action button" patterns across the app to follow two consistent visual rules:

- **Grid context** (card/thumbnail): semi-transparent elevated background always visible → button stands out against the thumbnail before any interaction.
- **List/table context** (rows): fully transparent background, `opacity: 0 → 1` when the parent row is hovered → button "materializes" on hover.

## Scope of changes

Only `apps/frontend/src/routes/(app)/admin/users/+page.svelte`.  
`FileItem.svelte` already implements the canonical pattern correctly — it is the reference.

## Inconsistencies to fix

| # | Issue | Fix |
|---|-------|-----|
| 1 | Icon `MoreHorizontal` (admin) vs `MoreVertical` (files) | Replace with `MoreVertical` |
| 2 | `z-index: 12` on `.action-menu` — too low, risks being covered by sticky elements | Raise to `50` |
| 3 | Trigger button always fully visible (no opacity transition on row hover) | Add `opacity: 0 → 1` on row hover, matching `.context-btn` in FileItem |

## What is NOT changed

- The dropdown itself (`{#if activeMenuUserId === user.id}`) stays conditional — this is correct; the dropdown opens/closes on click.
- `FileItem.svelte` — already correct, no changes.
- All modal components — z-index hierarchy is correct and consistent already.
- `ContextMenu.svelte` — shared and correct.

## Implementation details

### 1. Icon change
Remove `MoreHorizontal` from the import, add `MoreVertical`. Replace `<MoreHorizontal size={16} />` with `<MoreVertical size={16} />`.

### 2. Trigger button wrapper
Wrap the `AdminButton` trigger in a `<div class="row-action-btn">`. This gives a stable CSS hook without touching the `AdminButton` component internals.

### 3. CSS — opacity pattern (list style)
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
  .row-action-btn :global(button) { opacity: 1; }
}
```

### 4. z-index fix
`.action-menu { z-index: 50; }` — aligns with `BottomDock` level, safely above sticky header (35) and sidebar (40).
