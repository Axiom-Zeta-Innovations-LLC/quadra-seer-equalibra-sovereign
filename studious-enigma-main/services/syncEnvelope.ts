const DEFAULT_ITERATIONS = 210_000;

export interface SyncPackageEnvelope {
  schema_version: 1;
  alg: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt_b64: string;
  iv_b64: string;
  ciphertext_b64: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(input: string): Uint8Array {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable for sync encryption');
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSyncPayload(payload: unknown, passphrase: string): Promise<SyncPackageEnvelope> {
  const trimmed = passphrase.trim();
  if (!trimmed) {
    throw new Error('Passphrase is required for encrypted sync export');
  }

  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(trimmed, salt, DEFAULT_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext
  );

  return {
    schema_version: 1,
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: DEFAULT_ITERATIONS,
    salt_b64: toBase64(salt),
    iv_b64: toBase64(iv),
    ciphertext_b64: toBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSyncPayload(envelope: SyncPackageEnvelope, passphrase: string): Promise<any> {
  const trimmed = passphrase.trim();
  if (!trimmed) {
    throw new Error('Passphrase is required for encrypted sync import');
  }

  if (envelope.alg !== 'AES-GCM-256' || envelope.kdf !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported sync encryption envelope');
  }

  const salt = fromBase64(envelope.salt_b64);
  const iv = fromBase64(envelope.iv_b64);
  const ciphertext = fromBase64(envelope.ciphertext_b64);
  const key = await deriveKey(trimmed, salt, envelope.iterations);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Invalid passphrase or corrupted encrypted sync package');
  }

  const plaintext = textDecoder.decode(new Uint8Array(decrypted));
  return JSON.parse(plaintext);
}

export function isEncryptedSyncPackage(payload: any): payload is { package_envelope: SyncPackageEnvelope } {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    payload.package_envelope &&
    typeof payload.package_envelope === 'object' &&
    payload.package_envelope.ciphertext_b64
  );
}
