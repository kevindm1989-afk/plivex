// Minimal stub for handleTabTrap. Only what the helper needs:
// - dialogEl.querySelectorAll(selector) returning the focusable list
// - element.focus() updating document.activeElement
// - document.activeElement getter
// No new dependency.

const focusables = [];
const doc = {
  get activeElement() { return doc._active; },
  set activeElement(v) { doc._active = v; },
  _active: null
};
globalThis.document = doc;

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleTabTrap } from '../src/ui/components/dialog.js';

function makeFocusable() {
  const node = {
    focus() { doc._active = node; }
  };
  focusables.push(node);
  return node;
}

function fakeDialog(items) {
  return { querySelectorAll: () => items };
}

function fakeKey(opts = {}) {
  return {
    key: opts.key ?? 'Tab',
    shiftKey: !!opts.shiftKey,
    _prevented: false,
    preventDefault() { this._prevented = true; }
  };
}

describe('handleTabTrap', () => {
  test('Tab on the last focusable element wraps focus to the first', () => {
    const a = makeFocusable();
    const b = makeFocusable();
    const c = makeFocusable();
    const dlg = fakeDialog([a, b, c]);
    doc.activeElement = c;
    const ev = fakeKey({ key: 'Tab' });
    handleTabTrap(ev, dlg, doc);
    assert.equal(doc.activeElement, a);
    assert.equal(ev._prevented, true);
  });

  test('Shift+Tab on the first focusable element wraps focus to the last', () => {
    const a = makeFocusable();
    const b = makeFocusable();
    const c = makeFocusable();
    const dlg = fakeDialog([a, b, c]);
    doc.activeElement = a;
    const ev = fakeKey({ key: 'Tab', shiftKey: true });
    handleTabTrap(ev, dlg, doc);
    assert.equal(doc.activeElement, c);
    assert.equal(ev._prevented, true);
  });

  test('Tab in the middle does not preventDefault', () => {
    const a = makeFocusable();
    const b = makeFocusable();
    const c = makeFocusable();
    const dlg = fakeDialog([a, b, c]);
    doc.activeElement = b;
    const ev = fakeKey({ key: 'Tab' });
    handleTabTrap(ev, dlg, doc);
    assert.equal(doc.activeElement, b);
    assert.equal(ev._prevented, false);
  });

  test('non-Tab keys are ignored', () => {
    const a = makeFocusable();
    const b = makeFocusable();
    const dlg = fakeDialog([a, b]);
    doc.activeElement = b;
    const ev = fakeKey({ key: 'Enter' });
    handleTabTrap(ev, dlg, doc);
    assert.equal(doc.activeElement, b);
    assert.equal(ev._prevented, false);
  });

  test('focus outside the dialog gets pulled in on Tab', () => {
    const a = makeFocusable();
    const b = makeFocusable();
    const outside = makeFocusable();
    const dlg = fakeDialog([a, b]);
    doc.activeElement = outside;
    const ev = fakeKey({ key: 'Tab' });
    handleTabTrap(ev, dlg, doc);
    assert.equal(doc.activeElement, a);
    assert.equal(ev._prevented, true);
  });
});
