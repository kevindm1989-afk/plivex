// Minimal DOM environment for UI smoke tests. happy-dom installs the
// usual `document`, `window`, `navigator`, etc. globals so screen
// modules can call document.createElement / appendChild / etc. without
// any further mocking.
//
// We do not exercise any browser-only feature inside these tests
// (MediaRecorder, navigator.share, URL.createObjectURL, the WebCrypto
// subtle key APIs that hit the platform-specific WebCrypto stack, etc.)
// — only the render path: "given an entry list, does the screen
// produce sensible DOM."
import { Window } from 'happy-dom';

export function installDom() {
  const window = new Window({ url: 'http://plivex.test/' });
  const previous = {};
  // Stash and override the writable globals. `navigator` is a read-only
  // getter on the Node global object since Node 21, so we leave it
  // alone — the smoke tests only exercise the render path, not any
  // navigator.* features.
  for (const key of ['document', 'window', 'HTMLElement', 'Node', 'Element', 'getComputedStyle']) {
    if (key in globalThis) previous[key] = globalThis[key];
  }
  globalThis.document = window.document;
  globalThis.window = window;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  return () => {
    try { window.happyDOM.close(); } catch {}
    for (const key of Object.keys(previous)) globalThis[key] = previous[key];
  };
}

// A controller stub that captures navigation calls so tests can assert
// on them without wiring a real router.
export function stubController() {
  const calls = [];
  return {
    navigate(screen, params) { calls.push({ kind: 'navigate', screen, params }); },
    refresh() { calls.push({ kind: 'refresh' }); },
    calls
  };
}

// Convenience: build a fresh #root container the way ui.js does.
export function makeRoot() {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
}
