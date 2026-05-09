// PBKDF2 iteration count chosen per OWASP Password Storage Cheat Sheet (2024):
// 600,000 iterations for PBKDF2-HMAC-SHA-256.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
export const PBKDF2_ITERATIONS = 600000;
export const AES_KEY_BITS = 256;
export const IV_BYTES = 12;
export const SALT_BYTES = 16;
export const MIN_PASSPHRASE_LENGTH = 12;

const subtle = globalThis.crypto.subtle;

export function generateSalt() {
  return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

function generateIV() {
  return globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

export async function deriveKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(key, plaintext) {
  const iv = generateIV();
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  );
  return { iv, ciphertext };
}

export async function decrypt(key, { iv, ciphertext }) {
  const data = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(data);
}

// Score range: 0 (rejected) through 4 (strong). Heuristic only — length,
// character-class diversity, and unique-character ratio. Replace with a
// stronger estimator (e.g. zxcvbn) later if needed.
export function assessPassphrase(passphrase) {
  if (typeof passphrase !== 'string') {
    return { score: 0, feedback: ['Passphrase must be a string.'] };
  }
  const len = passphrase.length;
  if (len < MIN_PASSPHRASE_LENGTH) {
    return {
      score: 0,
      feedback: [`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`]
    };
  }

  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasDigit = /[0-9]/.test(passphrase);
  const hasSymbol = /[^a-zA-Z0-9]/.test(passphrase);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  const uniqueRatio = new Set(passphrase).size / len;
  const lowVariety = uniqueRatio < 0.4;

  let score = 1;
  if (len >= 16) score++;
  if (len >= 20) score++;
  if (classes >= 3) score++;
  if (lowVariety) score = Math.max(1, score - 1);
  if (score > 4) score = 4;

  const feedback = [];
  if (classes < 2) feedback.push('Mix letter cases, numbers, or symbols.');
  if (len < 16) feedback.push('Longer passphrases (16+ characters) are stronger.');
  if (lowVariety) feedback.push('Avoid repeating the same characters.');

  return { score, feedback };
}
