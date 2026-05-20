# UniSource API v2 Documentation

UniSource API v2 introduces a flat, modernized approach to file and folder management. Instead of nested endpoints and sequential ID operations, v2 focuses on **global queries, robust filtering, and bulk operations**, bringing the API up to modern BaaS and Cloud Storage (e.g. Google Drive) standards.

**Important:** The v1 API (`/my-files`, `/folders`) remains fully functional and is completely backward-compatible. API v2 exists under the `/v2/files` and `/v2/folders` prefix.

## Using the SDK

All v2 features are accessible through the updated `@unisource/sdk` under the `client.v2` namespace.

```typescript
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({
  baseUrl: 'https://api.usrc.dev',
  serviceId: 'your-service-id',
  getToken: () => 'your-jwt-token',
});

// Example: Using the new v2 namespace
const files = await client.v2.files.list({ search: 'invoice' });
```

---

## 1. Global Search and Advanced Sorting

Both `/v2/files` and `/v2/folders` endpoints now support powerful query parameters for searching and sorting across the entire storage tree (when `folder_id` or `parent_id` is omitted).

### Files
- **Search by name:** `client.v2.files.list({ search: 'document' })`
- **Filter by MIME type:** `client.v2.files.list({ mime_type: 'application/pdf' })`
- **Sorting:** You can sort by `created_at` (default), `name`, or `size`.
- **Direction:** `asc` or `desc`.

*Example SDK call:*
```typescript
const largePDFs = await client.v2.files.list({
  mime_type: 'application/pdf',
  sort_by: 'size',
  sort_dir: 'desc',
  limit: 50
});
```

### Folders
- **Search by name:** `client.v2.folders.list({ search: 'Projects 2024' })`
- **Sorting:** Support for `created_at` or `name`.

*Example SDK call:*
```typescript
const alphabeticalFolders = await client.v2.folders.list({
  parent_id: 'root-folder-id',
  sort_by: 'name',
  sort_dir: 'asc'
});
```

---

## 2. Bulk Operations (Batching)

To minimize HTTP requests and speed up UI responsiveness (especially for cloud storage frontends), API v2 includes bulk operations. These operations mutate multiple records in a single database transaction (`db.batch`).

Operations return a `BulkOperationResponse`:
```typescript
{
  success: boolean;
  processed_count: number;
  failed_ids?: string[];
}
```

### Supported Operations:

#### Trash (Soft Delete)
```typescript
await client.v2.files.bulkTrash({ ids: ['file_id_1', 'file_id_2'] });
await client.v2.folders.bulkTrash({ ids: ['folder_id_1'] });
```

#### Restore (From Trash)
```typescript
await client.v2.files.bulkRestore({ ids: ['file_id_1', 'file_id_2'] });
await client.v2.folders.bulkRestore({ ids: ['folder_id_1'] });
```

#### Move (Change Parent)
Use `folder_id` for files, and `parent_id` for folders. Send `null` to move to the root directory.
```typescript
// Move files to a target folder
await client.v2.files.bulkMove({
  ids: ['file_id_1', 'file_id_2'],
  folder_id: 'target_folder_id'
});

// Move folders to root
await client.v2.folders.bulkMove({
  ids: ['folder_id_1', 'folder_id_2'],
  parent_id: null
});
```

---

## 3. Folder Breadcrumbs

A common requirement for cloud storage UIs is displaying the current folder path (e.g., `Root > Documents > 2024 > Invoices`).

Instead of sequentially fetching parent folders, API v2 utilizes recursive database CTEs to fetch the entire breadcrumb path in a single, lightning-fast request.

```typescript
const response = await client.v2.folders.breadcrumbs('invoice-folder-id');

// response.breadcrumbs will be an array of folders ordered from Root down to the requested folder.
const pathNames = response.breadcrumbs.map(f => f.name).join(' / ');
console.log(pathNames);
// Output: "Documents / 2024 / Invoices"
```

---

## Migration Path

1. **New features:** Use `client.v2.*` for any new views requiring global search, table sorting, or bulk operations.
2. **Backward compatibility:** Existing calls to `client.myFiles.*` or `client.folders.*` (like `.get`, `.update`, `.downloadUrl`) continue working exactly as before. Single-record mutations remain on the v1 API endpoints for now.
