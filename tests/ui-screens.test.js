// Smoke tests for the remaining UI screens. Same model as
// ui-entry-list.test.js: instantiate the render path against a real
// DOM, assert the output isn't empty and contains expected markers.
//
// These exist to surface render-order / TDZ / null-deref bugs of the
// kind that v1.14.1 fixed in entry-list.js. They are not exhaustive
// UI tests.

import 'fake-indexeddb/auto';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDB } from '../vendor/idb.js';
import * as app from '../src/app.js';
import { installDom, stubController, makeRoot } from './_dom.js';

const PASSPHRASE = 'correcthorsebatterystaple';
let counter = 0;
const uniqueName = () => `plivex-ui-screens-${process.pid}-${Date.now()}-${++counter}`;

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

async function setupUnlocked(t) {
  const restore = installDom();
  t.after(restore);
  await freshAndUnlocked(t);
  return { root: makeRoot(), controller: stubController() };
}

async function setupUninitialized(t) {
  const restore = installDom();
  t.after(restore);
  app._resetForTesting();
  const dbName = uniqueName();
  await app.bootstrap({ dbName });
  t.after(async () => {
    app._resetForTesting();
    try { await deleteDB(dbName); } catch {}
  });
  return { root: makeRoot(), controller: stubController() };
}

async function setupLocked(t) {
  const restore = installDom();
  t.after(restore);
  app._resetForTesting();
  const dbName = uniqueName();
  await app.bootstrap({ dbName });
  await app.initialize(PASSPHRASE);
  await app.lock();
  t.after(async () => {
    app._resetForTesting();
    try { await deleteDB(dbName); } catch {}
  });
  return { root: makeRoot(), controller: stubController() };
}

describe('setup screen', () => {
  test('renders the setup form', async (t) => {
    const { root, controller } = await setupUninitialized(t);
    const { render } = await import('../src/ui/screens/setup.js');
    render(root, controller);
    assert.ok(root.querySelector('input[type="password"]'), 'passphrase input present');
    assert.ok(root.textContent.length > 0);
  });
});

describe('lock screen', () => {
  test('renders the unlock form and recovery details', async (t) => {
    const { root, controller } = await setupLocked(t);
    const { render } = await import('../src/ui/screens/lock.js');
    render(root, controller);
    assert.ok(root.querySelector('input[type="password"]'), 'passphrase input present');
    assert.ok(root.textContent.includes('I forgot my passphrase'), 'wipe path present');
    assert.ok(root.textContent.includes('How recovery works'), 'recovery details collapsible');
  });
});

describe('entry-form screen', () => {
  test('renders a blank new-entry form', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/entry-form.js');
    await render(root, controller, { mode: 'new' });
    assert.ok(root.textContent.includes('New entry'));
    assert.ok(root.querySelector('input'), 'at least one input rendered');
    assert.ok(root.querySelector('textarea'), 'content textarea rendered');
  });

  test('renders new-entry form pre-filled from a template', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/entry-form.js');
    await render(root, controller, { mode: 'new', template: 'incident' });
    const titleInput = root.querySelectorAll('input')[0];
    assert.ok(titleInput.value.startsWith('Incident: '), 'title prefix applied');
  });

  test('renders new-entry form pre-filled from a Web Share Target payload', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/entry-form.js');
    await render(root, controller, {
      mode: 'new',
      shared: {
        title: 'shared from elsewhere',
        content: 'http://example.com',
        photos: [{ name: 'a.png', type: 'image/png', dataB64: 'iVBORw0KGgo=' }],
        audio: [],
        files: [{ name: 'doc.pdf', type: 'application/pdf', dataB64: 'JVBERi0xLjQK' }]
      }
    });
    const inputs = Array.from(root.querySelectorAll('input'));
    const titleInput = inputs.find((i) => i.value === 'shared from elsewhere');
    assert.ok(titleInput, 'title prefilled from share');
    const textarea = root.querySelector('textarea');
    assert.ok(textarea && textarea.value.includes('http://example.com'), 'content prefilled from share');
    // Photo + file thumbnails rendered inside the form via render hooks
    assert.ok(root.querySelector('.photos-grid'), 'photo grid present');
    assert.ok(root.querySelector('.files-list'), 'files list present');
  });

  test('renders edit-entry form with original payload', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const created = await app.createEntry({ title: 'orig', content: 'body' });
    const { render } = await import('../src/ui/screens/entry-form.js');
    await render(root, controller, { mode: 'edit', id: created.id });
    assert.ok(root.textContent.includes('Edit entry'));
    const inputs = root.querySelectorAll('input');
    const titleInput = Array.from(inputs).find((i) => i.value === 'orig');
    assert.ok(titleInput, 'original title pre-populated');
  });
});

describe('entry-detail screen', () => {
  test('renders an entry with title, content, and verification toggle', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const created = await app.createEntry({
      title: 'detail-test',
      content: 'long form content',
      type: 'Safety'
    });
    const { render } = await import('../src/ui/screens/entry-detail.js');
    await render(root, controller, { id: created.id });
    assert.ok(root.textContent.includes('detail-test'));
    assert.ok(root.textContent.includes('long form content'));
    assert.ok(root.textContent.includes('Safety'));
    assert.ok(root.textContent.includes('Verification details'));
  });

  test('renders not-found message for a bad id', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/entry-detail.js');
    await render(root, controller, { id: 999999 });
    assert.ok(root.textContent.includes('Entry not found'));
  });
});

describe('settings screen', () => {
  test('renders all section groups', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/settings.js');
    render(root, controller);
    const text = root.textContent;
    for (const heading of ['Security', 'Data', 'Records and integrity', 'Help', 'Danger zone', 'About']) {
      assert.ok(text.includes(heading), `${heading} group rendered`);
    }
  });
});

describe('certificate screen', () => {
  test('renders chain certificate structure', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    await app.createEntry({ title: 'a', content: 'b' });
    const { render } = await import('../src/ui/screens/certificate.js');
    await render(root, controller);
    assert.ok(root.textContent.length > 0);
    // Either a hash or the genesis marker should be present.
    assert.match(root.textContent, /[0-9a-f]{8}/, 'a hash-like token is rendered');
  });
});

describe('stats screen', () => {
  test('renders stats with no entries', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/stats.js');
    await render(root, controller);
    assert.ok(root.textContent.includes('Statistics') || root.textContent.includes('No entries'));
  });

  test('renders stats with entries — covers by-type and by-month blocks', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    await app.createEntry({ title: 'a', content: 'x', type: 'Safety' });
    await app.createEntry({ title: 'b', content: 'y', type: 'Pay' });
    const { render } = await import('../src/ui/screens/stats.js');
    await render(root, controller);
    const text = root.textContent;
    assert.ok(text.includes('Overview'));
    assert.ok(text.includes('By type'));
    assert.ok(text.includes('Safety') && text.includes('Pay'));
  });
});

describe('calendar screen', () => {
  test('renders calendar view with day cell for an entry', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    await app.createEntry({ title: 'c1', content: 'x' });
    const { render } = await import('../src/ui/screens/calendar.js');
    await render(root, controller);
    assert.ok(root.querySelector('.calendar-grid'), 'calendar grid rendered');
    const cells = root.querySelectorAll('.calendar-cell-has');
    assert.ok(cells.length >= 1, 'at least one day cell with entries');
  });
});

describe('print-view screen', () => {
  test('renders single-entry print view', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const created = await app.createEntry({ title: 'printable', content: 'one' });
    const { render } = await import('../src/ui/screens/print-view.js');
    await render(root, controller, { mode: 'single', id: created.id });
    assert.ok(root.textContent.includes('printable'));
    assert.ok(root.textContent.includes('Plivex records'), 'document title rendered');
  });

  test('renders archive print view across multiple entries', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    await app.createEntry({ title: 'first', content: 'x' });
    await app.createEntry({ title: 'second', content: 'y' });
    const { render } = await import('../src/ui/screens/print-view.js');
    await render(root, controller, { mode: 'archive' });
    assert.ok(root.textContent.includes('first'));
    assert.ok(root.textContent.includes('second'));
  });
});

describe('help screen', () => {
  test('renders all major sections', async (t) => {
    const { root, controller } = await setupUnlocked(t);
    const { render } = await import('../src/ui/screens/help.js');
    render(root, controller);
    const text = root.textContent;
    assert.ok(text.includes('Your passphrase is the only key'));
    assert.ok(text.includes('hash chain'));
    assert.ok(text.includes('Backups'));
  });
});
