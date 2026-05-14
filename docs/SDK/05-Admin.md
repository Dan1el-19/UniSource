# SDK - Administracja i Monitorowanie

Rozszerzone API dla ról administracyjnych w celu nadzorowania pracy chmury i limitów w czasie rzeczywistym.

## Wyciąganie statystyk (`client.admin`)

Aby sprawdzić bieżące wykorzystanie:

```ts
// 1. Zobacz detale usługi i limity
const serviceInfo = await client.admin.serviceDetail();
console.log(`Maksymalny plik może ważyć: ${serviceInfo.service.max_file_size_bytes} bajtów`);

// 2. Statystyki LIVE
const usage = await client.admin.usage();
console.log(`Obecnie zajęte w usłudze: ${usage.used_percent}%`);
```

## Modyfikacja ustawień serwisu

Jeżeli chcemy globalnie przekierować wejściowy ruch sieciowy (z R2 na Appwrite) np. w trakcie awarii S3:
```ts
await client.admin.updateServiceSettings({
  recommended_upload_destination: 'appwrite'
});
```

Zwiększenie pakietu pojemności:
```ts
await client.admin.updateService({
  max_storage_bytes: 500 * 1024 * 1024 * 1024 // 500 GB
});
```

## Zarządzanie użytkownikami Appwrite

SDK łączy widok Appwrite SDK z autorskim wierszem bazy D1, dając jednolity obiekt.

```ts
// 1. Wylistuj wszystkich w platformie
const usersList = await client.admin.listUsers({ limit: 100, offset: 0 });

const user = usersList.items[0];

// 2. Zmień mu rolę na PLUS
await client.admin.updateUserRole(user.id, {
  role: 'plus'
});

// 3. Daj mu niestandardowy limit 100 GB nie patrząc na ogólne limity
await client.admin.updateUserStorageLimit(user.id, {
  limit_bytes: 100 * 1024 * 1024 * 1024
});

// 4. Usuń jego niestandardowy limit (powróci do globalnego limitu serwisu)
await client.admin.updateUserStorageLimit(user.id, {
  limit_bytes: null 
});

// 5. Zablokuj konto lub resetuj mu hasło
await client.admin.resetUserPassword(user.id, {
  password: 'nowe_trudne_haslo_z_panela'
});
// W tym momencie token Appwrite użytkownika staje się nieważny.
```

## Logi audytu (Dziennik zdarzeń)

Każda akcja na obiekcie i w usłudze jest zapisywana w dzienniku.
```ts
const logs = await client.admin.auditLog({
  limit: 200,
  action: 'file_deleted' // Pokaż tylko usunięcia plików
});

logs.items.forEach(log => {
  console.log(`${log.created_at}: Użytkownik ${log.user_id} skasował plik: ${log.metadata?.filename}`);
});
```
