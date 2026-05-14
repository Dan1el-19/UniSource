# SDK - Upload

Moduł ten ukrywa stopień skomplikowania przesyłania plików do API, wykonując odpowiednie HTTP Requesty pod spodem. Zapewnia silne typowanie każdego kroku.

## 1. Zwykły upload jednoczęściowy (R2)

Przykład ustandaryzowanego flow dla małego pliku (np. PDF 2MB).

```ts
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({ ... });

// 1. Wywołanie inicjalizacji w API
const initResponse = await client.upload.r2Init({
  filename: 'faktura.pdf',
  size: 2048000,
  mime_type: 'application/pdf',
  folder_id: 'fol_123', // Opcjonalnie
});

try {
  // 2. Przesłanie binarne pliku za pomocą systemowego fetch()
  const uploadResult = await fetch(initResponse.presigned_url, {
    method: 'PUT',
    body: fileObject, // np. obiekt File z <input type="file">
    headers: {
      'Content-Type': 'application/pdf'
    }
  });

  if (!uploadResult.ok) {
    throw new Error('Upload failed');
  }

  // 3. Poinformowanie serwera o sukcesie
  await client.upload.complete({
    upload_id: initResponse.upload_id
  });

  console.log('Plik został przesłany pomyślnie!');

} catch (err) {
  // W przypadku błędu – uwalniamy pojemność użytkownika
  await client.upload.fail({
    upload_id: initResponse.upload_id
  });
}
```

## 2. Upload wieloczęściowy (R2 Multipart)

Proces obsługi ogromnych plików polega na podziale pliku w przeglądarce na części (chunks) np. po 10 MB i wgrywaniu ich równolegle, albo sekwencyjnie.

```ts
// 1. Zarejestrowanie chęci wysłania bardzo dużego pliku
const multiSession = await client.upload.multipart.create({
  filename: 'video.mp4',
  size: 5000000000, // 5 GB
  mime_type: 'video/mp4'
});

const partsUploaded = [];

// Pseudo-pętla tnąca plik na mniejsze części
for (let i = 0; i < chunks.length; i++) {
  const partNumber = i + 1; // AWS oczekuje indeksów od 1

  // 2. Pobranie unikalnego URL dla danej części pliku
  const signRes = await client.upload.multipart.signPart(
    multiSession.r2_upload_id, 
    partNumber
  );

  // 3. Rzeczywisty PUT
  const res = await fetch(signRes.url, {
    method: 'PUT',
    body: chunks[i]
  });

  // 4. Zapisanie ETag, który R2 zwraca z powrotem. Jest niezbędny do finalizacji!
  const etag = res.headers.get('ETag');
  partsUploaded.push({ PartNumber: partNumber, ETag: etag });
}

// 5. Zakonczenie sesji sklejeniem czesci na serwerze
await client.upload.multipart.complete({
  upload_id: multiSession.upload_id,
  parts: partsUploaded
});
```

*Notatka: W aplikacji Frontend zjawisko to automatycznie implementuje silnik uppy lub `GoldenRetriever`, te metody są używane wewnętrznie by utrzymać poprawny stan w bazie `D1`.*
