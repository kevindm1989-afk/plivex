import 'fake-indexeddb/auto';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDB } from '../vendor/idb.js';
import * as app from '../src/app.js';

const PASSPHRASE = 'correcthorsebatterystaple';
const NEW_PASSPHRASE = 'differentpassphrase!2025';

let counter = 0;
const uniqueName = () => `plivex-app-${process.pid}-${Date.now()}-${++counter}`;

async function freshApp(t) {
  app._resetForTesting();
  const dbName = uniqueName();
  await app.bootstrap({ dbName });
  t.after(async () => {
    app._resetForTesting();
    try { await deleteDB(dbName); } catch {}
  });
  return dbName;
}

async function freshAndUnlocked(t) {
  const name = await freshApp(t);
  await app.initialize(PASSPHRASE);
  return name;
}

// Reused initialized but locked: bootstrap → init → lock → re-bootstrap
// would be the natural flow, but we use a single bootstrap per test (since
// bootstrap is one-shot) and just call lock() to get into the locked state.
async function freshAndLocked(t) {
  const name = await freshAndUnlocked(t);
  await app.lock();
  return name;
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

describe('bootstrap', () => {
  test('fresh database transitions unbooted → uninitialized', async (t) => {
    app._resetForTesting();
    const dbName = uniqueName();
    t.after(async () => { app._resetForTesting(); try { await deleteDB(dbName); } catch {} });
    const before = (await app.getStatus()).status;
    const result = await app.bootstrap({ dbName });
    assert.equal(before, 'unbooted');
    assert.equal(result.status, 'uninitialized');
    assert.equal(result.entryCount, undefined);
  });

  test('initialized database transitions unbooted → locked', async (t) => {
    app._resetForTesting();
    const dbName = uniqueName();
    t.after(async () => { app._resetForTesting(); try { await deleteDB(dbName); } catch {} });
    await app.bootstrap({ dbName });
    await app.initialize(PASSPHRASE);
    await app.createEntry({ msg: 'persisted' });
    app._resetForTesting();
    const result = await app.bootstrap({ dbName });
    assert.equal(result.status, 'locked');
    assert.equal(result.entryCount, 1);
  });

  test('calling bootstrap twice throws', async (t) => {
    await freshApp(t);
    await assert.rejects(() => app.bootstrap({ dbName: uniqueName() }), /bootstrap/);
  });
});

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

describe('initialize', () => {
  test('successful initialize transitions uninitialized → unlocked', async (t) => {
    await freshApp(t);
    const result = await app.initialize(PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('weak passphrase (under min length) returns ok:false, status unchanged', async (t) => {
    await freshApp(t);
    const result = await app.initialize('short');
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.feedback));
    assert.equal((await app.getStatus()).status, 'uninitialized');
  });

  test('initialize while already initialized throws', async (t) => {
    await freshApp(t);
    await app.initialize(PASSPHRASE);
    await assert.rejects(() => app.initialize(PASSPHRASE), /initialize/);
  });

  test('empty passphrase returns ok:false, status unchanged', async (t) => {
    await freshApp(t);
    const result = await app.initialize('');
    assert.equal(result.ok, false);
    assert.equal((await app.getStatus()).status, 'uninitialized');
  });

  test('initialize stores the master key (subsequent createEntry works)', async (t) => {
    await freshApp(t);
    await app.initialize(PASSPHRASE);
    const out = await app.createEntry({ msg: 'hi' });
    assert.equal(out.ok, true);
    assert.ok(typeof out.id === 'number');
  });
});

// ---------------------------------------------------------------------------
// unlock
// ---------------------------------------------------------------------------

describe('unlock', () => {
  test('successful unlock with correct passphrase', async (t) => {
    await freshAndLocked(t);
    const result = await app.unlock(PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('wrong passphrase returns ok:false reason:incorrect_passphrase, stays locked', async (t) => {
    await freshAndLocked(t);
    const result = await app.unlock('wronghorsebatterystaple');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'incorrect_passphrase');
    assert.equal((await app.getStatus()).status, 'locked');
  });

  test('wrong passphrase response does not echo the passphrase or any substring', async (t) => {
    await freshAndLocked(t);
    const sentinel = 'CORRECTHORSEBATTERYSTAPLE_SENTINEL_xyz';
    const result = await app.unlock(sentinel);
    assert.equal(result.ok, false);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(sentinel));
    assert.ok(!serialized.includes(sentinel.slice(0, 12)));
  });

  test('unlock while uninitialized throws', async (t) => {
    await freshApp(t);
    await assert.rejects(() => app.unlock(PASSPHRASE), /unlock/);
  });

  test('unlock while already unlocked throws', async (t) => {
    await freshAndUnlocked(t);
    await assert.rejects(() => app.unlock(PASSPHRASE), /unlock/);
  });
});

// ---------------------------------------------------------------------------
// lock
// ---------------------------------------------------------------------------

describe('lock', () => {
  test('lock from unlocked transitions to locked', async (t) => {
    await freshAndUnlocked(t);
    const result = await app.lock();
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'locked');
  });

  test('after lock, master key is null (createEntry throws)', async (t) => {
    await freshAndUnlocked(t);
    await app.lock();
    await assert.rejects(() => app.createEntry({ msg: 'x' }), /createEntry/);
  });

  test('lock from locked throws', async (t) => {
    await freshAndLocked(t);
    await assert.rejects(() => app.lock(), /lock/);
  });
});

// ---------------------------------------------------------------------------
// wipe
// ---------------------------------------------------------------------------

describe('wipe', () => {
  test('wipe transitions unlocked to uninitialized', async (t) => {
    await freshAndUnlocked(t);
    const result = await app.wipe();
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'uninitialized');
  });

  test('after wipe, all entries are gone', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ a: 1 });
    await app.createEntry({ a: 2 });
    await app.wipe();
    await app.initialize(PASSPHRASE);
    const list = await app.listEntries();
    assert.equal(list.length, 0);
  });

  test('after wipe, master key is null (initialize must be called again)', async (t) => {
    await freshAndUnlocked(t);
    await app.wipe();
    await assert.rejects(() => app.createEntry({ msg: 'x' }), /createEntry/);
  });

  test('after wipe, can re-initialize with a different passphrase', async (t) => {
    await freshAndUnlocked(t);
    await app.wipe();
    const result = await app.initialize(NEW_PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('wipe from unbooted throws', async (t) => {
    app._resetForTesting();
    t.after(() => app._resetForTesting());
    await assert.rejects(() => app.wipe(), /wipe/);
  });
});

// ---------------------------------------------------------------------------
// changePassphrase
// ---------------------------------------------------------------------------

describe('changePassphrase', () => {
  test('successful change keeps status unlocked', async (t) => {
    await freshAndUnlocked(t);
    const result = await app.changePassphrase(PASSPHRASE, NEW_PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('after change, old passphrase fails on subsequent unlock', async (t) => {
    await freshAndUnlocked(t);
    await app.changePassphrase(PASSPHRASE, NEW_PASSPHRASE);
    await app.lock();
    const result = await app.unlock(PASSPHRASE);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'incorrect_passphrase');
  });

  test('after change, new passphrase succeeds on subsequent unlock', async (t) => {
    await freshAndUnlocked(t);
    await app.changePassphrase(PASSPHRASE, NEW_PASSPHRASE);
    await app.lock();
    const result = await app.unlock(NEW_PASSPHRASE);
    assert.equal(result.ok, true);
  });

  test('wrong old passphrase returns ok:false, status unchanged, data unchanged', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'data' });
    const result = await app.changePassphrase('wronghorsebatterystaple', NEW_PASSPHRASE);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'incorrect_passphrase');
    assert.equal((await app.getStatus()).status, 'unlocked');
    // original passphrase still works after lock
    await app.lock();
    assert.equal((await app.unlock(PASSPHRASE)).ok, true);
  });

  test('weak new passphrase returns ok:false, old still works', async (t) => {
    await freshAndUnlocked(t);
    const result = await app.changePassphrase(PASSPHRASE, 'short');
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.feedback));
    await app.lock();
    assert.equal((await app.unlock(PASSPHRASE)).ok, true);
  });
});

// ---------------------------------------------------------------------------
// Entry CRUD
// ---------------------------------------------------------------------------

describe('entry CRUD', () => {
  test('createEntry returns id, uuid, entry_hash', async (t) => {
    await freshAndUnlocked(t);
    const r = await app.createEntry({ msg: 'first' });
    assert.equal(r.ok, true);
    assert.equal(typeof r.id, 'number');
    assert.match(r.uuid, /^[0-9a-f-]{36}$/);
    assert.match(r.entry_hash, /^[0-9a-f]{64}$/);
  });

  test('getEntry round-trips payload', async (t) => {
    await freshAndUnlocked(t);
    const payload = { kind: 'note', text: 'hello world', tags: ['a', 'b'], n: 7 };
    const { id } = await app.createEntry(payload);
    const got = await app.getEntry(id);
    assert.deepEqual(got.payload, payload);
    assert.equal(got.id, id);
    assert.equal(got.encrypted_payload, undefined);
  });

  test('getEntry on nonexistent id returns null', async (t) => {
    await freshAndUnlocked(t);
    assert.equal(await app.getEntry(99999), null);
  });

  test('getEntryByUuid round-trips', async (t) => {
    await freshAndUnlocked(t);
    const payload = { msg: 'lookup-test' };
    const { uuid } = await app.createEntry(payload);
    const got = await app.getEntryByUuid(uuid);
    assert.deepEqual(got.payload, payload);
    assert.equal(got.uuid, uuid);
  });

  test('listEntries returns chronological order', async (t) => {
    await freshAndUnlocked(t);
    for (let i = 0; i < 4; i++) {
      await app.createEntry({ i });
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await app.listEntries();
    assert.equal(list.length, 4);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].created_at >= list[i - 1].created_at);
    }
  });

  test('listEntries with limit respects limit', async (t) => {
    await freshAndUnlocked(t);
    for (let i = 0; i < 5; i++) {
      await app.createEntry({ i });
      await new Promise((r) => setTimeout(r, 2));
    }
    const limited = await app.listEntries({ limit: 2 });
    assert.equal(limited.length, 2);
  });

  test('countEntries works in locked state (no decryption needed)', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ a: 1 });
    await app.createEntry({ a: 2 });
    await app.lock();
    assert.equal(await app.countEntries(), 2);
  });

  test('createEntry throws when locked', async (t) => {
    await freshAndLocked(t);
    await assert.rejects(() => app.createEntry({ msg: 'x' }), /createEntry/);
  });
});

// ---------------------------------------------------------------------------
// Supersede
// ---------------------------------------------------------------------------

describe('supersede', () => {
  test('createEntry with supersedes pointing to valid uuid succeeds', async (t) => {
    await freshAndUnlocked(t);
    const original = await app.createEntry({ v: 1 });
    const replacement = await app.createEntry({ v: 2 }, { supersedes: original.uuid });
    assert.equal(replacement.ok, true);
    const persisted = await app.getEntry(replacement.id);
    assert.equal(persisted.supersedes, original.uuid);
  });

  test('createEntry with supersedes pointing to nonexistent uuid throws', async (t) => {
    await freshAndUnlocked(t);
    await assert.rejects(
      () => app.createEntry({ v: 1 }, { supersedes: 'nonexistent-uuid' }),
      /supersedes/
    );
  });
});

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

describe('verifyIntegrity', () => {
  test('fresh chain returns valid', async (t) => {
    await freshAndUnlocked(t);
    assert.deepEqual(await app.verifyIntegrity(), { valid: true, count: 0 });
  });

  test('after 3+ entries returns valid', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ a: 1 });
    await app.createEntry({ a: 2 });
    await app.createEntry({ a: 3 });
    await app.createEntry({ a: 4 });
    assert.deepEqual(await app.verifyIntegrity(), { valid: true, count: 4 });
  });

  test('throws when locked', async (t) => {
    await freshAndLocked(t);
    await assert.rejects(() => app.verifyIntegrity(), /verifyIntegrity/);
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

describe('export / import', () => {
  test('exportBackup returns a self-consistent object with required fields', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'one' });
    await app.createEntry({ msg: 'two' });
    const backup = await app.exportBackup();
    assert.equal(backup.format, 'plivex-export');
    assert.equal(backup.format_version, 1);
    assert.equal(typeof backup.salt, 'string');
    assert.equal(typeof backup.wrapped_master_key.iv, 'string');
    assert.equal(typeof backup.wrapped_master_key.ciphertext, 'string');
    assert.equal(backup.entries.length, 2);
    assert.match(backup.export_hash, /^[0-9a-f]{64}$/);
  });

  test('export → wipe → import round-trips entries and master key', async (t) => {
    const dbName = await freshAndUnlocked(t);
    await app.createEntry({ msg: 'first' });
    await app.createEntry({ msg: 'second' });
    const backup = await app.exportBackup();
    await app.lock();
    await app.wipe();
    const importResult = await app.importBackup(backup);
    assert.equal(importResult.ok, true);
    assert.equal(importResult.count, 2);
    assert.equal((await app.getStatus()).status, 'locked');
    const unlockResult = await app.unlock(PASSPHRASE);
    assert.equal(unlockResult.ok, true);
    const list = await app.listEntries();
    assert.equal(list.length, 2);
    assert.deepEqual(list[0].payload, { msg: 'first' });
    assert.deepEqual(list[1].payload, { msg: 'second' });
  });

  test('import rejects backup with tampered export_hash', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'x' });
    const backup = await app.exportBackup();
    backup.export_hash = '0'.repeat(64);
    await app.lock();
    await app.wipe();
    const result = await app.importBackup(backup);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'hash_mismatch');
  });

  test('import rejects backup with tampered entry payload', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'x' });
    const backup = await app.exportBackup();
    // Flip a bit in the first entry's ciphertext base64; export_hash will mismatch.
    const ct = backup.entries[0].encrypted_payload.ciphertext;
    backup.entries[0].encrypted_payload.ciphertext =
      ct.slice(0, -2) + (ct.endsWith('A=') ? 'B=' : 'A=');
    await app.lock();
    await app.wipe();
    const result = await app.importBackup(backup);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'hash_mismatch');
  });

  test('import rejects malformed backup', async (t) => {
    await freshAndUnlocked(t);
    await app.lock();
    await app.wipe();
    const result = await app.importBackup({ not: 'a backup' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'malformed');
  });
});

describe('getStatus', () => {
  test('returns just status for unbooted', async () => {
    app._resetForTesting();
    assert.deepEqual(await app.getStatus(), { status: 'unbooted' });
  });

  test('returns just status for uninitialized', async (t) => {
    await freshApp(t);
    assert.deepEqual(await app.getStatus(), { status: 'uninitialized' });
  });

  test('returns status + entryCount for locked and unlocked', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ a: 1 });
    const unlockedStatus = await app.getStatus();
    assert.equal(unlockedStatus.status, 'unlocked');
    assert.equal(unlockedStatus.entryCount, 1);
    await app.lock();
    const lockedStatus = await app.getStatus();
    assert.equal(lockedStatus.status, 'locked');
    assert.equal(lockedStatus.entryCount, 1);
  });
});
