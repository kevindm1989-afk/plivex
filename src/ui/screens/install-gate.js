import { el, clear } from '../dom.js';

export function render(root) {
  clear(root);
  root.appendChild(
    el('section', { class: 'screen install-gate' }, [
      el('h1', {}, ['Plivex']),
      el('p', { class: 'tagline' }, ['Personal note-taking, local only.']),
      el('h2', {}, ['Install required']),
      el('p', {}, ['This app must be installed to your home screen before use.']),
      el('p', {}, [
        el('strong', {}, ['iOS (Safari):']),
        ' Tap the Share button, then "Add to Home Screen."'
      ]),
      el('p', {}, [
        el('strong', {}, ['Android (Chrome):']),
        ' Tap the menu, then "Install app" or "Add to Home Screen."'
      ]),
      el('p', {}, ['Once installed, open Plivex from your home screen.'])
    ])
  );
}
