// Smoke tests for the entry-list screen. These exist because v1.12.0
// shipped a temporal-dead-zone ReferenceError in entry-list.js that
// left the page un-renderable for everyone, and the 183 logic tests at
// the time were all on crypto/storage/chain/orchestration — no UI was
// exercised, so the bug slipped through four release PRs (#23, #24,
// #25, #26 was the hotfix). These tests instantiate the render path
// and check that the DOM actually populates.
//
// They are smoke tests, not exhaustive UI tests: they verify the
// render function (a) completes without throwing, and (b) produces
// the expected key markers (compose button, expected entry titles,
// etc.) in the resulting tree.

import 'fake-indexeddb/auto';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDB } from '../vendor/idb.js';
import * as app from '../src/app.js';
import { installDom, stubController, makeRoot } from './_dom.js';

const PASSPHRASE = 'correcthorsebatterystaple';

let counter = 0;
const uniqueName = () => `plivex-ui-list-${process.pid}-${Date.now()}-${++counter}`;

async function freshAndUnlocked(t) {
  app._resetForTesting();
  const dbName = uniqueName();
  await app.bootstrap({ dbName });
  await app.initialize(PASSPHRASE);
  t.after(async () => {
    app._resetForTesting();
    try { await deleteDB(dbName); } catch {}
  });
  return dbName;
}

async function setup(t) {
  const restore = installDom();
  t.after(restore);
  await freshAndUnlocked(t);
  return { root: makeRoot(), controller: stubController() };
}

describe('entry-list render', () => {
  test('renders without throwing on an empty database', async (t) => {
    const { root, controller } = await setup(t);
    const { render } = await import('../src/ui/screens/entry-list.js');
    await render(root, controller);
    const text = root.textContent;
    assert.ok(text.includes('Plivex'), 'topbar title present');
    assert.ok(text.includes('No entries yet'), 'empty-state message present');
  });

  test('renders one entry', async (t) => {
    const { root, controller } = await setup(t);
    await app.createEntry({ title: 'First note', content: 'hello' });
    const { render } = await import('../src/ui/screens/entry-list.js');
    await render(root, controller);
    const text = root.textContent;
    assert.ok(text.includes('First note'), 'entry title rendered');
    assert.ok(text.includes('New entry'), 'compose button rendered');
    assert.ok(text.includes('Quick add'), 'quick-add row rendered');
  });

  test('renders an overdue follow-up banner without throwing — regression for v1.14.1', async (t) => {
    const { root, controller } = await setup(t);
    // followUpDate well in the past triggers the "needs follow-up" banner.
    // In v1.14.0 and earlier, the banner check referenced followUpDueCount
    // before its `let` declaration further down the function, throwing
    // a TDZ ReferenceError that aborted the entire render.
    await app.createEntry({
      title: 'Old todo',
      content: 'still pending',
      followUpDate: '2020-01-01'
    });
    const { render } = await import('../src/ui/screens/entry-list.js');
    await render(root, controller);
    const text = root.textContent;
    assert.ok(text.includes('Old todo'), 'entry rendered');
    assert.ok(text.includes('need follow-up'), 'follow-up banner rendered');
    assert.ok(text.includes('New entry'), 'compose button still rendered (TDZ bug would have aborted here)');
  });

  test('renders multiple entries grouped by month', async (t) => {
    const { root, controller } = await setup(t);
    await app.createEntry({ title: 'one', content: 'a' });
    await app.createEntry({ title: 'two', content: 'b' });
    await app.createEntry({ title: 'three', content: 'c' });
    const { render } = await import('../src/ui/screens/entry-list.js');
    await render(root, controller);
    const text = root.textContent;
    for (const t of ['one', 'two', 'three']) {
      assert.ok(text.includes(t), `entry "${t}" rendered`);
    }
    // At least one month header should be present.
    assert.match(text, /\b\d{4}\b/, 'a year appears in a month header');
  });

  test('quick-add chip navigates to entry-form with the template id', async (t) => {
    const { root, controller } = await setup(t);
    const { render } = await import('../src/ui/screens/entry-list.js');
    await render(root, controller);
    const chips = root.querySelectorAll('.quick-add-chip');
    assert.ok(chips.length >= 8, 'at least 8 quick-add chips');
    chips[0].click();
    const nav = controller.calls.find((c) => c.kind === 'navigate');
    assert.equal(nav.screen, 'entry-form');
    assert.equal(nav.params.mode, 'new');
    assert.ok(typeof nav.params.template === 'string', 'template id passed');
  });
});
