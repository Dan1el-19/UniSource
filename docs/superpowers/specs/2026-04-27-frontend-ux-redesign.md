# UniSource Frontend — Kompleksowe przeprojektowanie UX

**Data:** 2026-04-27  
**Zakres:** `apps/frontend/src`  
**Podejście:** Mobile-first, Structural Overhaul — zachowanie obecnej palety kolorów i tokenów, naprawa layoutu, unifikacja systemu komponentów, poprawa UX każdej strony

---

## 1. Zdiagnozowane problemy

### Globalne
- Brak spójności: komponent `Admin*` tworzy osobny design system (AdminButton, AdminCard, AdminInput, AdminSelect, AdminBadge, AdminProgress, AdminTabs, AdminListRow, AdminModal) z własną typografią (`--admin-text-*`), podczas gdy główna aplikacja ma swój system
- Sidebar ma czerwony przycisk "Wyloguj" jako agresywny CTA na dole — złe UX
- Brak nawigacji mobilnej (sidebar jest ukrywany, nie zastępowany)
- Brak wskaźnika zajętego storage w UI użytkownika
- Strony nie wypełniają dostępnej przestrzeni — dużo czarnej pustki

### Mój dysk
- Search bar zamknięty w osobnym kontenerze/karcie — zbędna warstwa wizualna
- Toolbar (Nowy folder, Wgraj, widoki) — spójny, ale mógłby być bardziej zintegrowany

### Udostępnione
- Karta z empty state pływa w górnej części czarnej pustki — nie jest wyśrodkowana pionowo w viewport
- Sam layout strony jest uszkodzony (nie wypełnia content area)

### Kosz
- Ogromna luka między podtytułem a tabelą (brak treści górnej)
- "Nagłówek tabeli" (Nazwa / Akcje) jest jako osobna karta bez danych, oderwana od listy
- Każdy element jest oddzielną kartą z dużym marginesem — `gap` między kartami jest za duży
- Brak potwierdzenia przed "Usuń na zawsze"
- Brak "Opróżnij kosz" / bulk actions

### Admin — Users
- Osobny eyebrow "ADMIN" badge — poczucie naklejki
- AdminCard, AdminButton, AdminInput, AdminSelect — całkowicie oddzielny system
- Progress bar w tabeli bez procentu — użytkownik musi liczyć mentalnie
- Brak wskaźnika rozmiaru kolumn na mobilnych (tabela 5 kolumn na 360px)

### Admin — Log
- Dwa typy danych (audit log + upload records) wymieszane bez wizualnego rozróżnienia
- "Link udostępnienia / FILE" i "ps-cctv-kolumny.docx / 102.6 KB / Gotowy" — kompletnie inne wzorce w jednym feedzie
- Brak grupowania po dacie (Dziś, Wczoraj itp.)
- Brak filtrowania

### Admin — Serwis
- Dobre — layout 7/5 kolumn na desktop działa
- Używa Admin* komponentów — do ujednolicenia

### Ustawienia
- Karta zbyt wąska (ok. 500px na 1920px ekranie) — ogromna pusta przestrzeń po bokach
- Wyloguj zarówno w sidebarze jak i w ustawieniach — duplikacja

---

## 2. Zasady projektowe

1. **Mobile-first** — każdy komponent zaprojektowany najpierw dla 360px, rozszerzony dla większych breakpointów
2. **Breakpointy globalne (ujednolicone):**
   - `sm`: 640px (małe telefony → średnie)
   - `md`: 768px (tablet portrait)
   - `lg`: 1024px (tablet landscape / desktop)
   - `xl`: 1280px (desktop)
   - `2xl`: 1536px (wide desktop)
3. **Jeden system komponentów** — koniec z `Admin*`. Komponenty główne z wariantami.
4. **Content area wypełnia przestrzeń** — żadnych pływających kart w czarnej pustce
5. **Spójny page header** — każda strona ma ten sam wzorzec: tytuł + opcjonalne akcje
6. **Potwierdzenie destrukcyjnych akcji** — permanent delete zawsze pokazuje confirm dialog
7. **Loading states** — wszystkie async buttony mają stan ładowania

---

## 3. Layout Shell — Redesign

### Obecny stan
```
[Sidebar 240px fixed] [Content area]
Sidebar: Logo + Nav + red Wyloguj button
Mobile: Sidebar hidden, nothing replaces it
```

### Nowy design

**Desktop (≥1024px):**
```
[Sidebar 220px] [Content area full-width]
Sidebar: Logo → Nav items → (spacer) → Storage indicator → Settings icon
```

**Tablet (768px–1023px):**
```
[Sidebar 60px icons-only] [Content area]
```

**Mobile (<768px):**
```
[Content area full-width]
[Bottom Tab Bar: fixed, 5 tabs]
```

### Sidebar — Szczegóły
- **Usuń** czerwony "Wyloguj" button z sidebar (przeniesiony do Ustawień)
- **Dodaj** na dole (przed Settings link): storage indicator
  - Mini progress bar + "2.3 MB z 150 GB"
  - Na tablet: tylko ikona HardDrive z tooltip
- Nav items: ikona + label (desktop), tylko ikona (tablet)
- Active state: left border accent + subtle bg (bez zmiany)
- Collapse/expand: NIE (zbyt złożone, nie ma potrzeby przy 5 items)

### Bottom Tab Bar — Mobile
Komponenty: `BottomDock.svelte` (przepisany)
- Tabs: Dysk | Udostępnione | Kosz | Admin (tylko admins) | Ustawienia
- Ikony + krótkie labele
- Aktywna zakładka: accent color na ikonie
- `position: fixed; bottom: 0; safe-area-inset-bottom`
- Ukryta na ≥768px

---

## 4. Mój dysk — Redesign

### Toolbar
- **Obecny**: search bar jako osobna karta, Nowy folder + Wgraj + view toggle jako kolejna karta
- **Nowy**: jeden zunifikowany toolbar bez zbędnych border-radius wrapperów
  - `[Search ...] [Nowy folder] [Wgraj] [List|Grid toggle]`
  - Mobile: search rozwijany (ikona → input), Nowy folder i Wgraj jako FAB lub w menu

### FileList — Responsywność
**Mobile (<768px):** Tylko Nazwa (ikona + nazwa + typ), tap = open, hold/swipe = context menu  
**Tablet (768px–1023px):** Nazwa + Rozmiar + menu icon (data ukryta)  
**Desktop (≥1024px):** Nazwa + Rozmiar + Zmodyfikowano + menu icon  

### Context Menu
- Bez zmian w funkcjonalności
- Dodać: `role="menu"`, `aria-label`, nawigacja klawiaturą (arrow keys)

---

## 5. Udostępnione — Redesign

### Problem
Empty state karta pływa w górnej 1/3 strony.

### Rozwiązanie
- Strona ma `min-height: 100%` z flexbox `align-items: center; justify-content: center`
- Empty state: wyśrodkowany pionowo i poziomo
- Ikona + tytuł + opis + button — bez karty-wrapper (lub karta z max-width 400px, wyśrodkowana)
- Spójny wzorzec empty state z resztą aplikacji

---

## 6. Kosz — Redesign

### Problem
- Luka między subtitle a tabelą
- Nagłówek tabeli oderwany od danych (osobna karta)
- Każdy element = osobna karta z dużym marginesem

### Rozwiązanie

```
[Page Header: "Kosz" + "Opróżnij kosz" button (danger, disabled gdy pusty)]

[Single container card:]
  [Table header row: Nazwa | Data usunięcia | Akcje]
  [Divider]
  [Item rows: inline, bez separujących kart]
  
  [Empty state if no items: centered inside card]
```

**Mobile:** Kolumny redukowane — tylko Nazwa + Akcje (ikony bez labeli)  
**Tablet:** Nazwa + Data + Akcje  
**Desktop:** pełen widok  

### Permanent Delete Confirmation
- `ConfirmDialog.svelte` (reużywalny) — modal z:
  - Tytuł: "Usunąć na zawsze?"
  - Opis: "Plik '[nazwa]' zostanie usunięty bezpowrotnie."
  - [Anuluj] [Usuń na zawsze] (danger button)

### Opróżnij kosz
- Button w page header (danger/secondary)
- ConfirmDialog z liczbą elementów
- Wywołuje sequential delete na każdym elemencie (brak bulk API endpoint — pętla po `item.id`)

---

## 7. Admin Panel — Redesign

### Główna zmiana: eliminacja Admin* komponentów

Wszystkie `Admin*` komponenty zostaną **zastąpione** przez główne komponenty UI:
- `AdminButton` → `Button` (z odpowiednim wariantem)
- `AdminCard` → natywny `<div class="card">` lub nowy reużywalny `Card.svelte`
- `AdminInput` → `Input` (istniejący komponent)
- `AdminSelect` → natywny `<select>` ze stylami z tokenów
- `AdminBadge` → `Badge.svelte` (nowy, reużywalny)
- `AdminProgress` → `ProgressBar.svelte` (nowy, reużywalny)
- `AdminTabs` → zintegrowane w layout (nie osobny komponent tabów)
- `AdminListRow` → natywny row pattern
- `AdminModal` → `ConfirmDialog.svelte` / modal pattern z głównego systemu

### Page Header — Ujednolicony wzorzec

**Obecny:**
```
[ADMIN badge pill] [Odśwież button top-right]
Panel administracyjny (duże)
[Tabs: Użytkownicy | Serwis | Log]
```

**Nowy:**
```
[Admin] (breadcrumb-style, mały tekst, nie badge)
Panel administracyjny

[Tabs jako navigation: Użytkownicy | Serwis | Log]    [Odśwież]
```
- Tabs są częścią layout, nie osobnego komponentu
- Odśwież button po prawej przy tabs, nie w nagłówku strony
- Żaden `--admin-text-*` — używamy `--text-sm`, `--text-base`, `--text-lg`

### Admin — Użytkownicy (Redesign tabeli)

**Kolumny:**
- Mobile: [Avatar/Initials + Nazwa + Email] [Status] [...]
- Tablet: [Użytkownik] [Status] [Rola] [...]
- Desktop: [Użytkownik] [Status] [Rola] [Storage X% z Y] [...]

**Storage cell:**
- Wyświetla: `2.3 MB z 150 GB (1.5%)`
- Mini progress bar pod tekstem
- Kolor paska: success/warning/danger dynamicznie

**Modals → ConfirmDialog/SlideIn**
- Zachowują logikę, tylko nowy wygląd

### Admin — Log (Redesign)

**Problem:** Mieszane dane bez struktury  

**Rozwiązanie: Dwie sekcje z sub-tabs lub groupowanie:**

```
[Sub-tabs: Wszystkie | Aktywność | Przesyłanie]

[Grupowanie po dacie:]
  DZIŚ (27 kwiec.)
  ─ Upload zakończony — ps-cctv-kolumny.docx — 15:08
  ─ Link udostępnienia — 01:16
  
  WCZORAJ
  ─ ...
```

**Każdy wpis ma:**
- Ikona dopasowana do typu (Upload ↑, Link 🔗, Delete 🗑, etc.)
- Typ akcji jako tekst (nie surowy klucz z API)
- Nazwę zasobu jeśli dostępna
- Timestamp po prawej
- Badge statusu (Gotowy/Błąd) tylko dla upload entries

**Bez tabeli** — lekki feed-style list, każda pozycja jako `<li>` w `<ul>`

### Admin — Serwis (Redesign)

- Zachować grid 7/5 na desktop, stack na mobile
- Zastąpić Admin* komponentami głównymi
- Tytuł serwisu + ID wyświetlone czytelnie

---

## 8. Ustawienia — Redesign

### Problem
Karta jest za wąska (max ~500px) na szerokich ekranach.

### Nowy layout
- `max-width: 720px; width: 100%; margin: 0 auto;`
- Każda sekcja: dwa kolumny na desktop (label/opis po lewo, kontrolka po prawo)
- Mobile: stack (label nad kontrolką)

### Sekcje
1. **Motyw** — Dark | Light toggle (segmented control)
2. **Dostawca storage** — Cloudflare R2 | Appwrite Cloud toggle
3. **Połączenie** — read-only pola (URL serwera + Service ID)
4. **Konto** — email użytkownika + "Wyloguj" jako danger text button

### Wyloguj
- Przeniesiony z sidebar do Konta w Ustawieniach ORAZ dostępny jako ikona w sidebar (tooltip "Wyloguj")
- W sidebar: mała ikona na dole obok Settings, nie duży czerwony button

---

## 9. Nowe / Przepisane Komponenty

### Nowe
| Komponent | Cel |
|-----------|-----|
| `ConfirmDialog.svelte` | Reużywalny confirm modal (destrukcyjne akcje) |
| `Badge.svelte` | Status badges (Active, Blocked, Admin, User, Ready, Error) |
| `ProgressBar.svelte` | Progress bar z tonami (success/warning/danger/accent) |
| `Card.svelte` | Reużywalny kontener z opcjonalnym tytułem i akcją |
| `PageHeader.svelte` | Spójny page header (tytuł + subtitle + slot na akcje) |
| `EmptyState.svelte` | Wyśrodkowany empty state (ikona + tytuł + opis + opcjonalny CTA) |

### Przepisane
| Komponent | Zmiana |
|-----------|--------|
| `Sidebar.svelte` | Storage indicator, brak czerwonego Wyloguj button (zostaje mała ikona), icon-only tablet mode |
| `BottomDock.svelte` | Przepisany — full bottom tab bar na mobile z 5 tabs (ikona + label) |
| `TrashBrowser.svelte` | Jeden kontener, table header zintegrowany, ConfirmDialog |
| `/admin/log/+page.svelte` | Grupowanie datowe, sub-tabs, feed style |
| `/admin/users/+page.svelte` | Główne komponenty, lepsza tabela |
| `/admin/service/+page.svelte` | Główne komponenty |
| `/shared/+page.svelte` | Wyśrodkowany EmptyState |
| `/settings/+page.svelte` | Two-column layout, max-width 720px |

### Usunięte
Cały folder `components/admin/`:
- `AdminBadge.svelte`
- `AdminButton.svelte`
- `AdminCard.svelte`
- `AdminInput.svelte`
- `AdminListRow.svelte`
- `AdminModal.svelte`
- `AdminProgress.svelte`
- `AdminSelect.svelte`
- `AdminTabs.svelte`

---

## 10. Tokens — Uzupełnienia

Dodać do `tokens.css`:
```css
/* Breakpoints (CSS custom media - lub jako dokumentacja) */
/* sm: 640px, md: 768px, lg: 1024px, xl: 1280px */

/* Card pattern */
--card-bg: var(--color-bg-surface);
--card-border: var(--color-border-default);
--card-radius: var(--radius-md);
--card-padding: var(--space-5);

/* Bottom tab bar */
--tab-bar-height: 64px;
--tab-bar-bg: var(--color-bg-surface);
--tab-bar-border: var(--color-border-subtle);
```

---

## 11. Kolejność implementacji

1. **Nowe reużywalne komponenty** — `ConfirmDialog`, `Badge`, `ProgressBar`, `Card`, `PageHeader`, `EmptyState`
2. **Tokens** — uzupełnienie `tokens.css`
3. **Shell** — `Sidebar` (desktop + tablet), `BottomTabBar` (mobile), usunięcie `Wyloguj` z sidebar
4. **Udostępnione** — EmptyState fix
5. **Kosz** — unified container, table header fix, ConfirmDialog
6. **Admin/Log** — grupowanie, feed style, sub-tabs
7. **Admin/Users** — główne komponenty, lepsza tabela
8. **Admin/Service** — główne komponenty
9. **Ustawienia** — dwa kolumny, max-width
10. **Usunięcie Admin* komponentów**
11. **Mój dysk** — toolbar unification, responsive FileList
