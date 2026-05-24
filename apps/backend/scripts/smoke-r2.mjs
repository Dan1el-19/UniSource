#!/usr/bin/env node
// Smoke test for the R2 services migration (2026-05-15).
// Runs Path A (binding-created multipart finalised through our endpoints)
// and Path B (aws4fetch end-to-end S3 multipart on R2) sequentially.
//
// Usage:
//   node smoke-r2.mjs           # both paths
//   node smoke-r2.mjs --path=a  # only Path A
//   node smoke-r2.mjs --path=b  # only Path B
//
// Env (all required for the path you run):
//   SMOKE_BACKEND_URL            e.g. https://<version>-worker.<sub>.workers.dev
//   SMOKE_API_KEY                Bearer token for the target service
//   SMOKE_SERVICE_ID             default: service-b
//   SMOKE_R2_ACCOUNT_ID
//   SMOKE_R2_ACCESS_KEY_ID
//   SMOKE_R2_SECRET_ACCESS_KEY
//   SMOKE_R2_BUCKET              default: service-b

import { AwsClient } from 'aws4fetch';

const {
  SMOKE_BACKEND_URL,
  SMOKE_API_KEY,
  SMOKE_SERVICE_ID = 'service-b',
  SMOKE_R2_ACCOUNT_ID,
  SMOKE_R2_ACCESS_KEY_ID,
  SMOKE_R2_SECRET_ACCESS_KEY,
  SMOKE_R2_BUCKET = 'service-b',
} = process.env;

const arg = process.argv.find((a) => a.startsWith('--path='));
const which = arg ? arg.slice('--path='.length) : 'both';

function require_(name, value) {
  if (!value) {
    console.error(`Missing env: ${name}`);
    process.exit(2);
  }
  return value;
}

function bytes(n, fill) {
  return new Uint8Array(n).fill(fill);
}

function hr(label) {
  console.log(`\n=== ${label} ===`);
}

async function pathA() {
  hr('Path A: binding-created multipart, finalised through endpoints');
  require_('SMOKE_BACKEND_URL', SMOKE_BACKEND_URL);
  require_('SMOKE_API_KEY', SMOKE_API_KEY);

  const filename = `smoke-path-a-${Date.now()}.bin`;
  const size = 5 * 1024 * 1024 + 1024;

  // 1. CREATE
  console.log(`1. POST /upload/r2/multipart/create  size=${size}`);
  const createRes = await fetch(`${SMOKE_BACKEND_URL}/upload/r2/multipart/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SMOKE_API_KEY}`,
      'X-Service-ID': SMOKE_SERVICE_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      size,
      mime_type: 'application/octet-stream',
    }),
  });
  if (!createRes.ok) {
    console.error(`   FAIL ${createRes.status}: ${await createRes.text()}`);
    return false;
  }
  const created = await createRes.json();
  console.log(`   OK upload_id=${created.upload_id} key=${created.key}`);

  // 2. SIGN PART 1
  console.log('2. GET /upload/r2/multipart/sign-part?part_number=1');
  const sign1Res = await fetch(
    `${SMOKE_BACKEND_URL}/upload/r2/multipart/sign-part?upload_id=${created.upload_id}&part_number=1`,
    { headers: { Authorization: `Bearer ${SMOKE_API_KEY}`, 'X-Service-ID': SMOKE_SERVICE_ID } }
  );
  if (!sign1Res.ok) {
    console.error(`   FAIL ${sign1Res.status}: ${await sign1Res.text()}`);
    return false;
  }
  const sign1 = await sign1Res.json();
  console.log(`   OK presigned URL OK (X-Amz-Expires=${new URL(sign1.url).searchParams.get('X-Amz-Expires')})`);

  // 3. PUT PART 1 (5 MiB)
  console.log('3. PUT part 1 (5 MiB) directly to R2');
  const part1Res = await fetch(sign1.url, { method: 'PUT', body: bytes(5 * 1024 * 1024, 0xaa) });
  if (!part1Res.ok) {
    console.error(`   FAIL ${part1Res.status}: ${await part1Res.text()}`);
    return false;
  }
  const etag1 = part1Res.headers.get('etag');
  console.log(`   OK ETag=${etag1}`);

  // 4. SIGN PART 2
  console.log('4. GET sign-part?part_number=2');
  const sign2Res = await fetch(
    `${SMOKE_BACKEND_URL}/upload/r2/multipart/sign-part?upload_id=${created.upload_id}&part_number=2`,
    { headers: { Authorization: `Bearer ${SMOKE_API_KEY}`, 'X-Service-ID': SMOKE_SERVICE_ID } }
  );
  if (!sign2Res.ok) {
    console.error(`   FAIL ${sign2Res.status}: ${await sign2Res.text()}`);
    return false;
  }
  const sign2 = await sign2Res.json();
  console.log('   OK');

  // 5. PUT PART 2 (1 KiB)
  console.log('5. PUT part 2 (1 KiB) directly to R2');
  const part2Res = await fetch(sign2.url, { method: 'PUT', body: bytes(1024, 0xbb) });
  if (!part2Res.ok) {
    console.error(`   FAIL ${part2Res.status}: ${await part2Res.text()}`);
    return false;
  }
  const etag2 = part2Res.headers.get('etag');
  console.log(`   OK ETag=${etag2}`);

  // 6. LIST PARTS (recovery-only path)
  console.log('6. GET list-parts (recovery path; expect 2 parts)');
  const listRes = await fetch(
    `${SMOKE_BACKEND_URL}/upload/r2/multipart/list-parts?upload_id=${created.upload_id}`,
    { headers: { Authorization: `Bearer ${SMOKE_API_KEY}`, 'X-Service-ID': SMOKE_SERVICE_ID } }
  );
  if (!listRes.ok) {
    console.error(`   FAIL ${listRes.status}: ${await listRes.text()}`);
    return false;
  }
  const list = await listRes.json();
  console.log(`   OK parts=${list.parts.length} ETags-quoted=${list.parts[0]?.ETag?.startsWith('"')}`);

  // 7. COMPLETE
  console.log('7. POST /upload/r2/multipart/complete');
  const completeRes = await fetch(`${SMOKE_BACKEND_URL}/upload/r2/multipart/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SMOKE_API_KEY}`,
      'X-Service-ID': SMOKE_SERVICE_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      upload_id: created.upload_id,
      parts: [
        { PartNumber: 1, ETag: etag1 },
        { PartNumber: 2, ETag: etag2 },
      ],
    }),
  });
  if (!completeRes.ok) {
    console.error(`   FAIL ${completeRes.status}: ${await completeRes.text()}`);
    return false;
  }
  const completed = await completeRes.json();
  console.log(`   OK status=${completed.status}`);

  console.log('\nPath A: PASSED');
  console.log(`Cleanup hint:  pnpm --filter default-backend wrangler r2 object delete ${SMOKE_R2_BUCKET}/${created.key}`);
  return true;
}

async function pathB() {
  hr('Path B: aws4fetch end-to-end S3 multipart on R2 (no backend involvement)');
  require_('SMOKE_R2_ACCOUNT_ID', SMOKE_R2_ACCOUNT_ID);
  require_('SMOKE_R2_ACCESS_KEY_ID', SMOKE_R2_ACCESS_KEY_ID);
  require_('SMOKE_R2_SECRET_ACCESS_KEY', SMOKE_R2_SECRET_ACCESS_KEY);

  const client = new AwsClient({
    accessKeyId: SMOKE_R2_ACCESS_KEY_ID,
    secretAccessKey: SMOKE_R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const key = `smoke-path-b-${Date.now()}.bin`;
  const objUrl = `https://${SMOKE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${SMOKE_R2_BUCKET}/${key}`;

  // 1. CreateMultipartUpload
  console.log('1. POST ?uploads (CreateMultipartUpload via aws4fetch)');
  const createRes = await client.fetch(`${objUrl}?uploads`, { method: 'POST' });
  if (!createRes.ok) {
    console.error(`   FAIL ${createRes.status}: ${await createRes.text()}`);
    return false;
  }
  const createXml = await createRes.text();
  const uploadId = createXml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!uploadId) {
    console.error(`   FAIL no <UploadId> in response: ${createXml.slice(0, 200)}`);
    return false;
  }
  console.log(`   OK uploadId=${uploadId.slice(0, 24)}...`);

  // 2. UploadPart
  console.log('2. PUT ?uploadId&partNumber=1 (UploadPart via aws4fetch, 5 MiB)');
  const partRes = await client.fetch(
    `${objUrl}?uploadId=${encodeURIComponent(uploadId)}&partNumber=1`,
    { method: 'PUT', body: bytes(5 * 1024 * 1024, 0xcd) }
  );
  if (!partRes.ok) {
    console.error(`   FAIL ${partRes.status}: ${await partRes.text()}`);
    return false;
  }
  const etag = partRes.headers.get('etag');
  console.log(`   OK ETag=${etag}`);

  // 3. CompleteMultipartUpload
  console.log('3. POST ?uploadId (CompleteMultipartUpload via aws4fetch)');
  const completeBody = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
  <Part>
    <PartNumber>1</PartNumber>
    <ETag>${etag}</ETag>
  </Part>
</CompleteMultipartUpload>`;
  const completeRes = await client.fetch(
    `${objUrl}?uploadId=${encodeURIComponent(uploadId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: completeBody,
    }
  );
  if (!completeRes.ok) {
    console.error(`   FAIL ${completeRes.status}: ${await completeRes.text()}`);
    return false;
  }
  console.log('   OK');

  // 4. Cleanup
  console.log('4. DELETE object (cleanup)');
  const delRes = await client.fetch(objUrl, { method: 'DELETE' });
  console.log(`   ${delRes.ok ? 'OK' : 'WARN ' + delRes.status}`);

  console.log('\nPath B: PASSED');
  return true;
}

const start = Date.now();
let okA = true;
let okB = true;
if (which === 'a' || which === 'both') okA = await pathA();
if (which === 'b' || which === 'both') okB = await pathB();
console.log(`\nDuration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
process.exit(okA && okB ? 0 : 1);
