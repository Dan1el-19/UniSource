# Unisource Design System
## Fluid Modular UI — Dark-First, Premium Cloud Storage

---

## 1. Filozofia i Tożsamość

Unisource to nexus usług — punkt styku z danymi, plikami i narzędziami. Interfejs ma być **cichy i ustępować treści**. Użytkownik powinien widzieć swoje pliki, nie UI.

Inspiracje:
- **One UI 8.5** — gęstość, ergonomia, dolna nawigacja, szkło
- **iOS 26 / Liquid Glass** — przestrzeń, fizyka animacji, momenty "wow"
- **Linear / Raycast** — monochromatyczna dyscyplina, typografia jako siatka

Zasada nadrzędna: **Feeling, nie kopia.** Adaptujemy język wizualny tych systemów, nie ich implementację.

---

## 2. Tryby Kolorystyczne

### Priorytet: Dark Mode jako domyślny

Dark jest domyślny z kilku powodów:
- Pliki, miniatury, ikony — same w sobie kolorowe — wybrzmiewają na ciemnym tle
- OLED na Androidzie = absolutna czerń i oszczędność baterii
- Premium cloud storage żyje w ciemności (Linear, Vercel, Raycast)

Light Mode istnieje jako opcja użytkownika — nie jako afterthought.

---

## 3. Paleta Kolorów — Tokeny

### Dark Mode (domyślny)

```
--color-bg-base:        #0D0D0D   /* główne tło aplikacji */
--color-bg-surface:     #141414   /* karty, panele, sidebar */
--color-bg-elevated:    #1C1C1C   /* modale, context menu, hover */
--color-bg-overlay:     #242424   /* zagnieżdżone elementy */

--color-border-subtle:  rgba(255,255,255,0.06)   /* granice spoczynkowe */
--color-border-default: rgba(255,255,255,0.10)   /* granice aktywne */
--color-border-strong:  rgba(255,255,255,0.18)   /* akcent granicy, focus */

--color-text-primary:   #F0F0F0   /* główny tekst */
--color-text-secondary: #8A8A8A   /* etykiety, metadane */
--color-text-tertiary:  #555555   /* disabled, placeholder */
--color-text-on-accent: #0D0D0D   /* tekst na tle akcentu */

--color-accent:         #E8E8E8   /* akcent główny — srebrny/biały */
--color-accent-muted:   rgba(232,232,232,0.12)   /* akcent w tle (hover, zaznaczenie) */
--color-accent-glow:    rgba(232,232,232,0.06)   /* punktowe podświetlenie krawędzi */

--color-glass-bg:       rgba(20,20,20,0.72)      /* tło elementów szklanych */
--color-glass-border:   rgba(255,255,255,0.08)   /* krawędź szkła */
--color-glass-blur:     20px                     /* backdrop-filter: blur() */
```

### Light Mode

```
--color-bg-base:        #F4F4F2
--color-bg-surface:     #FFFFFF
--color-bg-elevated:    #FAFAFA
--color-bg-overlay:     #F0F0EE

--color-border-subtle:  rgba(0,0,0,0.06)
--color-border-default: rgba(0,0,0,0.10)
--color-border-strong:  rgba(0,0,0,0.20)

--color-text-primary:   #111111
--color-text-secondary: #6B6B6B
--color-text-tertiary:  #AAAAAA
--color-text-on-accent: #FFFFFF

--color-accent:         #1A1A1A
--color-accent-muted:   rgba(0,0,0,0.07)
--color-accent-glow:    rgba(0,0,0,0.04)

--color-glass-bg:       rgba(255,255,255,0.75)
--color-glass-border:   rgba(0,0,0,0.08)
--color-glass-blur:     20px
```

### Semantyczne kolory statusu (oba tryby)

```
--color-success:        #3D9970   /* potwierdzenia, upload OK */
--color-warning:        #C9860A   /* ostrzeżenia, zbliżający się limit */
--color-danger:         #C0392B   /* błędy, usuwanie */
--color-info:           #2980B9   /* informacje neutralne */
```

> **Zasada:** Kolory statusu pojawiają się wyłącznie w kontekście funkcjonalnym. Nie używamy ich dekoracyjnie.

---

## 4. Typografia

### Font

**Geist** (Vercel) jako font UI. Zaprojektowany pod interfejsy, świetna czytelność na małych rozmiarach, neutralny ale z charakterem. Alternatywa: **Inter**.

```
--font-sans: 'Geist', 'Inter', system-ui, sans-serif;
--font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
```

### Skala typograficzna

```
--text-xs:   11px / 1.5   /* metadata, timestamp, etykieta ikony */
--text-sm:   13px / 1.5   /* secondary text, opis pliku */
--text-base: 15px / 1.6   /* body, nazwy plików */
--text-md:   17px / 1.4   /* nagłówki sekcji */
--text-lg:   22px / 1.3   /* page title, large header */
--text-xl:   28px / 1.2   /* hero, empty state headline */
--text-2xl:  36px / 1.1   /* landing page, marketing */
```

### Wagi

```
400 — regular (body, metadata)
500 — medium (nazwy plików, labels)
600 — semibold (nagłówki, CTA)
```

> **Uwaga:** Nigdy 700 (bold) w UI. Zbyt ciężki na ciemnym tle.

### Zasady typograficzne

- Relacje między elementami wyznacza **rozmiar i waga** — nie kolory ani obramowania
- Nagłówki strony używają **dużego rozmiaru i small tracking** (`letter-spacing: -0.02em`)
- Nazwy plików — `font-weight: 500`, `font-size: var(--text-base)`
- Metadane (rozmiar, data) — `font-weight: 400`, `font-size: var(--text-xs)`, `color: var(--color-text-secondary)`

---

## 5. Spacing & Layout

### Jednostka bazowa: 4px

```
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px
--space-5:   20px
--space-6:   24px
--space-8:   32px
--space-10:  40px
--space-12:  48px
--space-16:  64px
```

### Border Radius

```
--radius-sm:   6px    /* przyciski, tagi, inputy */
--radius-md:   10px   /* karty, panele */
--radius-lg:   14px   /* modale, duże karty */
--radius-xl:   20px   /* bottom sheet, duże powierzchnie */
--radius-full: 9999px /* pigułki, avatary */
```

### Filozofia Oddechu

Premium feel to w 70% kwestia pustej przestrzeni. Gdy coś wygląda "pusto" — często znaczy że wygląda dobrze. Lepiej za dużo oddechu niż za mało.

- **Padding kontenera:** minimum `var(--space-6)` (24px)
- **Gap między elementami siatki:** minimum `var(--space-3)` (12px)
- **Margines boczny na mobile:** `var(--space-4)` (16px)

---

## 6. Ikonografia

### Zestaw: Lucide Icons

Jeden zestaw, bez mieszania. Lucide — czysty, spójny, świetny na ciemnym tle.

```
Rozmiary:
--icon-sm:   16px   /* inline, w tekście */
--icon-base: 20px   /* przyciski, lista */
--icon-lg:   24px   /* nagłówki, toolbar */
--icon-xl:   32px   /* empty state, typ pliku */
```

### Ikony typów plików

Typy plików mają własne ikony z subtelnym kolorem — jedyne miejsce gdzie pojawia się kolor poza akcentem i statusem:

```
Obraz      → ikona + #4A90D9 (niebieski)
PDF        → ikona + #C0392B (czerwony)
Wideo      → ikona + #8E44AD (fiolet)
Audio      → ikona + #16A085 (morski)
Archiwum   → ikona + #D35400 (pomarańcz)
Dokument   → ikona + #2C3E50 (granat)
Kod        → ikona + #27AE60 (zielony)
Inne       → ikona + var(--color-text-tertiary)
```

> Kolory ikon typów plików są stałe (nie zmieniają się między trybami) — to jedyne wyjście od monochromatycznego systemu.

---

## 7. Motion & Animacje

### Filozofia

**Spring-based physics** — nie liniowe ease, nie cubic-bezier. Animacje mają "żyć". Zarówno One UI 8.5 jak i iOS 26 oparły swoje animacje na fizyce sprężynowej.

### Tokeny czasu

```
--duration-instant:  80ms    /* feedback kliknięcia */
--duration-fast:     150ms   /* hover, toggle */
--duration-normal:   250ms   /* menu, tooltip */
--duration-slow:     400ms   /* modal, bottom sheet */
--duration-enter:    320ms   /* elementy wchodzące */
--duration-exit:     200ms   /* elementy wychodzące (zawsze szybciej) */
```

> Wyjścia zawsze szybsze niż wejścia. Użytkownik nie czeka na znikanie.

### Easingi

```css
--ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1)   /* sprężynowy overshooot */
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1)        /* płynne zatrzymanie */
--ease-in-out:    cubic-bezier(0.4, 0, 0.2, 1)          /* neutralny */
--ease-bounce:    cubic-bezier(0.68, -0.55, 0.27, 1.55) /* odbicie — używaj rzadko */
```

### Konkretne wzorce animacji

**Context Menu / Dropdown:**
```
Wejście:  scale(0.94) → scale(1) + opacity(0→1)
          duration: 200ms, ease: --ease-spring
          origin: punkt kliknięcia
Wyjście:  scale(1) → scale(0.97) + opacity(1→0)
          duration: 150ms, ease: --ease-in-out
```

**Bottom Sheet (mobile):**
```
Wejście:  translateY(100%) → translateY(0)
          duration: 400ms, ease: --ease-out-expo
          + backdrop fade-in: duration 300ms
Wyjście:  translateY(0) → translateY(100%)
          duration: 280ms, ease: --ease-in-out
Swipe dismiss: spring physics, velocity-aware
```

**Modal:**
```
Wejście:  scale(0.96) + translateY(8px) → scale(1) + translateY(0)
          opacity: 0 → 1
          duration: 320ms, ease: --ease-spring
Backdrop: blur(0px) → blur(8px), duration: 300ms
```

**Hover na pliku/karcie:**
```
Tło:      transparent → var(--color-accent-muted)
          duration: 100ms, ease: linear
Kursor:   default → pointer (natychmiast)
```

**Kliknięcie / "Surface Tension" (naciśnięcie):**
```
scale(1) → scale(0.97) → scale(1)
duration: 80ms → 150ms
ease: ease-out → --ease-spring
```

**Upload progress:**
```
Pasek: width animowany spring-based
Ikona: rotate(0) → rotate(360deg) dla spinnera
       duration: 900ms, ease: linear, infinite
Po zakończeniu: scale(0.8) → scale(1.1) → scale(1) + kolor success
```

**Przejście między widokami (grid ↔ lista):**
```
Elementy wychodzą: stagger(20ms), opacity → 0, translateY(-4px)
Elementy wchodzą:  stagger(15ms), opacity 0→1, translateY(4px→0)
ease: --ease-out-expo
```

### Reguły motion

1. Animuj tylko `transform` i `opacity` — GPU-accelerated
2. Unikaj animowania `width`, `height`, `top`, `left` — powodują reflow
3. `will-change: transform` tylko na elementach aktywnie animowanych, usuwaj po
4. Szanuj `prefers-reduced-motion` — wszystkie animacje opcjonalne

---

## 8. Efekt Szkła (Smart Glass / Liquid Glass)

### Kiedy używać

Szkło pojawia się **wyłącznie na warstwach unoszących się nad scrollowaną treścią:**
- Sticky header (po przewinięciu)
- Floating bottom dock (nawigacja mobile)
- Context menu
- Modale i bottom sheets
- Toast notifications

**Nigdy** na statycznych powierzchniach w spoczynku.

### Implementacja

```css
.glass {
  background: var(--color-glass-bg);
  backdrop-filter: blur(var(--color-glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--color-glass-blur)) saturate(180%);
  border: 1px solid var(--color-glass-border);
}
```

### Glow na dark mode

W dark mode aktywne elementy (focused input, selected item, active button) zyskują subtelne podświetlenie krawędzi:

```css
.glow-accent {
  box-shadow: 0 0 0 1px var(--color-accent-glow),
              inset 0 0 0 1px var(--color-accent-glow);
}
```

---

## 9. Niewidzialna Siatka (The Invisible Grid)

### Zasada

Elementy nie mają tła ani obramowań **w spoczynku**. Siatka jest niewidzialna — wyznaczają ją marginesy i typografia.

### Hover Reveal

Kontener pliku/elementu pojawia się dopiero przy interakcji:

```css
.file-item {
  background: transparent;
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) linear;
}
.file-item:hover {
  background: var(--color-accent-muted);
}
.file-item:active {
  background: var(--color-accent-muted);
  transform: scale(0.98);
}
```

### Zaznaczenie

Pole zaznaczania to przezroczysty kwadrat z 1px ramką w kolorze akcentu. Po zaznaczeniu: wypełnienie `var(--color-accent-muted)`, checkmark w kolorze `var(--color-accent)`.

---

## 10. Architektura Komponentów — File Manager

### A. File Grid / List

**Grid (domyślny dla multimediów):**
- Miniatury z zaokrąglonymi rogami `var(--radius-md)`
- Nazwa pliku pod miniaturą, max 2 linie, `text-overflow: ellipsis`
- Metadane (rozmiar) — opcjonalne, pojawia się na hover
- Gap: `var(--space-3)`

**Lista (domyślna dla dokumentów):**
- Ikona + nazwa + metadane w jednym rzędzie
- Gęstość: `height: 44px` na element
- Separator: brak linii — wyznacza spacing
- Akcje (download, share, delete) — pojawiają się na hover po prawej

**Przełącznik Grid/Lista:**
- Zawsze widoczny w headerze obszaru roboczego
- Persystuje preferencję per-folder

### B. Sticky Header

```
Stan spoczynku (na górze):  przezroczysty, brak blur
Po przewinięciu 1px:        aktywuje szkło (transition: backdrop-filter 200ms)
Zawartość:                  breadcrumb + akcje + przełącznik widoku
Wysokość:                   52px desktop / 48px mobile
```

### C. Search

Nie prostokątny input — miękka pigułka:

```css
border-radius: var(--radius-full);
background: var(--color-bg-elevated);
border: 1px solid var(--color-border-subtle);

/* Focus state: */
border-color: var(--color-border-strong);
box-shadow: 0 0 0 3px var(--color-accent-muted);
```

Animacja wejścia podczas wpisywania: subtelny glow na krawędzi.

### D. Context Menu

- Wywoływane: prawy klik (desktop) / przytrzymanie (mobile)
- Pozycja: przy kursorze/palcu, z inteligentnym reposition gdy wychodzi poza viewport
- Animacja: `scale(0.94→1) + opacity(0→1)`, origin punkt wywołania
- Szkło: `backdrop-filter: blur(20px)`
- Separator sekcji: `1px solid var(--color-border-subtle)`
- Ikona + etykieta + skrót (desktop)
- Destruktywne akcje (Usuń): `color: var(--color-danger)`, na dole z separatorem

### E. Upload

**Drag & Drop Zone:**
- W spoczynku: niewidoczna (brak tła, brak ramki)
- Podczas drag nad aplikacją: cały viewport zyskuje subtelne tło `var(--color-accent-muted)` z animowaną ramką
- Przy drag nad konkretnym folderem: folder podświetla się

**Progress:**
- Minimalistyczny pasek w dolnej części ekranu (snackbar style)
- Lub inline przy pliku w trakcie uploadu
- Po zakończeniu: znika z animacją `slide-out + fade`

### F. Empty State

Momenty "wow" inspirowane iOS 26 — przestrzeń i duża typografia:

```
Duża ikona: 48px, color: var(--color-text-tertiary)
Nagłówek:   var(--text-xl), color: var(--color-text-primary)
Opis:       var(--text-sm), color: var(--color-text-secondary)
CTA:        przycisk akcji poniżej
```

---

## 11. Nawigacja

### Desktop (Web)

**Sidebar:**
- Szerokość: 220px (stały) lub collapsible do 52px (tylko ikony)
- Tło: `var(--color-bg-surface)` — lekko jaśniejsze od base
- Granica: `1px solid var(--color-border-subtle)` — prawa krawędź
- Brak tła na elementach nawigacji w spoczynku (hover reveal)
- Aktywny element: `var(--color-accent-muted)` + lewy border `2px var(--color-accent)`

**Breadcrumb:**
- W sticky header
- Separator: `/` lub `›`, `color: var(--color-text-tertiary)`
- Ostatni element: `color: var(--color-text-primary)`
- Poprzednie: `color: var(--color-text-secondary)`, clickable

### Mobile (Android)

**Floating Bottom Dock:**
- Pozycja: fixed bottom, `margin: var(--space-4)`
- Tło: szkło — `backdrop-filter: blur(24px)`, `var(--color-glass-bg)`
- Border radius: `var(--radius-xl)`
- Maksymalnie 4 pozycje
- Aktywna ikona: `color: var(--color-accent)` + subtelny indicator dot
- Nieaktywna: `color: var(--color-text-tertiary)`
- Safe area: `padding-bottom: env(safe-area-inset-bottom)`

**Żaden hamburger.** Żaden drawer. Wszystko dostępne z dołu ekranu.

### Góra Ekranu (Mobile) = Tylko Konsumpcja

- Duży nagłówek strony (`var(--text-lg)`)
- Podtytuł / breadcrumb
- **Brak przycisków akcji** — te są na dole lub w context menu

---

## 12. Wytyczne Mobilne — One UI 8.5

### Reachability

- Wszystkie akcje primarne: dolna połowa ekranu
- FAB (jeśli używany): prawy dolny róg, nad dockiem
- Pull-to-refresh: górna część — jedyna dopuszczalna interakcja u góry

### Bottom Sheet (zamiast modali)

```
Wejście:    translateY(100%) → translateY(0), spring physics
Uchwyt:     2px × 32px, color: var(--color-border-default), border-radius: full
Dismiss:    swipe w dół z velocity detection (próg: 300px/s lub 40% wysokości)
Backdrop:   rgba(0,0,0,0.5), blur(4px) za sheetem
Max height: 92% viewport height
```

### Overscroll / "Gumka"

```css
overscroll-behavior: contain;
/* React Native: bounces={true} (iOS) */
/* Android Reanimated: elasticity na krańcach */
```

### Gesty

- Back gesture (Android 13+): predictive back z podglądem
- Swipe na elemencie listy: akcje kontekstowe (usuń, share) — One UI pattern
- Long press: zaznaczanie wielu plików + multi-select toolbar

---

## 13. Responsywność (Web)

```
Mobile:   < 640px    — pełnoekranowy, bottom nav
Tablet:   640–1024px — sidebar collapsible, bottom nav lub sidebar
Desktop:  > 1024px   — sidebar stały, top toolbar
Wide:     > 1440px   — zwiększony spacing, max-width: 1600px
```

### Container

```css
max-width: 1600px;
margin: 0 auto;
padding: 0 var(--space-8);

@media (max-width: 640px) {
  padding: 0 var(--space-4);
}
```

---

## 14. Dostępność

- Focus visible na wszystkich elementach interaktywnych: `outline: 2px solid var(--color-accent)`, `outline-offset: 2px`
- Kontrast tekstu: minimum 4.5:1 (WCAG AA)
- Ikony z semantycznym `aria-label`
- `prefers-reduced-motion`: wyłącza wszystkie animacje transform/opacity, zostawia tylko fade
- Touch targets: minimum 44×44px (Apple HIG / Material 3)

---

## 15. Referencje

| Cel | Źródło |
|-----|--------|
| Dark mode mastery | [linear.app](https://linear.app) |
| Typografia jako siatka | [raycast.com](https://raycast.com) |
| Light mode glass | [family.co](https://family.co) |
| Mobile patterns | [mobbin.com](https://mobbin.com) — szukaj "Files iOS", "One UI" |
| Dashboard inspo | [godly.website](https://godly.website) |
| Glass/Materials | [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) |
| Font | [vercel.com/font](https://vercel.com/font) (Geist) |

---

*Unisource Design System v0.2 — Dark-First, Fluid Modular UI*
*Inspiracje: One UI 8.5 + iOS 26 Liquid Glass + Linear/Raycast*