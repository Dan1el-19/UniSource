# Admin Panel Redesign

**Date:** 2026-04-23  
**Scope:** `apps/frontend/src/routes/(app)/admin/` + shared admin components

---

## Problem

The current admin panel is a single massive page with three competing sections (Service config, Activity preview, User table) lacking clear hierarchy. Priority order is inverted — user management (most frequent task) sits at the bottom, service config dominates the top.

Secondary issues: verbose AdminCard headers with design-intent descriptions, nested glass-in-glass boxes, 5-column user table with status as a redundant column, and /admin/log duplicates the preview already on the main page.

---

## Design Decisions

### Priority order (from user)
1. User management — most frequent
2. Service configuration
3. Monitoring / logs

### Navigation approach
Separate SvelteKit routes with shared tab navigation via `+layout.svelte`:
- `/admin` → redirect to `/admin/users`
- `/admin/users` — user table
- `/admin/service` — service config + usage stats
- `/admin/log` — merged activity feed

### Shared tab layout
`admin/+layout.svelte` renders the page header (title + refresh button) and the three tab links. Each child route renders only its content area. Tabs use Lucide icons (Users, Settings, FileText), active tab: border-bottom indicator + lighter background.

---

## Route Specs

### /admin/users
**User table — 4 columns:** User (name + email) / Role (badges) / Storage (value + bar) / Actions (⋮ menu)

**Status treatment:**
- Active: no badge, no indicator — silent default state
- Blocked: entire row dimmed (`opacity: 0.6`) + small red "Zablokowany" badge inline next to name

**Actions menu (⋮):** Rola i labelsy | Limit miejsca | Nadpisz hasło | separator | Zablokuj / Aktywuj konto

Modals unchanged (identity, quota, password — existing AdminModal).

### /admin/service
Two-column layout at wide viewports (7/12 + 5/12), stacked on mobile:
- **Left:** Settings form — limit storage + maks. plik (existing field-combo inputs), Save button
- **Right:** Usage stats — usage bar + percent + bytes used/max, plus 2 metric tiles (maks. plik, total users)

No nested bordered boxes inside the card — flat layout, spacing only.

### /admin/log
Merged chronological feed — audit log items and upload items interleaved, sorted by `created_at` descending.

Row format: icon (Activity or Upload) | content (action label / filename + metadata) | timestamp right-aligned

Upload rows include status badge (Gotowy / Błąd / Oczekuje). Audit rows show `resource_type` as secondary line.

Loads 40 audit + 30 upload items (same limits as current), merges client-side by timestamp.

---

## Component Changes

### AdminCard
Remove `description` prop usage from all three admin pages — card headers show only `label` + `title`. The description prop stays in the component for other potential uses.

### AdminTabs (new component)
`src/components/admin/AdminTabs.svelte` — renders the three tab links with active state detection via SvelteKit `$page.url.pathname`. Accepts no props.

### Existing admin components
AdminBadge, AdminButton, AdminInput, AdminProgress, AdminListRow, AdminModal — unchanged.

---

## File Map

**New files:**
- `src/routes/(app)/admin/+layout.svelte`
- `src/routes/(app)/admin/users/+page.svelte`
- `src/routes/(app)/admin/service/+page.svelte`
- `src/components/admin/AdminTabs.svelte`

**Rewritten:**
- `src/routes/(app)/admin/+page.svelte` → redirect to /admin/users
- `src/routes/(app)/admin/log/+page.svelte` → merged feed

**Deleted logic:**
- `dashboard-grid` layout from current admin/+page.svelte
- Activity preview section (replaced by dedicated /admin/log tab)

---

## Non-goals
- Pagination (out of scope — existing limit params unchanged)
- Inline editing (actions stay in modals)
- Any changes to backend or SDK
