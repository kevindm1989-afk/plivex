import { el, clear } from '../dom.js';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';
import { StrengthMeter } from '../components/strength-meter.js';
import { alertDialog } from '../components/dialog.js';
import * as app from '../../app.js';

export function render(root, controller) {
  clear(root);

  let pass = '';
  let confirmPass = '';
  let lastScore = 0;
  let busy = false;

  const meter = StrengthMeter();
  const passInput = Input({
    label: 'Passphrase',
    type: 'password',
    autocomplete: 'new-password',
    onInput: (v) => {
      pass = v;
      lastScore = meter.update(v).score;
      updateButton();
      updateMismatch();
    }
  });
  const confirmInput = Input({
    label: 'Confirm passphrase',
    type: 'password',
    autocomplete: 'new-password',
    onInput: (v) => {
      confirmPass = v;
      updateMismatch();
      updateButton();
    }
  });

  const mismatchEl = el('p', { class: 'field-error', role: 'alert' });
  const updateMismatch = () => {
    if (confirmPass && pass !== confirmPass) {
      mismatchEl.textContent = 'Passphrases do not match.';
    } else {
      mismatchEl.textContent = '';
    }
  };

  const errorEl = el('p', { class: 'screen-error', role: 'alert' });

  const submit = async () => {
    if (busy) return;
    busy = true;
    createBtn.disabled = true;
    errorEl.textContent = '';
    const result = await app.initialize(pass);
    if (result.ok) {
      controller.refresh();
      return;
    }
    busy = false;
    errorEl.textContent = (result.feedback ?? ['Could not initialize.']).join(' ');
    updateButton();
  };

  const createBtn = Button({
    label: 'Create',
    type: 'submit',
    full: true,
    disabled: true,
    onClick: submit
  });

  const updateButton = () => {
    const ok = !busy && pass.length > 0 && pass === confirmPass && lastScore >= 1;
    createBtn.disabled = !ok;
  };

  let aboutOpen = false;
  const aboutBody = el('div', { class: 'about-body', hidden: true }, [
    el('p', {}, [
      'A personal note-taking app for documenting workplace events, with local-only storage and tamper-evident entries.'
    ]),
    el('p', {}, [
      'Everything stays on this device. There are no servers, no accounts, no telemetry.'
    ]),
    el('p', {}, [
      el('a', {
        href: 'https://github.com/kevindm1989-afk/plivex/blob/main/README.md',
        target: '_blank',
        rel: 'noopener'
      }, ['README']),
      ' · ',
      el('a', {
        href: 'https://github.com/kevindm1989-afk/plivex/blob/main/PRIVACY.md',
        target: '_blank',
        rel: 'noopener'
      }, ['Privacy']),
      ' · ',
      el('a', {
        href: 'https://github.com/kevindm1989-afk/plivex/blob/main/TERMS.md',
        target: '_blank',
        rel: 'noopener'
      }, ['Terms'])
    ])
  ]);
  const aboutToggle = el('button', {
    type: 'button',
    class: 'link-button',
    onClick: () => {
      aboutOpen = !aboutOpen;
      if (aboutOpen) aboutBody.removeAttribute('hidden');
      else aboutBody.setAttribute('hidden', '');
    }
  }, ['What is Plivex?']);

  const form = el('form', {
    class: 'screen setup',
    onSubmit: (e) => { e.preventDefault(); if (!createBtn.disabled) submit(); }
  }, [
    el('h1', {}, ['Welcome to Plivex']),
    el('p', { class: 'lede' }, [
      'Create a passphrase to encrypt your notes. There is no recovery if you forget it.'
    ]),
    passInput.wrap,
    meter.wrap,
    confirmInput.wrap,
    mismatchEl,
    errorEl,
    createBtn,
    el('div', { class: 'screen-footer' }, [aboutToggle, aboutBody])
  ]);

  root.appendChild(form);
  setTimeout(() => passInput.input.focus(), 0);
}
