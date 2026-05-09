import { openDB as idbOpenDB, deleteDB } from '../vendor/idb.js';
import { deriveKey, generateSalt } from './crypto.js';

export const DB_NAME = 'plivex';
export const DB_VERSION = 1;
export const STORE_META = 'meta';
export const STORE_ENTRIES = 'entries';
export const INDEX_CREATED_AT = 'by_created_at';
export const INDEX_UUID = 'by_uuid';

const META_KEYS = ['schema_version', 'created_at', 'salt', 'wrapped_master_key'];

const subtle = globalThis.crypto.subtle;
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

function applyMigrations(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore(STORE_META, { keyPath: 'key' });
    const entries = db.createObjectStore(STORE_ENTRIES, {
      keyPath: 'id',
      autoIncrement: true
    });
    entries.createIndex(INDEX_CREATED_AT, 'created_at', { unique: false });
    entries.createIndex(INDEX_UUID, 'uuid', { unique: true });
  }
  // future migrations: if (oldVersion < 2) { ... }
}

export async function openDB(dbName = DB_NAME) {
  return idbOpenDB(dbName, DB_VERSION, {
    upgrade(db, oldVersion) {
      applyMigrations(db, oldVersion);
    }
  });
}

export function closeDB(db) {
  db.close();
}

export async function isInitialized(db) {
  const tx = db.transaction(STORE_META, 'readonly');
  const records = await Promise.all(META_KEYS.map((k) => tx.store.get(k)));
  await tx.done;
  return records.every((r) => r !== undefined);
}

async function generateMasterKey() {
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function wrapMasterKey(kek, masterKey) {
  // The KEK derived by crypto.js has encrypt/decrypt usages (not
  // wrapKey/unwrapKey), so export the master key to raw bytes and AES-GCM-
  // encrypt them. Functionally identical to subtle.wrapKey/unwrapKey.
  const raw = await subtle.exportKey('raw', masterKey);
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw)
  );
  return { iv, ciphertext };
}

async function unwrapMasterKey(kek, blob) {
  let raw;
  try {
    raw = await subtle.decrypt(
      { name: 'AES-GCM', iv: blob.iv },
      kek,
      blob.ciphertext
    );
  } catch {
    throw new Error('Incorrect passphrase');
  }
  return subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function initializeDatabase(db, passphrase) {
  if (await isInitialized(db)) {
    throw new Error('Database already initialized');
  }
  const salt = generateSalt();
  const kek = await deriveKey(passphrase, salt);
  const masterKey = await generateMasterKey();
  const wrapped = await wrapMasterKey(kek, masterKey);
  const tx = db.transaction(STORE_META, 'readwrite');
  await Promise.all([
    tx.store.put({ key: 'schema_version', value: DB_VERSION }),
    tx.store.put({ key: 'created_at', value: new Date().toISOString() }),
    tx.store.put({ key: 'salt', value: salt }),
    tx.store.put({ key: 'wrapped_master_key', value: wrapped })
  ]);
  await tx.done;
  return masterKey;
}

export async function unlockDatabase(db, passphrase) {
  const tx = db.transaction(STORE_META, 'readonly');
  const saltRec = await tx.store.get('salt');
  const wrappedRec = await tx.store.get('wrapped_master_key');
  await tx.done;
  if (!saltRec || !wrappedRec) {
    throw new Error('Database not initialized');
  }
  const kek = await deriveKey(passphrase, saltRec.value);
  return unwrapMasterKey(kek, wrappedRec.value);
}

// Entry shape:
//   { id (auto), uuid, created_at, prev_hash, entry_hash,
//     encrypted_payload: { iv, ciphertext }, supersedes? }
//
// Only `encrypted_payload` is encrypted. uuid, created_at, prev_hash,
// entry_hash, and supersedes are stored as plaintext so the hash chain can
// be verified without unlocking the database.
export async function putEntry(db, entry) {
  return db.put(STORE_ENTRIES, entry);
}

export async function getEntry(db, id) {
  return db.get(STORE_ENTRIES, id);
}

export async function getLatestEntry(db) {
  const tx = db.transaction(STORE_ENTRIES, 'readonly');
  const cursor = await tx.store.openCursor(null, 'prev');
  const value = cursor ? cursor.value : null;
  await tx.done;
  return value;
}

export async function getAllEntriesById(db) {
  const tx = db.transaction(STORE_ENTRIES, 'readonly');
  const all = await tx.store.getAll();
  await tx.done;
  return all;
}

export async function getMetaRecord(db, key) {
  return db.get(STORE_META, key);
}

export async function putMetaRecord(db, key, value) {
  return db.put(STORE_META, { key, value });
}

export async function getEntryByUuid(db, uuid) {
  return db.getFromIndex(STORE_ENTRIES, INDEX_UUID, uuid);
}

export async function listEntries(db, options = {}) {
  const { limit, after } = options;
  const tx = db.transaction(STORE_ENTRIES, 'readonly');
  const idx = tx.store.index(INDEX_CREATED_AT);
  const range = after !== undefined ? IDBKeyRange.lowerBound(after, true) : null;
  const results = [];
  let cursor = await idx.openCursor(range);
  while (cursor) {
    results.push(cursor.value);
    if (limit !== undefined && results.length >= limit) break;
    cursor = await cursor.continue();
  }
  await tx.done;
  return results;
}

export async function countEntries(db) {
  return db.count(STORE_ENTRIES);
}

export async function rewrapMasterKey(db, oldPassphrase, newPassphrase) {
  const readTx = db.transaction(STORE_META, 'readonly');
  const saltRec = await readTx.store.get('salt');
  const wrappedRec = await readTx.store.get('wrapped_master_key');
  await readTx.done;
  if (!saltRec || !wrappedRec) {
    throw new Error('Database not initialized');
  }
  const oldKek = await deriveKey(oldPassphrase, saltRec.value);
  const masterKey = await unwrapMasterKey(oldKek, wrappedRec.value);

  // Fresh salt for the new passphrase keeps the two KEKs independently
  // derived even if the user reuses passphrase material.
  const newSalt = generateSalt();
  const newKek = await deriveKey(newPassphrase, newSalt);
  const newWrapped = await wrapMasterKey(newKek, masterKey);

  const writeTx = db.transaction(STORE_META, 'readwrite');
  await Promise.all([
    writeTx.store.put({ key: 'salt', value: newSalt }),
    writeTx.store.put({ key: 'wrapped_master_key', value: newWrapped })
  ]);
  await writeTx.done;
}

export async function wipeDatabase(db) {
  const name = db.name;
  db.close();
  await deleteDB(name);
}
