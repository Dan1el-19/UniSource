# SDK - Files & Folders

Ten moduł pozwala na wykonywanie typowych operacji wirtualnego systemu plików z poziomu klienta w języku TypeScript. Wszystkie zapytania są opatrzone JWT lub autoryzacją API.

## Operacje na liście plików (`client.myFiles`)

Moduł ten dostarcza paginowane listy danych dla zalogowanego użytkownika.

### Pobranie listy plików w katalogu
```ts
const response = await client.myFiles.list({
  folder_id: 'fol_123', // Jeśli null, zwraca główny katalog
  limit: 50,
  cursor: undefined // do paginacji
});

console.log(`Liczba zwróconych plików: ${response.items.length}`);
console.log(`Następna strona: ${response.next_cursor}`);
```

### Pobranie plików z Kosza
```ts
const trash = await client.myFiles.trash({ limit: 100 });
```

### Pobieranie URL do pliku
Aby pobrać zawartość pliku, pobierz generowany na żądanie `download_url`:
```ts
const urlInfo = await client.myFiles.downloadUrl('file_888');
// Przekierowanie użytkownika do pobierania:
window.location.href = urlInfo.download_url;
```

## Operacje na pojedynczych plikach (`client.files`)

Zmieniona perspektywa - manipulacja poszczególnym modelem:

```ts
// 1. Zmiana nazwy pliku
const updatedFile = await client.files.update('file_888', {
  filename: 'załącznik.png'
});

// 2. Przenoszenie pliku do innego katalogu
const movedFile = await client.myFiles.move('file_888', {
  folder_id: 'fol_999' 
});

// 3. Przeniesienie do kosza
await client.files.delete('file_888');

// 4. Trwałe skasowanie 
await client.files.delete('file_888', { permanent: true });

// 5. Przywracanie
await client.files.restore('file_888');
```

## Operacje na Folderach (`client.folders`)

Analogicznie do plików, operujemy na strukturze katalogów:

```ts
// 1. Pobieranie listy podfolderów w katalogu fol_123
const subFolders = await client.folders.list({ parent_id: 'fol_123' });

// 2. Tworzenie katalogu
const newFolder = await client.folders.create({
  name: 'Dokumenty Księgowe',
  parent_id: null, // Utworzy w głównym folderze
  color_tag: '#FFD700' // Opcjonalny tag koloru do UI
});

// 3. Aktualizacja koloru
await client.folders.update(newFolder.folder.id, {
  color_tag: '#008000'
});

// 4. Usunięcie (Do kosza)
await client.folders.delete(newFolder.folder.id);
```
