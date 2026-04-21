# Notatki Agenta - Podsumowanie Researchu (Faza 1.4)

Przed przystąpieniem do kodowania przeprowadziłem niezbędny research, zgodnie z wymogami `USER_REQUEST`. Oto podsumowanie kluczowych decyzji i spostrzeżeń.

## 1. Architektura: Astro + Svelte Islands
- **Routing i Layouts:** Użyjemy Astro dla ogólnej struktury stron (`pages/`) i statycznych layoutów (`layouts/`). Pozwoli to na świetne SEO i natychmiastowe ładowanie "szkieletu" aplikacji.
- **Svelte Islands:** Części mocno interaktywne (np. FileGrid, Sidebar, Bottom Dock, ContextMenu) zostaną napisane jako komponenty Svelte (w Svelte 5).
- **Dyrektywy ładowania wysp (`client:*`):**
  - `client:load`: Obowiązkowo dla kluczowego UI (np. nawigacja boczna, główny file browser).
  - `client:idle`: Użyteczne dla komponentów o niższym priorytecie (np. widgety dolne, tooltips).
  - `client:visible`: Elementy poniżej fold'u, modale renderowane wyżej.
- **Stan (State Management):** W najnowszym Svelte 5 stan eksportujemy jako obiekty ze stanem rekatywnym (`$state()`, `$derived()`) z plików `.svelte.ts`. **Dostosowano do zasady: zamieniać `$app/stores` na `$app/state`.**
- **SSR vs SSG:** Ponieważ aplikacja UniSource opiera się o dane użytkownika i auth JWT, wykorzystamy SSR lub hybrydę. Astro chroni ścieżki za pomocą middleware'a weryfikującego Appwrite JWT.

## 2. Mobile-first i responsywność (CSS w 2024/2025)
- **Breakpoints:** Utrzymanie min-width (mobile-first). Domyślnie brak media queries = mobile. Potem dopisujemy `@media (min-width: 768px)` i ewentualnie 1024px.
- **Viewport i Safe Areas:** Będziemy używać `lvh`, `svh` oraz `dvh`, by paski nawigacyjne na sprzętach mobilnych iOS/Android nie obcinały UI. Koniecznie zapiąć zmienne środowiskowe z CSS: `env(safe-area-inset-top)` dla Notchy oraz `env(safe-area-inset-bottom)` dla docka bottom.
- **Overscroll:** Ustawienie `overscroll-behavior: contain` na listach i layoutach ustrzeże aplikację przed pull-to-refresh całej strony tam, gdzie nie chcemy.

## 3. CSS Architecture i Dark-Mode
- **Tokeny z pliku DESIGN.md:** Przepisano system tokenów kolorów i odstępów na zmienne CSS (`var(--color-bg-base)` itp.) do `tokens.css`.
- **Scope vs Global:** Tylko tokeny i bazowe resety są globalne. Styling komponentów ściśle ograniczony będzie w blokach `<style>` plików Astro lub Svelte. Nie używamy zewnętrznych bibliotek jak Tailwind czy DaisyUI (odinstalowałem je).
- **Glassmorphism:** Zastosowanie `backdrop-filter: blur(20px) saturate(180%)` dla floatersów na tle opcjonalnego light mode. Domyślnie `Dark Mode`.

## 4. Animacje i Motion
- **Svelte 5 i `svelte/motion`**: Użyjemy fizyki z `spring` do stworzenia naciśnięcia/kliku (np. drag lub modal). Zapewni to poczucie "sprężystości" zgodne z filozofią Liquid Glass / One UI 8.5.
- **Prefers-reduced-motion:** Stosujemy sprawdzenie z `window.matchMedia` lub media-query `@media (prefers-reduced-motion: reduce)`, by uciszać animacje w razie wyboru dostępności u użytkownika.

## 5. Dostępność (a11y)
- **Focus visible:** Styl globalny wyostrzający `:focus-visible` obwódką w kolorze `var(--color-accent)`.
- Prawidłowe tagi (np. role i aria-label na przyciskach bez etykiet tekstowych, `role="grid"` w nawigacji plików).

## Kolejność prac i decyzje
Implementację rozpocznę od **Etapu 1** (Tokeny, Layout shell, Routing), zachowując surowość i pedantyzm względem `DESIGN.md`. Nie pominę stanów loading, empty oraz error. Przy używaniu API i `$app/state` będę trzymał się reguł Appwrite dotyczących parametrów jako metody z obiektami. Wdrożenie z naciskiem na typowanie (TypeScript bez `any`).
