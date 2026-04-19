# WALKTHROUGH

## 1) Zakres wykonanych prac
Wdrozenie obejmuje 3 obszary monorepo:
- packages/default-sdk: wspolne kontrakty danych (Zod + inferencja TypeScript).
- apps/backend: walidacja endpointow przez @hono/zod-validator i typowane odpowiedzi.
- apps/frontend: MVP UI (Astro + Svelte 5) z walidacja po stronie klienta, toastami i testami scenariuszy.

## 2) Zainstalowane biblioteki i uzasadnienie

### packages/default-sdk
- zod
  - Powod: jedno zrodlo prawdy dla kontraktow API i walidacji runtime.

### apps/backend
- @hono/zod-validator
  - Powod: middleware walidacyjne dla Hono, zamiast recznej walidacji requestow.
- zod
  - Powod: lokalna obsluga schematow i zgodnosc z kontraktami z default-sdk.
- default-sdk (workspace:*)
  - Powod: wspoldzielenie schematow i typow pomiedzy backend i frontend.

### apps/frontend
- appwrite
  - Powod: integracja uploadu Appwrite po stronie UI.
- default-sdk (workspace:*)
  - Powod: safeParse i typowanie request/response na froncie.
- @tailwindcss/vite
  - Powod: nowoczesna integracja Tailwind 4 z Astro/Vite.
- tailwindcss
  - Powod: system utility-class i design tokens.
- daisyui
  - Powod: gotowe komponenty UI oparte o Tailwind.
- @astrojs/check
  - Powod: typecheck i diagnostyka Astro/Svelte.

## 3) Struktura plikow utworzonych lub zmodyfikowanych

### SDK
- packages/default-sdk/package.json
- packages/default-sdk/src/index.ts
- packages/default-sdk/tests/index.test.ts

### Backend
- apps/backend/package.json
- apps/backend/src/routes/upload.ts
- apps/backend/src/routes/files.ts

### Frontend
- apps/frontend/package.json
- apps/frontend/astro.config.mjs
- apps/frontend/src/styles/global.css
- apps/frontend/src/state/upload.svelte.ts
- apps/frontend/src/components/upload/UploadMvp.svelte
- apps/frontend/src/layouts/Layout.astro
- apps/frontend/src/pages/index.astro

## 4) Weryfikacja kompilacji (4.1)

Uruchomione komendy:
- pnpm -r typecheck
- pnpm -r build

Wynik:
- Wszystkie 3 pakiety przeszly typecheck bez bledow.
- Wszystkie 3 pakiety zbudowaly sie poprawnie.
- W packages/default-sdk/dist obecne sa:
  - index.mjs
  - index.d.mts
  - index.d.ts

## 5) Wyniki testow E2E flow uploadu (4.2)

### Przypadek 1 - happy path R2
Wynik: ZALICZONY

- Backend script (apps/backend/test-upload.ps1): OK
  - /upload/r2/init zwrocil sukces i upload_id.
  - PUT na presigned_url zakonczyl sie sukcesem.
  - /upload/complete ustawil status completed.
- Frontend browser test (localhost:4321): OK
  - Request do /upload/r2/init idzie poprawnie.
  - PUT na presigned_url przechodzi po konfiguracji CORS na buckecie.
  - UI pokazuje potwierdzenie sukcesu.

Wniosek:
- Flow R2 dziala end-to-end zarowno skryptowo, jak i z poziomu przegladarki.

### Przypadek 2 - happy path Appwrite
Wynik: CZESCIOWO ZALICZONY

- Backend script (apps/backend/test-appwrite.ps1): OK
  - /upload/appwrite/init zwrocil upload_id, file_id i appwrite_bucket_id.
  - Upload pliku do Appwrite przeszedl.
  - /upload/complete zwrocil status completed.
- Frontend browser test (Svelte + Appwrite SDK): NIEPELNY
  - Init endpoint dziala.
  - Sam upload z przegladarki konczy sie bledem uprawnien (No permissions provided for action 'create').
  - Dodano jawne permissions w createFile, ale srodowisko Appwrite nadal odrzuca operacje (401).

Wniosek:
- Integracja backendowa dziala.
- Dla happy path stricte z UI potrzeba dostrojenia polityk bucket/projektu Appwrite.

### Przypadek 3 - brak auth
Wynik: ZALICZONY

- API test bez Bearer:
  - STATUS=401
  - body: {"error":"Unauthorized","message":"Missing or invalid Authorization header"}
- UI test:
  - Dodany tryb testowy 401 (wysylka bez naglowka Authorization).
  - Request wykonany, UI pokazuje toast Unauthorized, aplikacja nie crashuje.

### Przypadek 4 - walidacja frontendu
Wynik: ZALICZONY

- UI test bez wybranego pliku:
  - safeParse zatrzymuje flow przed requestem.
  - Toast: "Walidacja frontendu: filename: Too small..."
  - Liczba requestow do /upload/r2/init w tescie przegladarkowym: 0

### Przypadek 5 - blad 400 z backendu (brak mime_type)
Wynik: ZALICZONY

- API test (z auth, bez mime_type):
  - STATUS=400
  - body: {"error":"Bad Request","message":"mime_type: Invalid input: expected string, received undefined"}
- UI test:
  - Tryb testowy 400 wysyla payload bez mime_type.
  - UI odbiera i pokazuje czytelny toast z trescia bledu 400.

## 6) Napotkane problemy i rozwiazania
- Problem: workspace dependency nie podpinala sie poprawnie, bo SDK mialo stara nazwe.
  - Rozwiazanie: zmiana nazwy pakietu na default-sdk i ponowne podpiecie workspace:*
- Problem: frontend build nie mogl znalezc tailwindcss.
  - Rozwiazanie: instalacja tailwindcss + @tailwindcss/vite i konfiguracja w astro.config.mjs.
- Problem: typy issue.path przy zValidator hook w backendzie.
  - Rozwiazanie: rozszerzenie typu sciezki na Array<PropertyKey>.
- Problem: tsdown generowal tylko index.d.mts.
  - Rozwiazanie: krok post-build kopiujacy index.d.mts -> index.d.ts.
- Problem: vitest w SDK zostawal w watch mode.
  - Rozwiazanie: zamkniecie sesji testowej (q) i potwierdzenie exit code 0.
- Problem: R2 browser upload blokowany CORS na presigned URL.
  - Rozwiazanie: konfiguracja CORS na buckecie R2; po zmianie upload z przegladarki dziala.
- Problem: Appwrite browser upload odrzucany przez polityki uprawnien.
  - Rozwiazanie tymczasowe: walidacja happy-path przez backend script; w UI dodane permissions w createFile, ale wymagane dalsze dostrojenie Appwrite.

## 7) Dodatkowe uwagi
- Uruchomione testy backend:
  - pnpm --filter app-backend test -> 3/3 testy zaliczone.
- Uruchomione testy SDK:
  - pnpm --filter default-sdk test -> 4/4 testy zaliczone.

