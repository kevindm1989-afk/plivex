// Encrypted payload convention:
//   on write:  ciphertext = encrypt(masterKey, utf8(JSON.stringify(payload)))
//   on read:   payload    = JSON.parse(utf8Decode(decrypt(masterKey, ciphertext)))
// Hash chain canonicalizes payload separately for hashing — see src/chain.js.

import {
  openDB,
  isInitialized,
  initializeDatabase,
  unlockDatabase,
  putEntry,
  getEntry as storageGetEntry,
  getEntryByUuid as storageGetEntryByUuid,
  listEntries as storageListEntries,
  countEntries as storageCountEntries,
  rewrapMasterKey,
  wipeDatabase,
  DB_NAME
} from './storage.js';
import { encrypt, decrypt, assessPassphrase } from './crypto.js';
import { appendEntry, verifyChain } from './chain.js';

let _db = null;
let _dbName = null;
let _masterKey = null;
let _status = 'unbooted';

function assertStatus(allowed, op) {
  const ok = Array.isArray(allowed) ? allowed.includes(_status) : _status === allowed;
  if (!ok) {
    throw new Error(`${op}: status is '${_status}'`);
  }
}

export async function bootstrap(options = {}) {
  assertStatus('unbooted', 'bootstrap');
  _dbName = options.dbName ?? DB_NAME;
  _db = await openDB(_dbName);
  if (await isInitialized(_db)) {
    _status = 'locked';
    return { status: _status, entryCount: await storageCountEntries(_db) };
  }
  _status = 'uninitialized';
  return { status: _status };
}

export async function initialize(passphrase) {
  assertStatus('uninitialized', 'initialize');
  const assessment = assessPassphrase(passphrase);
  if (assessment.score === 0) {
    return { ok: false, feedback: assessment.feedback };
  }
  _masterKey = await initializeDatabase(_db, passphrase);
  _status = 'unlocked';
  return { ok: true };
}

const WRONG_PASSPHRASE_RE = /Incorrect passphrase|at least \d+ character/i;

export async function unlock(passphrase) {
  assertStatus('locked', 'unlock');
  let key;
  try {
    key = await unlockDatabase(_db, passphrase);
  } catch (err) {
    if (WRONG_PASSPHRASE_RE.test(err.message)) {
      return { ok: false, reason: 'incorrect_passphrase' };
    }
    throw err;
  }
  _masterKey = key;
  _status = 'unlocked';
  return { ok: true };
}

export async function lock() {
  assertStatus('unlocked', 'lock');
  _masterKey = null;
  _status = 'locked';
  return { ok: true };
}

export async function wipe() {
  if (_status === 'unbooted') {
    throw new Error("wipe: status is 'unbooted'");
  }
  await wipeDatabase(_db);
  _db = await openDB(_dbName);
  _masterKey = null;
  _status = 'uninitialized';
  return { ok: true };
}

export async function changePassphrase(oldPassphrase, newPassphrase) {
  assertStatus('unlocked', 'changePassphrase');
  const assessment = assessPassphrase(newPassphrase);
  if (assessment.score === 0) {
    return { ok: false, feedback: assessment.feedback };
  }
  try {
    await rewrapMasterKey(_db, oldPassphrase, newPassphrase);
  } catch (err) {
    if (WRONG_PASSPHRASE_RE.test(err.message)) {
      return { ok: false, reason: 'incorrect_passphrase' };
    }
    throw err;
  }
  return { ok: true };
}

export async function createEntry(payload, options = {}) {
  assertStatus('unlocked', 'createEntry');
  const entry = await appendEntry(_db, payload, options);
  const encrypted_payload = await encrypt(_masterKey, JSON.stringify(payload));
  const record = {
    uuid: entry.uuid,
    created_at: entry.created_at,
    prev_hash: entry.prev_hash,
    entry_hash: entry.entry_hash,
    encrypted_payload
  };
  if (entry.supersedes !== undefined) record.supersedes = entry.supersedes;
  const id = await putEntry(_db, record);
  return { ok: true, id, uuid: entry.uuid, entry_hash: entry.entry_hash };
}

async function decryptRecord(record) {
  if (!record) return null;
  const plaintext = await decrypt(_masterKey, record.encrypted_payload);
  const payload = JSON.parse(plaintext);
  const out = {
    id: record.id,
    uuid: record.uuid,
    created_at: record.created_at,
    prev_hash: record.prev_hash,
    entry_hash: record.entry_hash,
    payload
  };
  if (record.supersedes !== undefined) out.supersedes = record.supersedes;
  return out;
}

export async function getEntry(id) {
  assertStatus('unlocked', 'getEntry');
  const record = await storageGetEntry(_db, id);
  return record ? decryptRecord(record) : null;
}

export async function getEntryByUuid(uuid) {
  assertStatus('unlocked', 'getEntryByUuid');
  const record = await storageGetEntryByUuid(_db, uuid);
  return record ? decryptRecord(record) : null;
}

export async function listEntries(options = {}) {
  assertStatus('unlocked', 'listEntries');
  const records = await storageListEntries(_db, options);
  const result = [];
  for (const r of records) result.push(await decryptRecord(r));
  return result;
}

export async function countEntries() {
  assertStatus(['locked', 'unlocked'], 'countEntries');
  return storageCountEntries(_db);
}

export async function verifyIntegrity() {
  assertStatus('unlocked', 'verifyIntegrity');
  return verifyChain(_db, _masterKey);
}

export async function getStatus() {
  if (_status === 'locked' || _status === 'unlocked') {
    return { status: _status, entryCount: await storageCountEntries(_db) };
  }
  return { status: _status };
}

// Test-only: reset module-scoped state. Production callers should not use
// this — module state is intended to live for the entire page load.
export function _resetForTesting() {
  if (_db) {
    try { _db.close(); } catch {}
  }
  _db = null;
  _dbName = null;
  _masterKey = null;
  _status = 'unbooted';
}

// Browser-side bootstrap: PWA install gate + service worker registration.
// Skipped automatically when window/document are absent (e.g., Node tests).
function bootstrapBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    document.getElementById('install-prompt')?.setAttribute('hidden', '');
    document.getElementById('app')?.removeAttribute('hidden');
  } else {
    document.getElementById('app')?.setAttribute('hidden', '');
    document.getElementById('install-prompt')?.removeAttribute('hidden');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((err) => console.error('Service worker registration failed:', err));
  }
}

bootstrapBrowser();
