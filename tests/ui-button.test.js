// Minimal DOM stub — just enough surface for src/ui/dom.js's `el()` to
// build a button via document.createElement and for our tests to dispatch a
// synthetic click. No new dependencies (no jsdom). Installed before
// importing the Button factory so module evaluation sees the stub.

class StubElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = new Map();
    this.listeners = new Map();
    this.className = '';
    this.dataset = {};
    this._disabled = false;
  }
  setAttribute(k, v) {
    this.attrs.set(k, v);
    if (k === 'disabled') this._disabled = true;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
    if (k === 'disabled') this._disabled = false;
  }
  hasAttribute(k) { return this.attrs.has(k); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatchEvent(ev) {
    if (this._disabled && (ev.type === 'click' || ev.type === 'pointerdown')) {
      return false;
    }
    for (const fn of this.listeners.get(ev.type) ?? []) fn(ev);
    return true;
  }
  appendChild(child) { this.children.push(child); return child; }
  // The dom.js helper writes to `disabled` as a property in some places;
  // mirror the property/attribute reflection that real buttons have.
  get disabled() { return this._disabled; }
  set disabled(v) {
    this._disabled = !!v;
    if (v) this.attrs.set('disabled', ''); else this.attrs.delete('disabled');
  }
}

globalThis.document = {
  createElement: (tag) => new StubElement(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: text })
};
globalThis.Event = class { constructor(type) { this.type = type; } };

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Button } from '../src/ui/components/button.js';

describe('Button factory', () => {
  test('attaches click listener even when constructed disabled', () => {
    let calls = 0;
    const btn = Button({
      label: 'Wipe',
      disabled: true,
      onClick: () => { calls++; }
    });
    // Initial state: disabled, so a tap does nothing (browser would block,
    // and our stub mirrors that).
    btn.dispatchEvent(new Event('click'));
    assert.equal(calls, 0);

    // Dialog later flips the property to enable the button (matches what
    // dialog.js:51 does after the user types WIPE).
    btn.disabled = false;
    btn.dispatchEvent(new Event('click'));
    assert.equal(calls, 1, 'click after enable must invoke onClick');
  });

  test('attaches click listener when constructed enabled', () => {
    let calls = 0;
    const btn = Button({ label: 'OK', onClick: () => calls++ });
    btn.dispatchEvent(new Event('click'));
    assert.equal(calls, 1);
  });

  test('disabled-at-construction button still has the listener wired', () => {
    let calls = 0;
    const btn = Button({ label: 'Go', disabled: true, onClick: () => calls++ });
    assert.ok(btn.listeners.get('click')?.length > 0,
      'click listener must be present even when constructed disabled');
  });
});
