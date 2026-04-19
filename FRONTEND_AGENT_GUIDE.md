# Przewodnik dla Agenta Frontendu: Integracja z UniSource Backend i SDK

Ten dokument zawiera wszystkie niezbędne informacje dla agenta AI lub programisty zajmującego się implementacją frontendu (Astro/Svelte, React Native, itp.) w celu poprawnego spięcia się z backendem UniSource za pomocą wspólnego pakietu `@unisource/sdk`.

## 1. Instalacja i Konfiguracja SDK

SDK jest opublikowane jako publiczna paczka w rejestrze NPM. Aby zacząć, zainstaluj je w swoim projekcie frontendowym (np. w aplikacji React Native, Svelte lub Next.js):

```bash
pnpm add @unisource/sdk
# lub npm install @unisource/sdk
```

*(Notatka dla lokalnych aplikacji wew. tego monorepo: w pliku `package.json` użyjemy `"@unisource/sdk": "workspace:*"` by `pnpm` linkował podgląd na żywo)*

### Inicjalizacja Klienta

Zalecanym wzorcem jest utworzenie jednego, eksportowanego pliku z instancją klienta (np. `src/lib/api.ts` w Astro/Svelte).

```typescript
import { UnisourceClient, UnisourceError, UnisourceNetworkError } from '@unisource/sdk';
// Np. import ze swojego wrappera autoryzacji Appwrite (Appwrite Web SDK / React Native SDK)
import { account } from './appwrite'; 

export const apiClient = new UnisourceClient({
  baseUrl: import.meta.env.PUBLIC_API_URL, // np. https://api.example.com
  serviceId: import.meta.env.PUBLIC_SERVICE_ID, // np. "default" lub "example"
  
  // Funkcja wywoływana przy każdym requeście HTTP pod spodem.
  // Dzięki temu klient jest zawsze "świeży" i nie cache'uje starego tokenu.
  getToken: async () => {
    try {
      const session = await account.createJWT();
      return session.jwt;
    } catch {
      return null; // Zwróć null dla anonimowych requestów (np. logowanie)
    }
  }
});
```

*Uwaga:* Metoda `getToken` jest wywoływana asynchronicznie przed *każdym* żądaniem. Zadbaj o to, aby lokalne cache'owanie JWT (jeśli potrzebne dla optymalizacji) było zaimplementowane wewnątrz `getToken`, choć Appwrite SDK domyślnie radzi sobie z tym dobrze.

---

## 2. Architektura Autoryzacji (Dual-Auth)

Backend obsługuje autoryzację w dwóch trybach (transparentnie obsługiwanych przez middleware):
1. **Appwrite JWT (B2C)**: Aplikacja klienta wysyła nagłówek `Authorization: Bearer <JWT>`. Backend weryfikuje JWT w Appwrite i wyciąga w ten sposób `user_id`. Używane dla wszystkich ścieżek `/my-files` oraz `/folders`.
2. **Klucz API Server-to-Server (B2B)**: Przesyłanie w nagłówku `Authorization: Bearer <API_KEY>`. Nadaje uprawnienia roli `system` i omija wyciąganie `userId`. Przydatne do operacji administracyjnych (ścieżki `/files` oraz `/admin`).

We wszystkich żądaniach musi być dołączony nagłówek `X-Service-ID` (co SDK narzuca przez propercję konfiguracyjną `serviceId` w konstruktorze). Izoluje to wszystkie dane pomiędzy np. stronillą UniSource a aplikacją Example.

---

## 3. Upload Plików (R2) - Wzorzec Resumable / Presigned

Aby wgrać plik klienta do cloud storage, stosujemy schemat z bezpiecznymi URL'ami w 3 krokach. Eliminuje to obciążenie naszego własnego API przez pliki binarne.

```typescript
// 1. Zarezerwuj miejsce i pobierz tymczasowy link (ważny 1h)
const initResponse = await apiClient.upload.r2Init({
  filename: file.name,
  size: file.size,
  mime_type: file.type
});

try {
  // 2. Wykonaj oryginalny, czysty request PUT używając przeglądarkowego fetch (lub axios)
  const putResponse = await fetch(initResponse.presigned_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });

  if (!putResponse.ok) throw new Error('Błąd wgrywania na zewnętrzny bucket');

  // 3. Po pomyślnym uploadzie, potwierdź to naszemu backendowi
  await apiClient.upload.complete({ upload_id: initResponse.upload_id });
  
  console.log("Plik został trwale zapisany db i cloudzie.");

} catch (error) {
  // UWAGA: Bardzo ważne: jeśli wywali błąd sieciowy lub przeglądarkę, poinformuj API
  // by cofnęło odliczone MB per limity serwisu "current_used_bytes".
  await apiClient.upload.fail({ upload_id: initResponse.upload_id }).catch(()=>null);
}
```
*Gdyby request do `/fail` nie dotarł z powodu awarii sieci gracza - po stronie Backend działa awaryjny CronJob, który samodzielnie oczyści osierocony plik i odda miejsce na dysku po 60 minutach.*

---

## 4. Przewodnik po Modułach (Namespace) Klienta SDK

Obiekt `apiClient` udostępnia posegregowane obiekty dla konkretnych uwarunkowań biznesowych.

### 📁 Foldery (`apiClient.folders`)
Odpowiada za wirtualną strukturę katalogową per użytkownik (usera dyktuje podpięty JWT).

*   `list(query?: FolderListQuery)` - Pobiera katalogi (możliwość filtrów np. `{ parent_id: '123' }`). Zwraca `{ items, next_cursor, limit }`.
*   `create(body: FolderCreateRequest)` - Tworzy nowy folder. `{ name: 'Nazwa', parent_id?: 'opt-id', color_tag?: '#ff0000' }`.
*   `update(id, body)` - Modyfikacja obiektu (zmiana nazwy / koloru).
*   `delete(id, query?: { permanent?: boolean })` - Domyślnie umieszcza folder (i całą jego zagnieżdżoną zawartość) w "Koszu" (soft-delete). Jeśli `permanent: true` - jest zrzucany bezpowrotnie.
*   `restore(id)` - Wyciąga z kosza i ustawia `is_trashed = false`.

### 📄 Pliki Użytkownika (`apiClient.myFiles`)
Logika obsługi plików skojarzonych z usatysfakcjonowanym JWT klienta. Pamiętaj, pliki w bazie mają propercję `folder_id` (null = plik w 'home' / roocie).

*   `list(query?: FileRecordsListQuery)` - Pobiera pliki. Wspiera filtry (`{ folder_id: '123' }` lub `{ is_trashed: true }`).
*   `get(id)` - Skompresowane detale (brak bucketu i security kluczy w zwrotce).
*   **`downloadUrl(id)`** - **Krytyczne:** Nie trzymamy stałych linków do plików prywatnych. Wywołaj to by uzyskać krótkotrwały URL bezpośrednio pobierający zasoby z R2 do np. `<a href="...">Pobierz</a>`.
*   `move(id, { folder_id: 'new-id' | null })` - Zmiana przypisania pliku do folderu.
*   `delete(id, query?)` - Analogicznie jak folderach, przenoszenie do kosza lub permanentne skasowanie.
*   `restore(id)` - Wyciąganie plików z kosza.

### 🛡 Obsługa Błędów

SDK udostępnia autorskie klasy wyjątków pozwalające na łatwy debbuging u klienta bez parsingów po Response.

```typescript
import { UnisourceError, UnisourceNetworkError } from '@unisource/sdk';

try {
  await apiClient.myFiles.delete('123');
} catch (error) {
  if (error instanceof UnisourceError) {
    // Serwer przetworzył, ale wydał błąd 4xx / 5xx
    console.error(`Błąd biznesowy ${error.status}: ${error.body.message}`); // Np. 404: File not found
  } else if (error instanceof UnisourceNetworkError) {
    // Problem z CORS, brakiem neta klienta, odrzucone złącze.
    console.error("Sprawdź połączenie:", error.cause);
  }
}
```

### ⚙ Funkcje Administracyjne (Panel B2B)
Tylko przy użyciu `API Key` serwisu dla autoryzowanych paneli zarządzających (np. my.example.com lub back-office dla najemców).

*   `apiClient.admin.serviceDetail()` - Statyczne informacje bazy o uwarunkowaniach.
*   `apiClient.admin.usage()` - Wyciąga statystyki np. `current_used_bytes` / `used_percent` by narysować pasek np. "Masz użyte 2.4 GB z 5 GB" u klienta B2B.
*   `apiClient.admin.auditLog(...)` - Listuje i odczytuje logi z aktywności kont/plików (`service_user_events`).

## 5. Wspólne Typy / Typescript
Zawsze korzystaj z deklaracji obiektów wprost z `@unisource/sdk`. Masz do dyspozycji interfejsy `FileRecord`, `Folder`, `Service`, czy `UploadRecord`.
Nie twórz duplikatów modeli bazodanowych po stronie np. Svelte/ZOD - one wszystkie istnieją i są exportowane spod domyślnej pętli SDK po uruchomieniu `pnpm run build` na monorepo!
