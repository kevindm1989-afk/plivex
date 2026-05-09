import 'fake-indexeddb/auto';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deleteDB } from '../vendor/idb.js';
import {
  openDB,
  initializeDatabase,
  putEntry,
  getEntry,
  STORE_ENTRIES
} from '../src/storage.js';
import { encrypt } from '../src/crypto.js';
import {
  computeHash,
  appendEntry,
  verifyChain,
  GENESIS_HASH,
  HASH_HEX_LENGTH
} from '../src/chain.js';

let counter = 0;
const freshName = () => `plivex-chain-${process.pid}-${Date.now()}-${++counter}`;

async function setup(t) {
  const name = freshName();
  const db = await openDB(name);
  const masterKey = await initializeDatabase(db, 'correcthorsebatterystaple');
  t.after(async () => {
    try { db.close(); } catch {}
    try { await deleteDB(name); } catch {}
  });
  return { name, db, masterKey };
}

async function writeEntry(db, masterKey, entry) {
  const encrypted_payload = await encrypt(masterKey, JSON.stringify(entry.payload));
  const stored = {
    uuid: entry.uuid,
    created_at: entry.created_at,
    prev_hash: entry.prev_hash,
    entry_hash: entry.entry_hash,
    encrypted_payload
  };
  if (entry.supersedes !== undefined) stored.supersedes = entry.supersedes;
  const id = await putEntry(db, stored);
  return { id, ...stored };
}

async function buildChain(db, masterKey, payloads) {
  const stored = [];
  for (const payload of payloads) {
    const entry = await appendEntry(db, payload);
    stored.push(await writeEntry(db, masterKey, entry));
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Canonical JSON
//
// canonicalJson is not exported, but we exercise it transparently through
// computeHash — non-canonical payloads must surface as thrown errors there.
// We also assert determinism via two computeHash calls with structurally
// equivalent inputs in different construction orders.
// ---------------------------------------------------------------------------

const fixedEntry = (payload, overrides = {}) => ({
  uuid: 'fixed-uuid',
  created_at: '2026-01-01T00:00:00.000Z',
  payload,
  ...overrides
});

describe('canonical JSON (via computeHash)', () => {
  test('sorts top-level object keys', async () => {
    const a = await computeHash(GENESIS_HASH, fixedEntry({ a: 1, b: 2, c: 3 }));
    const b = await computeHash(GENESIS_HASH, fixedEntry({ c: 3, b: 2, a: 1 }));
    assert.equal(a, b);
  });

  test('sorts nested object keys', async () => {
    const a = await computeHash(GENESIS_HASH, fixedEntry({ outer: { x: 1, y: 2, z: 3 } }));
    const b = await computeHash(GENESIS_HASH, fixedEntry({ outer: { z: 3, y: 2, x: 1 } }));
    assert.equal(a, b);
  });

  test('preserves array order (does NOT sort arrays)', async () => {
    const a = await computeHash(GENESIS_HASH, fixedEntry([3, 1, 2]));
    const b = await computeHash(GENESIS_HASH, fixedEntry([1, 2, 3]));
    assert.notEqual(a, b);
  });

  test('throws on undefined value (top-level and nested)', async () => {
    await assert.rejects(
      () => computeHash(GENESIS_HASH, fixedEntry(undefined)),
      /undefined is not allowed/
    );
    await assert.rejects(
      () => computeHash(GENESIS_HASH, fixedEntry({ a: undefined })),
      /undefined is not allowed/
    );
  });

  test('throws on NaN, Infinity, -Infinity', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await assert.rejects(
        () => computeHash(GENESIS_HASH, fixedEntry({ n: bad })),
        /not a safe integer/
      );
    }
  });

  test('throws on non-integer numbers (3.14) and on -0', async () => {
    await assert.rejects(
      () => computeHash(GENESIS_HASH, fixedEntry({ n: 3.14 })),
      /not a safe integer/
    );
    await assert.rejects(
      () => computeHash(GENESIS_HASH, fixedEntry({ n: -0 })),
      /-0 is not allowed/
    );
  });

  test('throws on bigint, symbol, function, date, regexp', async () => {
    for (const bad of [1n, Symbol('s'), () => 1, new Date(), /re/]) {
      await assert.rejects(
        () => computeHash(GENESIS_HASH, fixedEntry({ x: bad }))
      );
    }
  });

  test('identical objects produce identical hashes regardless of construction order', async () => {
    const e1 = fixedEntry({ a: 1, b: { x: 1, y: 2 }, c: [1, 2] });
    const e2 = fixedEntry({ c: [1, 2], b: { y: 2, x: 1 }, a: 1 });
    assert.equal(
      await computeHash(GENESIS_HASH, e1),
      await computeHash(GENESIS_HASH, e2)
    );
  });
});

// ---------------------------------------------------------------------------
// computeHash
// ---------------------------------------------------------------------------

describe('computeHash', () => {
  test('pure function: same input → same output', async () => {
    const e = fixedEntry({ msg: 'hi' });
    const a = await computeHash(GENESIS_HASH, e);
    const b = await computeHash(GENESIS_HASH, e);
    assert.equal(a, b);
    assert.equal(a.length, HASH_HEX_LENGTH);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('different prev_hash → different entry_hash', async () => {
    const e = fixedEntry({ msg: 'hi' });
    const other = 'a'.repeat(64);
    assert.notEqual(
      await computeHash(GENESIS_HASH, e),
      await computeHash(other, e)
    );
  });

  test('different uuid → different entry_hash', async () => {
    const a = await computeHash(GENESIS_HASH, fixedEntry({ msg: 'hi' }, { uuid: 'A' }));
    const b = await computeHash(GENESIS_HASH, fixedEntry({ msg: 'hi' }, { uuid: 'B' }));
    assert.notEqual(a, b);
  });

  test('different created_at → different entry_hash', async () => {
    const base = fixedEntry({ msg: 'hi' });
    const a = await computeHash(GENESIS_HASH, base);
    const b = await computeHash(GENESIS_HASH, { ...base, created_at: '2026-01-02T00:00:00.000Z' });
    assert.notEqual(a, b);
  });

  test('different payload → different entry_hash', async () => {
    const a = await computeHash(GENESIS_HASH, fixedEntry({ msg: 'hi' }));
    const b = await computeHash(GENESIS_HASH, fixedEntry({ msg: 'bye' }));
    assert.notEqual(a, b);
  });

  test('supersedes presence and value both affect entry_hash', async () => {
    const base = fixedEntry({ msg: 'hi' });
    const noSup = await computeHash(GENESIS_HASH, base);
    const supA = await computeHash(GENESIS_HASH, { ...base, supersedes: 'A' });
    const supB = await computeHash(GENESIS_HASH, { ...base, supersedes: 'B' });
    assert.notEqual(noSup, supA);
    assert.notEqual(supA, supB);
  });

  test('rejects malformed prevHash', async () => {
    await assert.rejects(() => computeHash('not-hex', fixedEntry({})), /64 lowercase hex/);
    await assert.rejects(() => computeHash('A'.repeat(64), fixedEntry({})), /64 lowercase hex/);
    await assert.rejects(() => computeHash('0'.repeat(63), fixedEntry({})), /64 lowercase hex/);
  });
});

// ---------------------------------------------------------------------------
// appendEntry
// ---------------------------------------------------------------------------

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('appendEntry', () => {
  test("first entry's prev_hash is GENESIS_HASH", async (t) => {
    const { db } = await setup(t);
    const e = await appendEntry(db, { msg: 'first' });
    assert.equal(e.prev_hash, GENESIS_HASH);
    assert.equal(e.entry_hash.length, HASH_HEX_LENGTH);
  });

  test("second entry's prev_hash equals first entry's entry_hash", async (t) => {
    const { db, masterKey } = await setup(t);
    const e1 = await appendEntry(db, { msg: 'one' });
    await writeEntry(db, masterKey, e1);
    const e2 = await appendEntry(db, { msg: 'two' });
    assert.equal(e2.prev_hash, e1.entry_hash);
  });

  test('generates valid UUID v4', async (t) => {
    const { db } = await setup(t);
    const e = await appendEntry(db, { msg: 'x' });
    assert.match(e.uuid, UUID_V4_RE);
  });

  test('throws if supersedes uuid does not exist in storage', async (t) => {
    const { db } = await setup(t);
    await assert.rejects(
      () => appendEntry(db, { msg: 'x' }, { supersedes: 'no-such-uuid' }),
      /supersedes uuid not found/
    );
  });
});

// ---------------------------------------------------------------------------
// verifyChain — valid cases
// ---------------------------------------------------------------------------

describe('verifyChain — valid', () => {
  test('empty chain returns valid with count 0', async (t) => {
    const { db, masterKey } = await setup(t);
    assert.deepEqual(await verifyChain(db, masterKey), { valid: true, count: 0 });
  });

  test('single entry chain is valid', async (t) => {
    const { db, masterKey } = await setup(t);
    await buildChain(db, masterKey, [{ msg: 'only' }]);
    assert.deepEqual(await verifyChain(db, masterKey), { valid: true, count: 1 });
  });

  test('multi-entry chain (3+) is valid', async (t) => {
    const { db, masterKey } = await setup(t);
    await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
    assert.deepEqual(await verifyChain(db, masterKey), { valid: true, count: 4 });
  });
});

// ---------------------------------------------------------------------------
// verifyChain — tamper detection
//
// For each scenario we build a clean 3-entry chain, mutate one stored
// record at id=2, run verify, and check the break point + reason.
// ---------------------------------------------------------------------------

async function tamper(db, id, mutate) {
  const e = await getEntry(db, id);
  mutate(e);
  await db.put(STORE_ENTRIES, e);
}

describe('verifyChain — tamper detection', () => {
  test('tampered payload (re-encrypt different plaintext)', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    const replaced = await encrypt(masterKey, JSON.stringify({ a: 999 }));
    await tamper(db, chain[1].id, (e) => { e.encrypted_payload = replaced; });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'entry_hash_mismatch');
  });

  test('tampered uuid', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await tamper(db, chain[1].id, (e) => { e.uuid = 'tampered-uuid-xxxx'; });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'entry_hash_mismatch');
  });

  test('tampered created_at', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await tamper(db, chain[1].id, (e) => { e.created_at = '2099-12-31T23:59:59.999Z'; });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'entry_hash_mismatch');
  });

  test('tampered supersedes (added)', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await tamper(db, chain[1].id, (e) => { e.supersedes = 'injected-uuid'; });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'entry_hash_mismatch');
  });

  test('tampered prev_hash', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await tamper(db, chain[1].id, (e) => { e.prev_hash = 'f'.repeat(64); });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'prev_hash_mismatch');
  });

  test('tampered entry_hash', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await tamper(db, chain[1].id, (e) => { e.entry_hash = 'a'.repeat(64); });
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'entry_hash_mismatch');
  });

  test('entry deleted from middle', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    await db.delete(STORE_ENTRIES, chain[1].id);
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[2].id);
    assert.equal(r.reason, 'prev_hash_mismatch');
  });

  test('two entries swapped (id=2 and id=3 contents exchanged)', async (t) => {
    const { db, masterKey } = await setup(t);
    const chain = await buildChain(db, masterKey, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    const e2 = await getEntry(db, chain[1].id);
    const e3 = await getEntry(db, chain[2].id);
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    await tx.store.delete(chain[1].id);
    await tx.store.delete(chain[2].id);
    await tx.store.put({ ...e3, id: chain[1].id });
    await tx.store.put({ ...e2, id: chain[2].id });
    await tx.done;
    const r = await verifyChain(db, masterKey);
    assert.equal(r.valid, false);
    assert.equal(r.breakAt, chain[1].id);
    assert.equal(r.reason, 'prev_hash_mismatch');
  });
});

// ---------------------------------------------------------------------------
// Determinism
//
// Pinned test vector. Independently computed via Node's `crypto.createHash`
// against the canonical bytes we expect to produce. If the assertion at the
// bottom of this test ever fails after a refactor, the hash function or the
// canonicalization rules changed — review carefully before updating the
// pinned literal.
//
// Inputs:
//   prevHash     = '0'.repeat(64)        (genesis)
//   entry.uuid   = 'fixed-uuid-1'
//   entry.created_at = '2026-01-01T00:00:00.000Z'
//   entry.payload    = { hello: 'world' }
//
// Canonical JSON of {uuid, created_at, payload}:
//   {"created_at":"2026-01-01T00:00:00.000Z","payload":{"hello":"world"},"uuid":"fixed-uuid-1"}
//
// Hash input = 32 zero bytes || UTF-8 of canonical JSON
// SHA-256(hash input) = pinned literal below.
// ---------------------------------------------------------------------------

describe('determinism', () => {
  test('known input produces a fixed, reference-verified hash', async () => {
    const entry = {
      uuid: 'fixed-uuid-1',
      created_at: '2026-01-01T00:00:00.000Z',
      payload: { hello: 'world' }
    };
    const canonical = '{"created_at":"2026-01-01T00:00:00.000Z","payload":{"hello":"world"},"uuid":"fixed-uuid-1"}';
    const ref = createHash('sha256')
      .update(Buffer.concat([Buffer.alloc(32, 0), Buffer.from(canonical, 'utf-8')]))
      .digest('hex');

    const result = await computeHash(GENESIS_HASH, entry);
    assert.equal(result, ref);
    assert.equal(result, 'a0ae9e1afdc86a8612932552cabb5e005cbdb8b3f6ba26d10935c22841b3bebe');
  });
});
