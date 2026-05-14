# SDK - Współdzielenie plików (Share Links)

Ten moduł klienta SDK rozwiązuje obydwa strumienie użycia:
1. Zarządzanie linkami z poziomu zalogowanego użytkownika-właściciela pliku.
2. Dostęp do publicznego pliku przez anonimowego odbiorcę linku.

## Właściciel pliku (`client.shares`)

Przykład jak użytkownik generuje, a następnie przegląda własne udostępnienia:

```ts
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({ /* z uwierzytelnieniem */ });

// 1. Utworzenie publicznego linku dla wybranego pliku
const shareResponse = await client.shares.create({
  file_id: 'file_888',
  name: 'Prezentacja Q3', 
  password: 'tajne', // Ustanawia zabezpieczenie dla odbiorcy
  expires_at: Math.floor(Date.now() / 1000) + 86400, // Za 24 godziny
  max_downloads: 1 // Link zepsuje się po jednym pobraniu
});

console.log(`Wygenerowany slug: ${shareResponse.link.slug}`);

// 2. Przeglądanie wygenerowanych udostępnień
const allShares = await client.shares.list();
allShares.items.forEach(share => {
  console.log(`Link: ${share.slug}, Aktywny: ${share.is_active}`);
});

// 3. Wycofanie dostępu
await client.shares.delete(shareResponse.link.id);
```

## Anonimowy odwiedzający (Dostęp Publiczny)

W przypadku widoku publicznego, frontend **nie powinien i nie musi** budować pełnego obiektu `UnisourceClient` (gdyż zazwyczaj ten wstrzykuje `X-Service-ID` oraz token JWT). SDK posiada do tego lekkie, darmowe od zależności funkcje.

Zakładając że użytkownik wchodzi w przeglądarce pod ścieżkę:
`https://chmura.blokserwis.pl/s/moj-super-plik`
Ciągiem `moj-super-plik` operujemy w żądaniach jako `slug`.

### Inicjalne pobranie
```ts
import { getPublicFileInfo } from '@unisource/sdk';

// Zwróć uwagę, wchodzimy tu z poziomu komponentu lub +page.ts w svelte
const info = await getPublicFileInfo('https://api.usrc.dev', 'moj-super-plik');

if (info.requires_password) {
  // Pokaż UI z kłódką: Użytkownik musi wpisać hasło
  console.log(`Plik: ${info.filename} jest zabezpieczony.`);
} else {
  // Mamy bezpośrednio URL do pobrania!
  console.log(`Możesz pobrać: ${info.download_url}`);
}
```

### Odszyfrowanie z użyciem hasła
Jeżeli funkcja wyżej zwróciła flagę `requires_password: true`, wywołaj odblokowanie na zdarzeniu on-submit:

```ts
import { unlockPublicFile, UnisourceError } from '@unisource/sdk';

try {
  const unlocked = await unlockPublicFile('https://api.usrc.dev', 'moj-super-plik', 'tajne');
  
  if (unlocked.requires_password === false) {
    // Udało się
    window.location.href = unlocked.download_url;
  }
} catch (error) {
  if (error instanceof UnisourceError && error.status === 401) {
    alert('Podałeś błędne hasło!');
  }
}
```
