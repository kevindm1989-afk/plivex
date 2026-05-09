import { el, clear } from '../dom.js';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';
import { StrengthMeter } from '../components/strength-meter.js';
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
    // Strength gate: require score >= 2 ("fair") so we reject 12-char
    // all-lowercase passphrases that pass crypto.deriveKey's hard floor of
    // length 12 but offer minimal entropy. Bump from >=1 in v1.1.
    const ok = !busy && pass.length > 0 && pass === confirmPass && lastScore >= 2;
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

  const restoreLink = el('button', {
    type: 'button',
    class: 'link-button',
    onClick: () => {
      createSection.setAttribute('hidden', '');
      restoreSection.removeAttribute('hidden');
      setTimeout(() => fileInput.focus(), 0);
    }
  }, ['Restore from backup']);

  const createSection = el('div', { class: 'setup-create' }, [
    passInput.wrap,
    meter.wrap,
    confirmInput.wrap,
    mismatchEl,
    errorEl,
    createBtn,
    el('div', { class: 'screen-footer' }, [restoreLink])
  ]);

  // ---- Restore mode ----------------------------------------------------

  let parsedBackup = null;
  const previewEl = el('p', { class: 'import-preview' });
  const restoreErrorEl = el('p', { class: 'screen-error', role: 'alert' });
  let restoreBusy = false;

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'file-input',
    onChange: async (e) => {
      restoreErrorEl.textContent = '';
      previewEl.textContent = '';
      parsedBackup = null;
      confirmRestoreBtn.disabled = true;
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        parsedBackup = JSON.parse(text);
      } catch {
        restoreErrorEl.textContent = 'Could not parse file as JSON.';
        return;
      }
      const count = Array.isArray(parsedBackup.entries) ? parsedBackup.entries.length : 0;
      const exportedAt = parsedBackup.exported_at ?? 'unknown date';
      previewEl.textContent =
        `This backup contains ${count} entries from ${exportedAt}. Restoring will replace any current data.`;
      confirmRestoreBtn.disabled = false;
    }
  });

  const confirmRestoreBtn = Button({
    label: 'Restore',
    full: true,
    disabled: true,
    onClick: async () => {
      if (restoreBusy || !parsedBackup) return;
      restoreBusy = true;
      confirmRestoreBtn.disabled = true;
      restoreErrorEl.textContent = '';
      const result = await app.importBackup(parsedBackup);
      if (result.ok) {
        controller.refresh();
        return;
      }
      restoreBusy = false;
      confirmRestoreBtn.disabled = false;
      if (result.reason === 'hash_mismatch') {
        restoreErrorEl.textContent = 'Backup file is corrupted or has been tampered with.';
      } else if (result.reason === 'malformed') {
        restoreErrorEl.textContent = `Invalid backup file: ${result.detail}.`;
      } else if (result.reason === 'import_failed') {
        restoreErrorEl.textContent = `Restore failed: ${result.detail}.`;
      } else {
        restoreErrorEl.textContent = 'Restore failed.';
      }
    }
  });

  const cancelRestoreLink = el('button', {
    type: 'button',
    class: 'link-button',
    onClick: () => {
      restoreSection.setAttribute('hidden', '');
      createSection.removeAttribute('hidden');
      restoreErrorEl.textContent = '';
      previewEl.textContent = '';
      parsedBackup = null;
      confirmRestoreBtn.disabled = true;
      fileInput.value = '';
      setTimeout(() => passInput.input.focus(), 0);
    }
  }, ['Back to create']);

  const restoreSection = el('div', { class: 'setup-restore', hidden: true }, [
    el('p', { class: 'lede' }, [
      'Restore a Plivex backup. You will need the passphrase that was set when the backup was made.'
    ]),
    el('label', { class: 'file-input-label' }, [
      el('span', {}, ['Choose backup file']),
      fileInput
    ]),
    previewEl,
    restoreErrorEl,
    confirmRestoreBtn,
    el('div', { class: 'screen-footer' }, [cancelRestoreLink])
  ]);

  // ---- Compose --------------------------------------------------------

  const form = el('form', {
    class: 'screen setup',
    onSubmit: (e) => { e.preventDefault(); if (!createBtn.disabled) submit(); }
  }, [
    el('h1', {}, ['Welcome to Plivex']),
    el('p', { class: 'lede' }, [
      'Create a passphrase to encrypt your notes. There is no recovery if you forget it.'
    ]),
    createSection,
    restoreSection,
    el('div', { class: 'screen-footer' }, [aboutToggle, aboutBody])
  ]);

  root.appendChild(form);
  setTimeout(() => passInput.input.focus(), 0);
}
