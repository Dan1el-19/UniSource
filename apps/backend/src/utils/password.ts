const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

async function importKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
}

async function derive(key: CryptoKey, salt: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await importKey(password);
  const hash = await derive(key, salt);
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const colonIdx = stored.indexOf(':');
  if (colonIdx < 0) return false;
  const saltHex = stored.slice(0, colonIdx);
  const hashHex = stored.slice(colonIdx + 1);
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const key = await importKey(password);
  const hash = await derive(key, salt);
  return toHex(hash) === hashHex;
}
