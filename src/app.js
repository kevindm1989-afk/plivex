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
  getAllEntriesById,
  getLatestEntry,
  getMetaRecord,
  putMetaRecord,
  DB_NAME,
  DB_VERSION,
  STORE_META,
  STORE_ENTRIES
} from './storage.js';
import { encrypt, decrypt, assessPassphrase } from './crypto.js';
import { appendEntry, verifyChain, GENESIS_HASH } from './chain.js';

let _db = null;
let _dbName = null;
let _masterKey = null;
let _status = 'unbooted';
let _lastActiveAt = 0;
let _autoLockTimeoutMs = 15 * 60 * 1000;

// Injectable wall-clock for tests. Production calls go through Date.now;
// tests can swap this to fast-forward time without real waits.
let _now = () => Date.now();

export const ALLOWED_AUTO_LOCK_MINUTES = [1, 5, 15, 30, 60];
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

// Backup reminder cadence in days. 0 = disabled.
export const ALLOWED_BACKUP_REMINDER_DAYS = [0, 3, 7, 14, 30];
export const DEFAULT_BACKUP_REMINDER_DAYS = 7;

// Integrity-verification reminder cadence in days. 0 = disabled.
export const ALLOWED_VERIFY_REMINDER_DAYS = [0, 7, 30, 90];
export const DEFAULT_VERIFY_REMINDER_DAYS = 30;

function assertStatus(allowed, op) {
  const ok = Array.isArray(allowed) ? allowed.includes(_status) : _status === allowed;
  if (!ok) {
    throw new Error(`${op}: status is '${_status}'`);
  }
}

// Wall-clock based: a backgrounded tab or sleeping device does not pause the
// timer. If the system clock moves backward (user manually adjusts it), the
// resulting negative delta is treated as "not yet expired" — better to leave
// the user unlocked than to silently lock them based on an inverted clock.
function checkAutoLock() {
  if (_status !== 'unlocked') return false;
  const elapsed = _now() - _lastActiveAt;
  if (elapsed < 0) return false;
  if (elapsed > _autoLockTimeoutMs) {
    _masterKey = null;
    _status = 'locked';
    return true;
  }
  return false;
}

function assertUnlockedAndActive(op) {
  assertStatus('unlocked', op);
  if (checkAutoLock()) {
    throw new Error(`${op}: status is 'locked'`);
  }
}

export function recordActivity() {
  _lastActiveAt = _now();
}

export async function bootstrap(options = {}) {
  assertStatus('unbooted', 'bootstrap');
  _dbName = options.dbName ?? DB_NAME;
  _db = await openDB(_dbName);
  if (await isInitialized(_db)) {
    const stored = await getMetaRecord(_db, 'auto_lock_minutes');
    const minutes = stored?.value ?? DEFAULT_AUTO_LOCK_MINUTES;
    _autoLockTimeoutMs = minutes * 60 * 1000;
    _status = 'locked';
    return { status: _status, entryCount: await storageCountEntries(_db) };
  }
  _autoLockTimeoutMs = DEFAULT_AUTO_LOCK_MINUTES * 60 * 1000;
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
  await putMetaRecord(_db, 'auto_lock_minutes', DEFAULT_AUTO_LOCK_MINUTES);
  _autoLockTimeoutMs = DEFAULT_AUTO_LOCK_MINUTES * 60 * 1000;
  _status = 'unlocked';
  recordActivity();
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
  recordActivity();
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
  assertUnlockedAndActive('changePassphrase');
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
  assertUnlockedAndActive('createEntry');
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
  assertUnlockedAndActive('getEntry');
  const record = await storageGetEntry(_db, id);
  return record ? decryptRecord(record) : null;
}

export async function getEntryByUuid(uuid) {
  assertUnlockedAndActive('getEntryByUuid');
  const record = await storageGetEntryByUuid(_db, uuid);
  return record ? decryptRecord(record) : null;
}

export async function listEntries(options = {}) {
  assertUnlockedAndActive('listEntries');
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
  assertUnlockedAndActive('verifyIntegrity');
  const result = await verifyChain(_db, _masterKey);
  if (result.valid) {
    // Mark a successful verification so the reminder banner can stay quiet
    // until the next cadence window. Best-effort.
    try {
      await putMetaRecord(_db, 'last_verified_at', new Date(_now()).toISOString());
    } catch {}
  }
  return result;
}

export function getAutoLockMinutes() {
  return _autoLockTimeoutMs / 60 / 1000;
}

export async function setAutoLockMinutes(minutes) {
  assertUnlockedAndActive('setAutoLockMinutes');
  if (!ALLOWED_AUTO_LOCK_MINUTES.includes(minutes)) {
    throw new Error(
      `setAutoLockMinutes: ${minutes} is not one of ${ALLOWED_AUTO_LOCK_MINUTES.join(', ')}`
    );
  }
  await putMetaRecord(_db, 'auto_lock_minutes', minutes);
  _autoLockTimeoutMs = minutes * 60 * 1000;
  return { ok: true };
}

export async function getBackupReminderDays() {
  if (!_db) return DEFAULT_BACKUP_REMINDER_DAYS;
  const rec = await getMetaRecord(_db, 'backup_reminder_days');
  return rec?.value ?? DEFAULT_BACKUP_REMINDER_DAYS;
}

export async function setBackupReminderDays(days) {
  assertUnlockedAndActive('setBackupReminderDays');
  if (!ALLOWED_BACKUP_REMINDER_DAYS.includes(days)) {
    throw new Error(
      `setBackupReminderDays: ${days} is not one of ${ALLOWED_BACKUP_REMINDER_DAYS.join(', ')}`
    );
  }
  await putMetaRecord(_db, 'backup_reminder_days', days);
  return { ok: true };
}

export async function getLastExportAt() {
  if (!_db) return null;
  const rec = await getMetaRecord(_db, 'last_export_at');
  return rec?.value ?? null;
}

export async function shouldRemindBackup() {
  if (_status !== 'unlocked' && _status !== 'locked') return false;
  const days = await getBackupReminderDays();
  if (days === 0) return false;
  const last = await getLastExportAt();
  if (!last) return true;
  const elapsedMs = _now() - new Date(last).getTime();
  return elapsedMs > days * 24 * 60 * 60 * 1000;
}

export async function getVerifyReminderDays() {
  if (!_db) return DEFAULT_VERIFY_REMINDER_DAYS;
  const rec = await getMetaRecord(_db, 'verify_reminder_days');
  return rec?.value ?? DEFAULT_VERIFY_REMINDER_DAYS;
}

export async function setVerifyReminderDays(days) {
  assertUnlockedAndActive('setVerifyReminderDays');
  if (!ALLOWED_VERIFY_REMINDER_DAYS.includes(days)) {
    throw new Error(
      `setVerifyReminderDays: ${days} is not one of ${ALLOWED_VERIFY_REMINDER_DAYS.join(', ')}`
    );
  }
  await putMetaRecord(_db, 'verify_reminder_days', days);
  return { ok: true };
}

export async function getLastVerifiedAt() {
  if (!_db) return null;
  const rec = await getMetaRecord(_db, 'last_verified_at');
  return rec?.value ?? null;
}

export async function shouldRemindVerify() {
  if (_status !== 'unlocked' && _status !== 'locked') return false;
  const days = await getVerifyReminderDays();
  if (days === 0) return false;
  const last = await getLastVerifiedAt();
  if (!last) return true;
  const elapsedMs = _now() - new Date(last).getTime();
  return elapsedMs > days * 24 * 60 * 60 * 1000;
}

export async function getChainHead() {
  assertStatus(['locked', 'unlocked'], 'getChainHead');
  const latest = await getLatestEntry(_db);
  return latest?.entry_hash ?? GENESIS_HASH;
}

// Read-only metadata over the chain for the printable certificate. Does
// not decrypt anything — only structural fields (uuid, created_at,
// supersedes, entry_hash) are exposed.
export async function getCertificateData() {
  assertStatus(['locked', 'unlocked'], 'getCertificateData');
  const entries = await getAllEntriesById(_db);
  const supersedes = entries
    .filter((e) => e.supersedes !== undefined)
    .map((e) => ({ entry_id: e.id, this_uuid: e.uuid, replaces_uuid: e.supersedes }));
  if (entries.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      app_version: APP_VERSION,
      total_entries: 0,
      chain_head: GENESIS_HASH,
      first_entry: null,
      last_entry: null,
      supersedes: []
    };
  }
  const first = entries[0];
  const last = entries[entries.length - 1];
  return {
    generated_at: new Date().toISOString(),
    app_version: APP_VERSION,
    total_entries: entries.length,
    chain_head: last.entry_hash,
    first_entry: { id: first.id, uuid: first.uuid, created_at: first.created_at, entry_hash: first.entry_hash },
    last_entry: { id: last.id, uuid: last.uuid, created_at: last.created_at, entry_hash: last.entry_hash },
    supersedes
  };
}

export async function getStatus() {
  if (_status === 'locked' || _status === 'unlocked') {
    return { status: _status, entryCount: await storageCountEntries(_db) };
  }
  return { status: _status };
}

export const APP_VERSION = '1.7.0';

// Browser storage usage / quota. Returns null when the platform does not
// expose StorageManager.estimate (Safari < 17, some embedded webviews).
export async function getStorageEstimate() {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return null;
  }
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
export const EXPORT_FORMAT = 'plivex-export';
export const EXPORT_FORMAT_VERSION = 1;

const subtle = globalThis.crypto.subtle;

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Canonical JSON for the export shape. Input is fully under our control
// (strings, integers, nested objects, arrays). For the strict canonical-
// JSON enforcement used in the chain hash, see src/chain.js.
function canonicalSort(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalSort);
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = canonicalSort(value[k]);
  return out;
}

async function sha256Hex(text) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function encodeEncryptedPayload(p) {
  return { iv: bytesToBase64(p.iv), ciphertext: bytesToBase64(p.ciphertext) };
}

function decodeEncryptedPayload(p) {
  return { iv: base64ToBytes(p.iv), ciphertext: base64ToBytes(p.ciphertext) };
}

export async function exportBackup() {
  // Allowed in locked OR unlocked: export only reads encrypted records.
  assertStatus(['locked', 'unlocked'], 'exportBackup');
  if (_status === 'unlocked' && checkAutoLock()) {
    throw new Error("exportBackup: status is 'locked'");
  }
  const schemaRec = await getMetaRecord(_db, 'schema_version');
  const saltRec = await getMetaRecord(_db, 'salt');
  const wrappedRec = await getMetaRecord(_db, 'wrapped_master_key');
  if (!schemaRec || !saltRec || !wrappedRec) {
    throw new Error('exportBackup: database not initialized');
  }
  const records = await getAllEntriesById(_db);
  const entries = records.map((r) => {
    const out = {
      id: r.id,
      uuid: r.uuid,
      created_at: r.created_at,
      prev_hash: r.prev_hash,
      entry_hash: r.entry_hash,
      encrypted_payload: encodeEncryptedPayload(r.encrypted_payload)
    };
    if (r.supersedes !== undefined) out.supersedes = r.supersedes;
    return out;
  });

  const body = {
    format: EXPORT_FORMAT,
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    schema_version: schemaRec.value,
    salt: bytesToBase64(saltRec.value),
    wrapped_master_key: encodeEncryptedPayload(wrappedRec.value),
    entries
  };
  const export_hash = await sha256Hex(JSON.stringify(canonicalSort(body)));
  // Mark that an export was prepared so the backup-reminder banner can
  // dismiss until the next cadence window. Best-effort: failure to write
  // the meta record should not break the export itself.
  try {
    await putMetaRecord(_db, 'last_export_at', new Date(_now()).toISOString());
  } catch {}
  return { ...body, export_hash };
}

function validateImport(backup) {
  if (!backup || typeof backup !== 'object') {
    return 'malformed: not an object';
  }
  if (backup.format !== EXPORT_FORMAT) {
    return `malformed: format must be '${EXPORT_FORMAT}'`;
  }
  if (backup.format_version !== EXPORT_FORMAT_VERSION) {
    return `unsupported format_version ${backup.format_version}`;
  }
  if (typeof backup.salt !== 'string') return 'malformed: salt missing';
  if (!backup.wrapped_master_key) return 'malformed: wrapped_master_key missing';
  if (!Array.isArray(backup.entries)) return 'malformed: entries must be an array';
  if (typeof backup.export_hash !== 'string') return 'malformed: export_hash missing';
  return null;
}

export async function importBackup(backup) {
  if (_status === 'unbooted') {
    throw new Error("importBackup: status is 'unbooted'");
  }
  const malformedReason = validateImport(backup);
  if (malformedReason) {
    return { ok: false, reason: 'malformed', detail: malformedReason };
  }
  const { export_hash, ...body } = backup;
  const recomputed = await sha256Hex(JSON.stringify(canonicalSort(body)));
  if (recomputed !== export_hash) {
    return { ok: false, reason: 'hash_mismatch' };
  }

  await wipeDatabase(_db);
  _db = await openDB(_dbName);

  // Single transaction across both stores: every meta + entry write either
  // commits together or all rolls back. If the transaction aborts (e.g. a
  // duplicate uuid violates the by_uuid unique index), the database is
  // left in the same empty state the wipe produced.
  try {
    const tx = _db.transaction([STORE_META, STORE_ENTRIES], 'readwrite');
    // If a put rejects, we exit the try via that rejection; tx.done would
    // also reject and become an unhandled rejection. Attach a no-op catch
    // immediately so the secondary rejection is absorbed cleanly.
    tx.done.catch(() => {});
    const metaStore = tx.objectStore(STORE_META);
    const entriesStore = tx.objectStore(STORE_ENTRIES);
    await metaStore.put({ key: 'schema_version', value: body.schema_version ?? DB_VERSION });
    await metaStore.put({ key: 'created_at', value: new Date().toISOString() });
    await metaStore.put({ key: 'salt', value: base64ToBytes(body.salt) });
    await metaStore.put({ key: 'wrapped_master_key', value: decodeEncryptedPayload(body.wrapped_master_key) });
    for (const e of body.entries) {
      const record = {
        uuid: e.uuid,
        created_at: e.created_at,
        prev_hash: e.prev_hash,
        entry_hash: e.entry_hash,
        encrypted_payload: decodeEncryptedPayload(e.encrypted_payload)
      };
      if (e.supersedes !== undefined) record.supersedes = e.supersedes;
      await entriesStore.put(record);
    }
    await tx.done;
  } catch (err) {
    _masterKey = null;
    _status = 'uninitialized';
    return { ok: false, reason: 'import_failed', detail: err.message };
  }

  _masterKey = null;
  _status = 'locked';
  return { ok: true, count: body.entries.length };
}

// Test-only: swap in a fake clock. Returns a restore function.
export function _setClockForTesting(fn) {
  const previous = _now;
  _now = fn ?? (() => Date.now());
  return () => { _now = previous; };
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
  _lastActiveAt = 0;
  _autoLockTimeoutMs = DEFAULT_AUTO_LOCK_MINUTES * 60 * 1000;
  _now = () => Date.now();
}

// Browser bootstrap (standalone detection, service worker registration, and
// install-gate UI) lives in src/ui/ui.js. This module is pure orchestration
// and has no DOM side effects on import.
