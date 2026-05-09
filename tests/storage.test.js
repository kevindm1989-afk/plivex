import 'fake-indexeddb/auto';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDB } from '../vendor/idb.js';
import {
  openDB,
  closeDB,
  isInitialized,
  initializeDatabase,
  unlockDatabase,
  putEntry,
  getEntry,
  getLatestEntry,
  getEntryByUuid,
  listEntries,
  countEntries,
  rewrapMasterKey,
  wipeDatabase,
  DB_VERSION,
  STORE_META,
  STORE_ENTRIES,
  INDEX_CREATED_AT,
  INDEX_UUID
} from '../src/storage.js';
import { encrypt, decrypt, SALT_BYTES } from '../src/crypto.js';

const PASSPHRASE = 'correcthorsebatterystaple';
const NEW_PASSPHRASE = 'differentpassphrase!2025';

let counter = 0;
const freshName = () => `plivex-test-${process.pid}-${Date.now()}-${++counter}`;

async function setup(t) {
  const name = freshName();
  const db = await openDB(name);
  t.after(async () => {
    try { db.close(); } catch {}
    try { await deleteDB(name); } catch {}
  });
  return { name, db };
}

function makeEntry(overrides = {}) {
  return {
    uuid: overrides.uuid ?? `uuid-${Math.random().toString(36).slice(2)}`,
    created_at: overrides.created_at ?? new Date().toISOString(),
    prev_hash: overrides.prev_hash ?? '0'.repeat(64),
    entry_hash: overrides.entry_hash ?? 'deadbeef'.repeat(8),
    encrypted_payload: overrides.encrypted_payload ?? {
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array([1, 2, 3])
    },
    ...(overrides.supersedes ? { supersedes: overrides.supersedes } : {})
  };
}

describe('database lifecycle', () => {
  test('opens fresh database with v1 schema', async (t) => {
    const { db } = await setup(t);
    assert.equal(db.version, DB_VERSION);
    const stores = [...db.objectStoreNames];
    assert.ok(stores.includes(STORE_META));
    assert.ok(stores.includes(STORE_ENTRIES));
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const indexNames = [...tx.store.indexNames];
    assert.ok(indexNames.includes(INDEX_CREATED_AT));
    assert.ok(indexNames.includes(INDEX_UUID));
    await tx.done;
  });

  test('isInitialized returns false on fresh DB', async (t) => {
    const { db } = await setup(t);
    assert.equal(await isInitialized(db), false);
  });

  test('isInitialized returns true after initializeDatabase', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    assert.equal(await isInitialized(db), true);
  });

  test('closing and re-opening preserves data', async (t) => {
    const name = freshName();
    let db = await openDB(name);
    t.after(async () => { try { db.close(); } catch {} await deleteDB(name); });
    await initializeDatabase(db, PASSPHRASE);
    closeDB(db);
    db = await openDB(name);
    assert.equal(await isInitialized(db), true);
  });

  test('opening with existing schema does not run migrations again', async (t) => {
    const name = freshName();
    let db = await openDB(name);
    t.after(async () => { try { db.close(); } catch {} await deleteDB(name); });
    await initializeDatabase(db, PASSPHRASE);
    closeDB(db);
    db = await openDB(name);
    // Object store names and indexes still exactly the v1 set; if upgrade
    // re-ran it would either error or duplicate-create.
    const stores = [...db.objectStoreNames].sort();
    assert.deepEqual(stores, [STORE_ENTRIES, STORE_META].sort());
    assert.equal(await isInitialized(db), true);
  });
});

describe('initialization', () => {
  test('writes all four meta records', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const tx = db.transaction(STORE_META, 'readonly');
    const [v, c, s, w] = await Promise.all([
      tx.store.get('schema_version'),
      tx.store.get('created_at'),
      tx.store.get('salt'),
      tx.store.get('wrapped_master_key')
    ]);
    await tx.done;
    assert.equal(v.value, DB_VERSION);
    assert.match(c.value, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(s.value instanceof Uint8Array);
    assert.ok(w.value.iv instanceof Uint8Array);
    assert.ok(w.value.ciphertext instanceof Uint8Array);
  });

  test('returns a usable master key (round-trips data)', async (t) => {
    const { db } = await setup(t);
    const masterKey = await initializeDatabase(db, PASSPHRASE);
    const blob = await encrypt(masterKey, 'hello plivex');
    assert.equal(await decrypt(masterKey, blob), 'hello plivex');
  });

  test('throws if called on already-initialized database', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    await assert.rejects(
      () => initializeDatabase(db, PASSPHRASE),
      /already initialized/
    );
  });

  test('salt is SALT_BYTES long', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const salt = (await db.get(STORE_META, 'salt')).value;
    assert.equal(salt.length, SALT_BYTES);
  });
});

describe('unlock', () => {
  test('returns a key that decrypts what the init key encrypted', async (t) => {
    const { db } = await setup(t);
    const initKey = await initializeDatabase(db, PASSPHRASE);
    const blob = await encrypt(initKey, 'persisted secret');
    const unlockKey = await unlockDatabase(db, PASSPHRASE);
    assert.equal(await decrypt(unlockKey, blob), 'persisted secret');
  });

  test('throws on wrong passphrase', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    await assert.rejects(
      () => unlockDatabase(db, 'wronghorsebatterystaple'),
      /Incorrect passphrase/
    );
  });

  test('throws on uninitialized database', async (t) => {
    const { db } = await setup(t);
    await assert.rejects(
      () => unlockDatabase(db, PASSPHRASE),
      /not initialized/
    );
  });

  test('different passphrases produce different unwrapped keys (via cross-decryption failure)', async (t) => {
    const { db } = await setup(t);
    const initKey = await initializeDatabase(db, PASSPHRASE);
    const blob = await encrypt(initKey, 'token');
    // A second database with a different passphrase: its master key is a
    // different random key, so decrypting blob with it must fail.
    const { db: db2 } = await setup(t);
    const otherKey = await initializeDatabase(db2, NEW_PASSPHRASE);
    await assert.rejects(() => decrypt(otherKey, blob));
  });

  test('wrong passphrase error does not leak the passphrase', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const sentinel = 'super-secret-leak-marker-9876';
    let caught;
    try {
      await unlockDatabase(db, sentinel);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.ok(!String(caught.message).includes(sentinel));
    assert.ok(!String(caught.stack ?? '').includes(sentinel));
  });
});

describe('entry operations', () => {
  test('putEntry assigns auto-incrementing id', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const id1 = await putEntry(db, makeEntry());
    const id2 = await putEntry(db, makeEntry());
    const id3 = await putEntry(db, makeEntry());
    assert.equal(typeof id1, 'number');
    assert.ok(id2 > id1);
    assert.ok(id3 > id2);
  });

  test('getEntry returns the record by id', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const e = makeEntry({ uuid: 'pickme' });
    const id = await putEntry(db, e);
    const got = await getEntry(db, id);
    assert.equal(got.uuid, 'pickme');
  });

  test('getEntryByUuid returns the record by uuid', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const e = makeEntry({ uuid: 'lookup-me' });
    await putEntry(db, e);
    const got = await getEntryByUuid(db, 'lookup-me');
    assert.equal(got.uuid, 'lookup-me');
  });

  test('getEntryByUuid returns undefined for unknown uuid', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const got = await getEntryByUuid(db, 'nonexistent');
    assert.equal(got, undefined);
  });

  test('listEntries returns chronological ascending order', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    // insert in non-chronological order
    await putEntry(db, makeEntry({ uuid: 'b', created_at: '2026-05-09T12:00:00.000Z' }));
    await putEntry(db, makeEntry({ uuid: 'a', created_at: '2026-05-01T08:00:00.000Z' }));
    await putEntry(db, makeEntry({ uuid: 'c', created_at: '2026-05-15T18:00:00.000Z' }));
    const list = await listEntries(db);
    assert.deepEqual(list.map((e) => e.uuid), ['a', 'b', 'c']);
  });

  test('listEntries with limit caps result size', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    for (let i = 0; i < 5; i++) {
      await putEntry(
        db,
        makeEntry({
          uuid: `e${i}`,
          created_at: new Date(2026, 0, i + 1).toISOString()
        })
      );
    }
    const limited = await listEntries(db, { limit: 3 });
    assert.equal(limited.length, 3);
  });

  test('listEntries with after returns only later entries', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const t1 = '2026-01-01T00:00:00.000Z';
    const t2 = '2026-02-01T00:00:00.000Z';
    const t3 = '2026-03-01T00:00:00.000Z';
    await putEntry(db, makeEntry({ uuid: 'e1', created_at: t1 }));
    await putEntry(db, makeEntry({ uuid: 'e2', created_at: t2 }));
    await putEntry(db, makeEntry({ uuid: 'e3', created_at: t3 }));
    const after = await listEntries(db, { after: t2 });
    assert.deepEqual(after.map((e) => e.uuid), ['e3']);
  });

  test('countEntries matches listEntries.length', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    for (let i = 0; i < 4; i++) {
      await putEntry(db, makeEntry({ uuid: `c${i}` }));
    }
    assert.equal(await countEntries(db), (await listEntries(db)).length);
    assert.equal(await countEntries(db), 4);
  });
});

describe('master key change', () => {
  test('rewrap preserves the master key (entries written before rewrap still decrypt)', async (t) => {
    const { db } = await setup(t);
    const k1 = await initializeDatabase(db, PASSPHRASE);
    const blob = await encrypt(k1, 'before rewrap');
    await rewrapMasterKey(db, PASSPHRASE, NEW_PASSPHRASE);
    const k2 = await unlockDatabase(db, NEW_PASSPHRASE);
    assert.equal(await decrypt(k2, blob), 'before rewrap');
  });

  test('wrong old passphrase throws', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    await assert.rejects(
      () => rewrapMasterKey(db, 'wronghorsebatterystaple', NEW_PASSPHRASE),
      /Incorrect passphrase/
    );
  });

  test('wrong old passphrase does not modify stored data', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const before = await db.get(STORE_META, 'wrapped_master_key');
    const beforeSalt = await db.get(STORE_META, 'salt');
    try {
      await rewrapMasterKey(db, 'wronghorsebatterystaple', NEW_PASSPHRASE);
    } catch {}
    const after = await db.get(STORE_META, 'wrapped_master_key');
    const afterSalt = await db.get(STORE_META, 'salt');
    assert.deepEqual(
      Array.from(before.value.ciphertext),
      Array.from(after.value.ciphertext)
    );
    assert.deepEqual(Array.from(beforeSalt.value), Array.from(afterSalt.value));
  });

  test('new passphrase unlocks successfully after rewrap', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    await rewrapMasterKey(db, PASSPHRASE, NEW_PASSPHRASE);
    await assert.doesNotReject(() => unlockDatabase(db, NEW_PASSPHRASE));
    await assert.rejects(
      () => unlockDatabase(db, PASSPHRASE),
      /Incorrect passphrase/
    );
  });
});

describe('wipe', () => {
  test('removes all entries on fresh re-open', async (t) => {
    const name = freshName();
    let db = await openDB(name);
    t.after(async () => { try { db.close(); } catch {} await deleteDB(name); });
    await initializeDatabase(db, PASSPHRASE);
    await putEntry(db, makeEntry());
    await putEntry(db, makeEntry());
    await wipeDatabase(db);
    db = await openDB(name);
    assert.equal(await countEntries(db), 0);
  });

  test('removes all meta records on fresh re-open', async (t) => {
    const name = freshName();
    let db = await openDB(name);
    t.after(async () => { try { db.close(); } catch {} await deleteDB(name); });
    await initializeDatabase(db, PASSPHRASE);
    await wipeDatabase(db);
    db = await openDB(name);
    const tx = db.transaction(STORE_META, 'readonly');
    const records = await Promise.all(
      ['schema_version', 'created_at', 'salt', 'wrapped_master_key'].map(
        (k) => tx.store.get(k)
      )
    );
    await tx.done;
    assert.deepEqual(records, [undefined, undefined, undefined, undefined]);
  });

  test('after wipe, isInitialized returns false on fresh open', async (t) => {
    const name = freshName();
    let db = await openDB(name);
    t.after(async () => { try { db.close(); } catch {} await deleteDB(name); });
    await initializeDatabase(db, PASSPHRASE);
    await wipeDatabase(db);
    db = await openDB(name);
    assert.equal(await isInitialized(db), false);
  });
});

describe('getLatestEntry', () => {
  test('returns null on empty entries store', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    assert.equal(await getLatestEntry(db), null);
  });

  test('returns entry with the highest id when populated', async (t) => {
    const { db } = await setup(t);
    await initializeDatabase(db, PASSPHRASE);
    const id1 = await putEntry(db, makeEntry({ uuid: 'first' }));
    const id2 = await putEntry(db, makeEntry({ uuid: 'second' }));
    const id3 = await putEntry(db, makeEntry({ uuid: 'third' }));
    assert.ok(id3 > id2 && id2 > id1);
    const latest = await getLatestEntry(db);
    assert.equal(latest.uuid, 'third');
    assert.equal(latest.id, id3);
  });
});
