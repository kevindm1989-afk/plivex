import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  assessPassphrase,
  PBKDF2_ITERATIONS,
  AES_KEY_BITS,
  IV_BYTES,
  SALT_BYTES,
  MIN_PASSPHRASE_LENGTH
} from '../src/crypto.js';

const PASSPHRASE = 'correcthorsebatterystaple';

describe('constants', () => {
  test('PBKDF2 iterations meet OWASP 2024 minimum', () => {
    assert.equal(PBKDF2_ITERATIONS, 600000);
  });
  test('AES key size is 256 bits', () => {
    assert.equal(AES_KEY_BITS, 256);
  });
  test('IV size is 12 bytes (96 bits, AES-GCM recommended)', () => {
    assert.equal(IV_BYTES, 12);
  });
  test('salt size is 16 bytes', () => {
    assert.equal(SALT_BYTES, 16);
  });
  test('minimum passphrase length is 12', () => {
    assert.equal(MIN_PASSPHRASE_LENGTH, 12);
  });
});

describe('generateSalt', () => {
  test('returns a Uint8Array of SALT_BYTES length', () => {
    const salt = generateSalt();
    assert.ok(salt instanceof Uint8Array);
    assert.equal(salt.length, SALT_BYTES);
  });
  test('is non-deterministic', () => {
    const a = generateSalt();
    const b = generateSalt();
    assert.notDeepEqual(Array.from(a), Array.from(b));
  });
});

describe('deriveKey', () => {
  test('produces an AES-GCM 256 key with encrypt/decrypt usages', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    assert.equal(key.algorithm.name, 'AES-GCM');
    assert.equal(key.algorithm.length, AES_KEY_BITS);
    assert.deepEqual([...key.usages].sort(), ['decrypt', 'encrypt']);
  });
  test('same passphrase + salt yields a key that decrypts the other key\'s output', async () => {
    const salt = generateSalt();
    const k1 = await deriveKey(PASSPHRASE, salt);
    const k2 = await deriveKey(PASSPHRASE, salt);
    const blob = await encrypt(k1, 'hello');
    assert.equal(await decrypt(k2, blob), 'hello');
  });
});

describe('encrypt / decrypt', () => {
  test('round-trips a string', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(key, 'hello plivex');
    assert.equal(await decrypt(key, blob), 'hello plivex');
  });
  test('round-trips unicode', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const text = 'café 日本語 🦊';
    const blob = await encrypt(key, text);
    assert.equal(await decrypt(key, blob), text);
  });
  test('round-trips empty string', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(key, '');
    assert.equal(await decrypt(key, blob), '');
  });
  test('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const a = await encrypt(key, 'same');
    const b = await encrypt(key, 'same');
    assert.notDeepEqual(Array.from(a.iv), Array.from(b.iv));
    assert.notDeepEqual(Array.from(a.ciphertext), Array.from(b.ciphertext));
  });
  test('IV is IV_BYTES long', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(key, 'x');
    assert.equal(blob.iv.length, IV_BYTES);
  });
  test('decrypt fails with wrong passphrase', async () => {
    const salt = generateSalt();
    const k1 = await deriveKey(PASSPHRASE, salt);
    const k2 = await deriveKey('wronghorsebatterystaple', salt);
    const blob = await encrypt(k1, 'secret');
    await assert.rejects(() => decrypt(k2, blob));
  });
  test('decrypt fails with wrong salt', async () => {
    const k1 = await deriveKey(PASSPHRASE, generateSalt());
    const k2 = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(k1, 'secret');
    await assert.rejects(() => decrypt(k2, blob));
  });
  test('decrypt fails when ciphertext is tampered (GCM auth tag)', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(key, 'secret');
    blob.ciphertext[0] ^= 0xff;
    await assert.rejects(() => decrypt(key, blob));
  });
  test('decrypt fails when IV is tampered', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt(key, 'secret');
    blob.iv[0] ^= 0xff;
    await assert.rejects(() => decrypt(key, blob));
  });
});

describe('assessPassphrase', () => {
  test('non-string input scores 0', () => {
    assert.equal(assessPassphrase(null).score, 0);
    assert.equal(assessPassphrase(undefined).score, 0);
    assert.equal(assessPassphrase(12345).score, 0);
  });
  test('under minimum length scores 0 with length feedback', () => {
    const r = assessPassphrase('short');
    assert.equal(r.score, 0);
    assert.match(r.feedback[0], /at least 12/);
  });
  test('exactly MIN_PASSPHRASE_LENGTH passes the floor', () => {
    const r = assessPassphrase('abcdefghijkl');
    assert.ok(r.score >= 1);
  });
  test('long varied passphrase scores high', () => {
    const r = assessPassphrase('Tr0ub4dor&3-Correct-Horse');
    assert.ok(r.score >= 3, `expected score >= 3, got ${r.score}`);
  });
  test('repeated single character is penalized vs varied chars of same length', () => {
    const repeating = assessPassphrase('aaaaaaaaaaaaaaaaaaaa');
    const varied = assessPassphrase('abcdefghijklmnopqrst');
    assert.ok(
      repeating.score < varied.score,
      `expected repeating(${repeating.score}) < varied(${varied.score})`
    );
  });
  test('feedback is always an array', () => {
    assert.ok(Array.isArray(assessPassphrase('aaaaaaaaaaaa').feedback));
    assert.ok(Array.isArray(assessPassphrase('Tr0ub4dor&3-Correct-Horse').feedback));
    assert.ok(Array.isArray(assessPassphrase('short').feedback));
  });
  test('score never exceeds 4', () => {
    const r = assessPassphrase('Tr0ub4dor&3-Correct-Horse-Battery-Staple-Plus-Extra-Symbols!@#');
    assert.ok(r.score <= 4);
  });
});
