import { describe, expect, it } from 'vitest';
import { decryptSyncPayload, encryptSyncPayload, isEncryptedSyncPackage } from './syncEnvelope';

describe('syncEnvelope', () => {
  it('encrypts and decrypts payload with passphrase', async () => {
    const payload = {
      schema_version: 1,
      package: { foo: 'bar', count: 3 },
    };

    const envelope = await encryptSyncPayload(payload, 'passphrase-123');
    expect(envelope.alg).toBe('AES-GCM-256');

    const decrypted = await decryptSyncPayload(envelope, 'passphrase-123');
    expect(decrypted).toEqual(payload);
  });

  it('rejects wrong passphrase', async () => {
    const envelope = await encryptSyncPayload({ package: { id: 42 } }, 'good-pass');

    await expect(decryptSyncPayload(envelope, 'bad-pass')).rejects.toThrow(
      /Invalid passphrase|corrupted/
    );
  });

  it('detects encrypted sync package wrappers', () => {
    const wrapped = {
      package_envelope: {
        schema_version: 1,
        alg: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA256',
        iterations: 210000,
        salt_b64: 'a',
        iv_b64: 'b',
        ciphertext_b64: 'c',
      },
    };
    expect(isEncryptedSyncPackage(wrapped)).toBe(true);
    expect(isEncryptedSyncPackage({ package: {} })).toBe(false);
  });
});
