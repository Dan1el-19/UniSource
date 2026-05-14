# Podstawy i Konfiguracja (SDK)

SDK (paczka `@unisource/sdk`) to serce ekosystemu chmury, które definiuje wspólne typy oraz dostarcza gotowego klienta HTTP dla platform Frontendowych. Gwarantuje bezpieczeństwo typowania na podstawie Zoda.

## Instalacja

Wewnątrz przestrzeni Monorepo, paczkę ładuje się korzystając z aliasów workspace (pnpm):
```json
{
  "dependencies": {
    "@unisource/sdk": "workspace:*"
  }
}
```

Osoby z zewnątrz mogą zainstalować paczkę bezpośrednio (skoro jest publikowana na rejestr publiczny npm):
```bash
npm install @unisource/sdk
# lub
pnpm install @unisource/sdk
```

## Klasa klienta `UnisourceClient`

Instancję klienta zazwyczaj tworzy się w głównym pliku aplikacji (np. dla Svelte - w module stanu logowania) jako pojedynczy, globalny *singleton*.

### Przykład inicjalizacji

```ts
import { UnisourceClient } from '@unisource/sdk';

export const usrcClient = new UnisourceClient({
  baseUrl: 'https://api.chmura.blokserwis.pl',
  serviceId: 'usrc', // Kod organizacji/usługi

  /**
   * Zostanie asynchronicznie odpytane przed _każdym_ sieciowym żądaniem SDK.
   * Jeśli nie jesteś zalogowany - zwróć null lub zignoruj promise (SDK wyśle bez Bearera).
   */
  getToken: async () => {
    // Przykład wykorzystania gotowego klienta Appwrite
    const session = await account.getSession('current');
    if (!session) return null;
    
    // Albo pobranie wygenerowanego własnoręcznie JWT:
    const jwtResult = await account.createJWT();
    return jwtResult.jwt;
  }
});
```

## Obsługa Błędów Sieciowych (Error Handling)

Każde zapytanie, w razie błędu serwera, rzuca jedną z klas wyjątków wbudowanych w SDK.

```ts
import { UnisourceError, UnisourceNetworkError } from '@unisource/sdk';

try {
  await usrcClient.files.get('file_9999_nieistnieje');
} catch (error) {
  if (error instanceof UnisourceError) {
    // Błąd zgłoszony sensownie przez sam backend Hono API
    console.error(`Status HTTP: ${error.status}`);
    console.error(`Wiadomość API: ${error.body.message}`); // np. "Not found"
  } else if (error instanceof UnisourceNetworkError) {
    // Problem z infrastrukturą sieciową usera, zerwanie połączenia
    console.error("Sprawdź swoje połączenie z internetem.");
  } else {
    // Nieobsługiwany typ błędu
    throw error;
  }
}
```
