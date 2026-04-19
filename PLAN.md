## Zarządzanie plikami (core CRUD)
 
### Upload
- pojedynczy plik
- wiele plików naraz (multi-select)
- drag & drop na obszar lub do konkretnego folderu
- upload całego folderu z zachowaniem struktury katalogów
### Download
- pobieranie pojedynczego pliku
- pobieranie wielu plików jako .zip
- pobieranie całego folderu jako .zip
### Rename
- zmiana nazwy pliku
- zmiana nazwy folderu
### Delete
- przeniesienie do kosza (soft delete)
- permanentne usunięcie z kosza
- opróżnianie całego kosza jedną akcją
### Move / Copy
- drag & drop między folderami
- wycinanie i wklejanie (Ctrl+X / Ctrl+V)
- kopiowanie do innej lokalizacji
### Podgląd (Preview)
Bez pobierania, obsługiwane typy:
- obrazki (jpg, png, gif, webp, svg)
- dokumenty PDF
- wideo i audio
- pliki tekstowe i kod źródłowy
---
 
## Zarządzanie folderami
 
- tworzenie folderu
- rename, move, delete folderu
- kolor / ikona folderu (organizacja wizualna)
- breadcrumb nawigacja (np. Mój dysk > Projekty > 2025)
- "skróty" do folderów (aliasy)
---
 
## Udostępnianie i uprawnienia
 
- link publiczny (tylko do odczytu)
- link chroniony hasłem
- link z datą wygaśnięcia
- poziomy uprawnień:
  - viewer — tylko odczyt
  - editor — pełna edycja
- odbieranie dostępu
- podgląd listy osób z dostępem do pliku/folderu
---
 
## Wyszukiwanie i filtrowanie
 
### Wyszukiwanie
- po nazwie pliku/folderu (live search)
### Filtrowanie
- po typie pliku (obrazy, wideo, dokumenty, arkusze, kod...)
- po dacie dodania / modyfikacji
- po rozmiarze pliku
- po właścicielu / osobie udostępniającej
### Sortowanie
- nazwa (A–Z, Z–A)
- data (najnowsze, najstarsze)
- rozmiar (rosnąco, malejąco)
- typ pliku
### Widoki specjalne
- Ostatnio otwierane
- Ostatnio zmodyfikowane
- Udostępnione ze mną
- Oznaczone gwiazdką
---
 
## Organizacja i meta
 
- gwiazdki / ulubione — szybki dostęp
- tagi / etykiety kolorowe
- opis pliku i notatka
- widok siatki (kafelki) i widok listy
- miniatura podglądu w obu widokach
- zaznaczanie wielu elementów (Shift+click, Ctrl+click, Ctrl+A)
- kontekstowe menu prawym przyciskiem myszy
---
 
## Kosz
 
- lista usuniętych plików z datą usunięcia i oryginalną lokalizacją
- przywracanie do oryginalnej lokalizacji
- automatyczne czyszczenie po X dniach (domyślnie 30)
- permanentne usunięcie pojedyncze
- opróżnienie całego kosza jednym kliknięciem
---
 
## Konto i przestrzeń dyskowa
 
- pasek postępu użycia przestrzeni
- limit per rola (np. 15 GB free)
- podział zużytego miejsca wg typów plików
---
 
## Stack techniczny — rekomendacje
 
| Warstwa | Technologia |
|---|---|
| Storage | Cloudflare R2 / Appwrite Storage |
| Metadane plików | Cloudflare D1 |
| Autentykacja | Appwrite Auth |
| Upload dużych plików | multipart upload (chunked) |
| Linki publiczne | presigned URLs z TTL (r2) oraz File Tokens (appwrite) |
| Wyszukiwanie treści | Elasticsearch / Alternatywa |
| ZIP on-the-fly | streaming ZIP bez buforowania w RAM | (Sprawdz dokladnie czy obsługiwane w naszej konfiguracji)
 
---
 
## Priorytety — co robić najpierw (MVP)
 
1. Upload / Download
2. Foldery i nawigacja
3. Delete + Kosz
4. Wyszukiwanie po nazwie
5. Udostępnianie przez link
