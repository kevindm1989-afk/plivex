// WebCrypto wrapper. Phase 2 will implement:
//   deriveKey(passphrase, salt) — PBKDF2-SHA256, >=100k iterations
//   encrypt(key, plaintext)     — AES-GCM, 96-bit IV
//   decrypt(key, ciphertext)
//   generateSalt()

export const PBKDF2_ITERATIONS = 100000;
export const AES_KEY_BITS = 256;
export const IV_BYTES = 12;
export const SALT_BYTES = 16;
