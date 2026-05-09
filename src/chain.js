import { decrypt } from './crypto.js';
import { STORE_ENTRIES, getEntryByUuid } from './storage.js';

export const GENESIS_HASH = '0'.repeat(64);
export const HASH_HEX_LENGTH = 64;

const subtle = globalThis.crypto.subtle;
const HEX_RE = /^[0-9a-f]{64}$/;

function pathLabel(path) {
  return path === '' ? '<root>' : path;
}

function canonicalJson(value, path = '') {
  if (value === null) return 'null';
  if (value === undefined) {
    throw new Error(`Non-canonical value at ${pathLabel(path)}: undefined is not allowed`);
  }
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number') {
    if (Object.is(value, -0)) {
      throw new Error(`Non-canonical value at ${pathLabel(path)}: -0 is not allowed`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `Non-canonical value at ${pathLabel(path)}: ${value} is not a safe integer`
      );
    }
    return String(value);
  }
  if (type === 'bigint') {
    throw new Error(`Non-canonical value at ${pathLabel(path)}: bigint is not allowed`);
  }
  if (type === 'symbol') {
    throw new Error(`Non-canonical value at ${pathLabel(path)}: symbol is not allowed`);
  }
  if (type === 'function') {
    throw new Error(`Non-canonical value at ${pathLabel(path)}: function is not allowed`);
  }

  if (Array.isArray(value)) {
    const parts = value.map((v, i) => canonicalJson(v, `${path}[${i}]`));
    return '[' + parts.join(',') + ']';
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = value.constructor?.name ?? 'object';
    throw new Error(
      `Non-canonical value at ${pathLabel(path)}: ${name} instance is not allowed`
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(
      `Non-canonical value at ${pathLabel(path)}: symbol-keyed properties are not allowed`
    );
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson(value[k], `${path}.${k}`)
  );
  return '{' + parts.join(',') + '}';
}

function hexToBytes(hex) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  const hex = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hex[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return hex.join('');
}

function buildCanonicalEntry(entry) {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error('entry must be an object');
  }
  if (typeof entry.uuid !== 'string') {
    throw new Error('entry.uuid must be a string');
  }
  if (typeof entry.created_at !== 'string') {
    throw new Error('entry.created_at must be a string');
  }
  const obj = {
    uuid: entry.uuid,
    created_at: entry.created_at,
    payload: entry.payload
  };
  if (entry.supersedes !== undefined) {
    if (typeof entry.supersedes !== 'string') {
      throw new Error('entry.supersedes must be a string when present');
    }
    obj.supersedes = entry.supersedes;
  }
  return obj;
}

export async function computeHash(prevHash, entry) {
  if (typeof prevHash !== 'string' || !HEX_RE.test(prevHash)) {
    throw new Error('prevHash must be 64 lowercase hex characters');
  }
  const canonical = buildCanonicalEntry(entry);
  const canonicalBytes = new TextEncoder().encode(canonicalJson(canonical));
  const prevBytes = hexToBytes(prevHash);
  const buf = new Uint8Array(prevBytes.length + canonicalBytes.length);
  buf.set(prevBytes, 0);
  buf.set(canonicalBytes, prevBytes.length);
  const digest = await subtle.digest('SHA-256', buf);
  return bytesToHex(new Uint8Array(digest));
}

async function getLatestEntry(db) {
  const tx = db.transaction(STORE_ENTRIES, 'readonly');
  const cursor = await tx.store.openCursor(null, 'prev');
  const value = cursor ? cursor.value : null;
  await tx.done;
  return value;
}

export async function appendEntry(db, payload, options = {}) {
  const { supersedes } = options;
  if (supersedes !== undefined) {
    if (typeof supersedes !== 'string') {
      throw new Error('options.supersedes must be a string');
    }
    const target = await getEntryByUuid(db, supersedes);
    if (!target) {
      throw new Error(`supersedes uuid not found: ${supersedes}`);
    }
  }
  // Canonicalize payload eagerly so any violation surfaces before we touch
  // storage or the system clock.
  canonicalJson(payload, '.payload');

  const latest = await getLatestEntry(db);
  const prev_hash = latest ? latest.entry_hash : GENESIS_HASH;
  const uuid = globalThis.crypto.randomUUID();
  const created_at = new Date().toISOString();

  const entry = { uuid, created_at, payload };
  if (supersedes !== undefined) entry.supersedes = supersedes;
  const entry_hash = await computeHash(prev_hash, entry);
  return { ...entry, prev_hash, entry_hash };
}

async function getAllEntriesByid(db) {
  const tx = db.transaction(STORE_ENTRIES, 'readonly');
  const all = await tx.store.getAll();
  await tx.done;
  return all;
}

function isMalformed(entry) {
  return (
    typeof entry?.uuid !== 'string' ||
    typeof entry?.created_at !== 'string' ||
    typeof entry?.prev_hash !== 'string' ||
    typeof entry?.entry_hash !== 'string' ||
    !entry?.encrypted_payload ||
    !(entry.encrypted_payload.iv instanceof Uint8Array) ||
    !(entry.encrypted_payload.ciphertext instanceof Uint8Array)
  );
}

export async function verifyChain(db, masterKey) {
  const entries = await getAllEntriesByid(db);
  if (entries.length === 0) return { valid: true, count: 0 };

  let expectedPrev = GENESIS_HASH;
  for (const entry of entries) {
    if (isMalformed(entry)) {
      return {
        valid: false,
        breakAt: entry?.id,
        breakUuid: entry?.uuid,
        reason: 'malformed_entry'
      };
    }

    let payload;
    try {
      const plaintext = await decrypt(masterKey, entry.encrypted_payload);
      payload = JSON.parse(plaintext);
    } catch {
      return {
        valid: false,
        breakAt: entry.id,
        breakUuid: entry.uuid,
        reason: 'decryption_failed'
      };
    }

    if (entry.prev_hash !== expectedPrev) {
      return {
        valid: false,
        breakAt: entry.id,
        breakUuid: entry.uuid,
        reason: 'prev_hash_mismatch',
        expected: expectedPrev,
        found: entry.prev_hash
      };
    }

    const reconstructed = {
      uuid: entry.uuid,
      created_at: entry.created_at,
      payload
    };
    if (entry.supersedes !== undefined) reconstructed.supersedes = entry.supersedes;

    let computed;
    try {
      computed = await computeHash(entry.prev_hash, reconstructed);
    } catch {
      return {
        valid: false,
        breakAt: entry.id,
        breakUuid: entry.uuid,
        reason: 'malformed_entry'
      };
    }

    if (computed !== entry.entry_hash) {
      return {
        valid: false,
        breakAt: entry.id,
        breakUuid: entry.uuid,
        reason: 'entry_hash_mismatch',
        expected: computed,
        found: entry.entry_hash
      };
    }

    expectedPrev = entry.entry_hash;
  }

  return { valid: true, count: entries.length };
}
