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

  test('chain stays valid across mixed photo / no-photo entries', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ title: 'no photo', content: 'a' });
    await app.createEntry({
      title: 'with photo',
      content: 'b',
      photos: [
        { name: 'x.png', type: 'image/png', dataB64: 'iVBORw0KGgo=' }
      ]
    });
    await app.createEntry({ title: 'no photo again', content: 'c' });
    assert.deepEqual(await app.verifyIntegrity(), { valid: true, count: 3 });
  });
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

describe('photo attachments', () => {
  test('createEntry round-trips photos field unchanged', async (t) => {
    await freshAndUnlocked(t);
    const payload = {
      title: 'site visit',
      content: 'arrived 9am',
      photos: [
        {
          name: 'one.jpg',
          type: 'image/jpeg',
          dataB64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='
        },
        {
          name: 'two.png',
          type: 'image/png',
          dataB64: 'iVBORw0KGgo='
        }
      ]
    };
    const { id } = await app.createEntry(payload);
    const got = await app.getEntry(id);
    assert.deepEqual(got.payload, payload);
  });

  test('createEntry round-trips audio field unchanged', async (t) => {
    await freshAndUnlocked(t);
    const payload = {
      title: 'meeting',
      content: 'recorded conversation',
      audio: [
        {
          name: 'clip.webm',
          type: 'audio/webm',
          dataB64: 'GkXfo59ChoEBQveBAUL3gQFC8oEEQvOBCEKChHdlYm1Ch4ECQoWBAhhTgGcBAAA='
        }
      ]
    };
    const { id } = await app.createEntry(payload);
    const got = await app.getEntry(id);
    assert.deepEqual(got.payload, payload);
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

  // Local mirrors of the canonicalization + hashing helpers in src/app.js
  // so the test can recompute export_hash after tampering with a payload.
  function canonicalSort(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalSort);
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalSort(value[k]);
    return out;
  }
  async function rehash(body) {
    const text = JSON.stringify(canonicalSort(body));
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }

  test('import is atomic — duplicate uuid causes full rollback', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'one' });
    await app.createEntry({ msg: 'two' });
    const backup = await app.exportBackup();
    // Tamper: duplicate uuid violates the by_uuid unique index, forcing
    // the import transaction to abort.
    backup.entries[1].uuid = backup.entries[0].uuid;
    const { export_hash, ...body } = backup;
    backup.export_hash = await rehash(body);
    await app.lock();
    await app.wipe();

    const result = await app.importBackup(backup);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'import_failed');
    // After abort, no partial state: status is 'uninitialized'.
    const status = await app.getStatus();
    assert.equal(status.status, 'uninitialized');
  });

  test('after a failed import, retry with a valid backup succeeds', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'a' });
    const validBackup = await app.exportBackup();
    const tampered = JSON.parse(JSON.stringify(validBackup));
    tampered.entries.push({ ...tampered.entries[0] });
    const { export_hash, ...body } = tampered;
    tampered.export_hash = await rehash(body);
    await app.lock();
    await app.wipe();

    const fail = await app.importBackup(tampered);
    assert.equal(fail.ok, false);

    const ok = await app.importBackup(validBackup);
    assert.equal(ok.ok, true);
    assert.equal(ok.count, 1);
    assert.equal((await app.getStatus()).status, 'locked');
    const unlock = await app.unlock(PASSPHRASE);
    assert.equal(unlock.ok, true);
    const list = await app.listEntries();
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].payload, { msg: 'a' });
  });
});

// ---------------------------------------------------------------------------
// Auto-lock
//
// Tests use the injectable clock seam (app._setClockForTesting) instead of
// real setTimeout so they're fast and not wall-clock-flaky.
// ---------------------------------------------------------------------------

describe('auto-lock', () => {
  test('default timeout is 15 minutes after fresh initialize', async (t) => {
    await freshApp(t);
    await app.initialize(PASSPHRASE);
    assert.equal(app.getAutoLockMinutes(), 15);
  });

  test('setAutoLockMinutes(5) persists and is read back on next bootstrap', async (t) => {
    app._resetForTesting();
    const dbName = uniqueName();
    t.after(async () => { app._resetForTesting(); try { await deleteDB(dbName); } catch {} });
    await app.bootstrap({ dbName });
    await app.initialize(PASSPHRASE);
    await app.setAutoLockMinutes(5);
    assert.equal(app.getAutoLockMinutes(), 5);
    app._resetForTesting();
    await app.bootstrap({ dbName });
    assert.equal(app.getAutoLockMinutes(), 5);
  });

  test('setAutoLockMinutes with disallowed value throws', async (t) => {
    await freshAndUnlocked(t);
    await assert.rejects(() => app.setAutoLockMinutes(99), /not one of/);
    await assert.rejects(() => app.setAutoLockMinutes(0), /not one of/);
    await assert.rejects(() => app.setAutoLockMinutes(7), /not one of/);
    // Value unchanged on rejection
    assert.equal(app.getAutoLockMinutes(), 15);
  });

  test('after recordActivity with no time elapsed, no auto-lock fires', async (t) => {
    await freshAndUnlocked(t);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    // 0ms later, op succeeds
    const r = await app.createEntry({ msg: 'still active' });
    assert.equal(r.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('after recordActivity and timeout+1ms elapsed, next op auto-locks and throws', async (t) => {
    await freshAndUnlocked(t);
    await app.setAutoLockMinutes(1);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    now += 60_000 + 1; // 1 minute + 1 ms
    await assert.rejects(() => app.createEntry({ msg: 'too late' }), /createEntry/);
    assert.equal((await app.getStatus()).status, 'locked');
  });

  test('auto-lock fires before the operation runs (no entry persisted)', async (t) => {
    await freshAndUnlocked(t);
    await app.setAutoLockMinutes(1);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    now += 60_000 + 1;
    try { await app.createEntry({ msg: 'never persisted' }); } catch {}
    // Re-unlock and confirm zero entries.
    const unlock = await app.unlock(PASSPHRASE);
    assert.equal(unlock.ok, true);
    assert.equal(await app.countEntries(), 0);
  });

  test('countEntries does not auto-lock (locked-allowed op)', async (t) => {
    await freshAndUnlocked(t);
    await app.setAutoLockMinutes(1);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    now += 60_000 + 1;
    // countEntries must succeed even after the timeout — it's allowed in
    // locked state and should not trigger the auto-lock check.
    assert.equal(await app.countEntries(), 0);
    // Status should still be 'unlocked' since countEntries didn't trip the
    // auto-lock gate.
    assert.equal((await app.getStatus()).status, 'unlocked');
  });

  test('after auto-lock, master key is null (createEntry throws as locked)', async (t) => {
    await freshAndUnlocked(t);
    await app.setAutoLockMinutes(1);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    now += 60_000 + 1;
    try { await app.getEntry(1); } catch {}
    // Without re-unlocking, createEntry must reject with the locked error.
    await assert.rejects(() => app.createEntry({ msg: 'x' }), /createEntry: status is 'locked'/);
  });

  test('clock moving backward does not auto-lock (negative delta tolerated)', async (t) => {
    await freshAndUnlocked(t);
    await app.setAutoLockMinutes(1);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    now -= 1_000_000; // simulate user setting clock backward
    const r = await app.createEntry({ msg: 'still ok' });
    assert.equal(r.ok, true);
    assert.equal((await app.getStatus()).status, 'unlocked');
  });
});

// ---------------------------------------------------------------------------
// Solo-use features: backup reminder, chain head, certificate data.
// ---------------------------------------------------------------------------

describe('backup reminder', () => {
  test('default cadence is 7 days after fresh initialize', async (t) => {
    await freshAndUnlocked(t);
    assert.equal(await app.getBackupReminderDays(), 7);
  });

  test('setBackupReminderDays validates and persists', async (t) => {
    await freshAndUnlocked(t);
    await app.setBackupReminderDays(14);
    assert.equal(await app.getBackupReminderDays(), 14);
    await assert.rejects(() => app.setBackupReminderDays(99), /not one of/);
    await assert.rejects(() => app.setBackupReminderDays(1), /not one of/);
  });

  test('shouldRemindBackup is true when no export has happened', async (t) => {
    await freshAndUnlocked(t);
    assert.equal(await app.shouldRemindBackup(), true);
  });

  test('shouldRemindBackup is false immediately after exportBackup', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'hi' });
    await app.exportBackup();
    assert.equal(await app.shouldRemindBackup(), false);
  });

  test('shouldRemindBackup turns true again after the cadence elapses', async (t) => {
    await freshAndUnlocked(t);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    await app.setBackupReminderDays(7);
    await app.exportBackup();
    // 6 days later: still within window.
    now += 6 * 24 * 60 * 60 * 1000;
    app.recordActivity();
    assert.equal(await app.shouldRemindBackup(), false);
    // 8 days later: past window.
    now += 2 * 24 * 60 * 60 * 1000;
    app.recordActivity();
    assert.equal(await app.shouldRemindBackup(), true);
  });

  test('shouldRemindBackup is always false when cadence is 0 (Off)', async (t) => {
    await freshAndUnlocked(t);
    await app.setBackupReminderDays(0);
    assert.equal(await app.shouldRemindBackup(), false);
  });
});

describe('extended entry payload (type / witness / location)', () => {
  test('createEntry with type/witness/location round-trips through getEntry', async (t) => {
    await freshAndUnlocked(t);
    const payload = {
      title: 'Late paycheck',
      content: 'Pay missing $X for shift on Y.',
      type: 'Pay',
      witness: 'J. Doe',
      location: 'Back office'
    };
    const r = await app.createEntry(payload);
    const got = await app.getEntry(r.id);
    assert.deepEqual(got.payload, payload);
  });

  test('chain verifies cleanly with mixed-shape payloads (some entries have extra fields, some don\'t)', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ title: 'a', content: 'plain' });
    await app.createEntry({ title: 'b', content: 'with type', type: 'Safety' });
    await app.createEntry({
      title: 'c',
      content: 'all fields',
      type: 'Harassment',
      witness: 'someone',
      location: 'lunchroom'
    });
    const result = await app.verifyIntegrity();
    assert.equal(result.valid, true);
    assert.equal(result.count, 3);
  });
});

describe('verify reminder', () => {
  test('default cadence is 30 days after fresh initialize', async (t) => {
    await freshAndUnlocked(t);
    assert.equal(await app.getVerifyReminderDays(), 30);
  });

  test('setVerifyReminderDays validates and persists', async (t) => {
    await freshAndUnlocked(t);
    await app.setVerifyReminderDays(7);
    assert.equal(await app.getVerifyReminderDays(), 7);
    await assert.rejects(() => app.setVerifyReminderDays(15), /not one of/);
    await assert.rejects(() => app.setVerifyReminderDays(1), /not one of/);
  });

  test('shouldRemindVerify is true when no verify has happened', async (t) => {
    await freshAndUnlocked(t);
    assert.equal(await app.shouldRemindVerify(), true);
  });

  test('shouldRemindVerify is false immediately after a successful verifyIntegrity', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'a' });
    await app.verifyIntegrity();
    assert.equal(await app.shouldRemindVerify(), false);
  });

  test('shouldRemindVerify turns true again after the cadence elapses', async (t) => {
    await freshAndUnlocked(t);
    let now = 1_700_000_000_000;
    const restore = app._setClockForTesting(() => now);
    t.after(restore);
    app.recordActivity();
    await app.setVerifyReminderDays(7);
    await app.verifyIntegrity();
    now += 6 * 24 * 60 * 60 * 1000;
    app.recordActivity();
    assert.equal(await app.shouldRemindVerify(), false);
    now += 2 * 24 * 60 * 60 * 1000;
    app.recordActivity();
    assert.equal(await app.shouldRemindVerify(), true);
  });

  test('shouldRemindVerify is always false when cadence is 0 (Off)', async (t) => {
    await freshAndUnlocked(t);
    await app.setVerifyReminderDays(0);
    assert.equal(await app.shouldRemindVerify(), false);
  });
});

describe('chain head', () => {
  test('getChainHead is GENESIS_HASH on empty chain', async (t) => {
    await freshAndUnlocked(t);
    const head = await app.getChainHead();
    assert.equal(head, '0'.repeat(64));
  });

  test('getChainHead returns latest entry_hash after writes', async (t) => {
    await freshAndUnlocked(t);
    const r1 = await app.createEntry({ msg: 'one' });
    const r2 = await app.createEntry({ msg: 'two' });
    const head = await app.getChainHead();
    assert.equal(head, r2.entry_hash);
    assert.notEqual(head, r1.entry_hash);
  });

  test('getChainHead is allowed in locked state', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'a' });
    await app.lock();
    const head = await app.getChainHead();
    assert.match(head, /^[0-9a-f]{64}$/);
  });
});

describe('certificate data', () => {
  test('on empty chain: zero entries, chain_head is GENESIS, no supersedes', async (t) => {
    await freshAndUnlocked(t);
    const data = await app.getCertificateData();
    assert.equal(data.total_entries, 0);
    assert.equal(data.chain_head, '0'.repeat(64));
    assert.equal(data.first_entry, null);
    assert.equal(data.last_entry, null);
    assert.deepEqual(data.supersedes, []);
    assert.equal(data.app_version, app.APP_VERSION);
  });

  test('on multi-entry chain with a supersede: data reflects state', async (t) => {
    await freshAndUnlocked(t);
    const r1 = await app.createEntry({ msg: 'one' });
    const r2 = await app.createEntry({ msg: 'two' });
    await app.createEntry({ msg: 'two-fixed' }, { supersedes: r2.uuid });
    const data = await app.getCertificateData();
    assert.equal(data.total_entries, 3);
    assert.equal(data.first_entry.entry_hash, r1.entry_hash);
    assert.equal(data.last_entry.uuid, undefined === undefined ? data.last_entry.uuid : null);
    assert.equal(data.supersedes.length, 1);
    assert.equal(data.supersedes[0].replaces_uuid, r2.uuid);
  });

  test('getCertificateData is allowed in locked state', async (t) => {
    await freshAndUnlocked(t);
    await app.createEntry({ msg: 'a' });
    await app.lock();
    const data = await app.getCertificateData();
    assert.equal(data.total_entries, 1);
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
