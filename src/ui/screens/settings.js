import { el, clear, svgFromString } from '../dom.js';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';
import { StrengthMeter } from '../components/strength-meter.js';
import { confirmDialog, alertDialog } from '../components/dialog.js';
import { iconBack } from '../icons.js';
import * as app from '../../app.js';

function section(title, children) {
  return el('section', { class: 'settings-section' }, [
    el('h2', {}, [title]),
    ...children
  ]);
}

function changePassphraseSection(controller) {
  let cur = '';
  let next = '';
  let confirmNext = '';
  let lastScore = 0;
  let busy = false;
  const status = el('p', { class: 'inline-status', role: 'status' });

  const meter = StrengthMeter();
  const curField = Input({
    label: 'Current passphrase',
    type: 'password',
    autocomplete: 'current-password',
    onInput: (v) => { cur = v; updateButton(); }
  });
  const nextField = Input({
    label: 'New passphrase',
    type: 'password',
    autocomplete: 'new-password',
    onInput: (v) => {
      next = v;
      lastScore = meter.update(v).score;
      updateMismatch();
      updateButton();
    }
  });
  const confirmField = Input({
    label: 'Confirm new passphrase',
    type: 'password',
    autocomplete: 'new-password',
    onInput: (v) => { confirmNext = v; updateMismatch(); updateButton(); }
  });

  const mismatchEl = el('p', { class: 'field-error', role: 'alert' });
  const updateMismatch = () => {
    mismatchEl.textContent = confirmNext && next !== confirmNext ? 'Passphrases do not match.' : '';
  };

  const submit = async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    status.className = 'inline-status';
    status.textContent = 'Changing…';
    const result = await app.changePassphrase(cur, next);
    busy = false;
    if (result.ok) {
      status.className = 'inline-status success';
      status.textContent = 'Passphrase changed.';
      cur = ''; next = ''; confirmNext = '';
      curField.input.value = '';
      nextField.input.value = '';
      confirmField.input.value = '';
      meter.update('');
      updateButton();
      return;
    }
    if (result.reason === 'incorrect_passphrase') {
      status.className = 'inline-status error';
      status.textContent = 'Current passphrase is incorrect.';
    } else {
      status.className = 'inline-status error';
      status.textContent = (result.feedback ?? ['Could not change passphrase.']).join(' ');
    }
    updateButton();
  };

  const btn = Button({ label: 'Change', onClick: submit, disabled: true });

  const updateButton = () => {
    // Strength gate: require score >= 2 ("fair"). Same bump as setup screen
    // in v1.1.
    btn.disabled = busy || !cur || !next || next !== confirmNext || lastScore < 2;
  };

  return section('Change passphrase', [
    curField.wrap,
    nextField.wrap,
    meter.wrap,
    confirmField.wrap,
    mismatchEl,
    status,
    btn
  ]);
}

function exportSection() {
  const status = el('p', { class: 'inline-status', role: 'status' });
  const btn = Button({
    label: 'Download backup',
    onClick: async () => {
      try {
        const backup = await app.exportBackup();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const today = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plivex-backup-${today}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        status.className = 'inline-status success';
        status.textContent = 'Backup downloaded.';
      } catch (err) {
        status.className = 'inline-status error';
        status.textContent = `Export failed: ${err.message}`;
      }
    }
  });
  return section('Export data', [
    el('p', { class: 'lede' }, [
      'Save an encrypted backup. The backup file requires your current passphrase to decrypt.'
    ]),
    btn,
    status
  ]);
}

function importSection(controller) {
  let parsed = null;
  const status = el('p', { class: 'inline-status', role: 'status' });
  const preview = el('div', { class: 'import-preview' });
  const confirmBtn = Button({
    label: 'Confirm import',
    variant: 'danger',
    disabled: true,
    onClick: async () => {
      if (!parsed) return;
      const ok = await confirmDialog({
        title: 'Replace all data',
        message:
          'Importing replaces every entry currently stored. This cannot be undone unless you also have an export of the current data.',
        confirmLabel: 'Replace',
        variant: 'danger'
      });
      if (!ok) return;
      const result = await app.importBackup(parsed);
      if (result.ok) {
        await alertDialog({
          title: 'Import complete',
          message: `Imported ${result.count} entries. Unlock with the original passphrase to continue.`
        });
        controller.refresh();
        return;
      }
      status.className = 'inline-status error';
      if (result.reason === 'hash_mismatch') {
        status.textContent = 'Import failed: backup file is corrupted or has been tampered with.';
      } else {
        status.textContent = `Import failed: ${result.detail ?? result.reason}.`;
      }
    }
  });

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        parsed = JSON.parse(text);
      } catch (err) {
        parsed = null;
        status.className = 'inline-status error';
        status.textContent = 'Could not parse file as JSON.';
        confirmBtn.disabled = true;
        preview.textContent = '';
        return;
      }
      const count = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
      const exportedAt = parsed.exported_at ?? 'unknown date';
      preview.textContent = `This backup contains ${count} entries from ${exportedAt}. Importing will REPLACE all current data.`;
      status.textContent = '';
      confirmBtn.disabled = false;
    }
  });

  return section('Import data', [
    el('p', { class: 'lede' }, [
      'Restore from a previous Plivex backup. This will replace any current data.'
    ]),
    el('label', { class: 'file-input-label' }, [
      el('span', {}, ['Choose backup file']),
      fileInput
    ]),
    preview,
    confirmBtn,
    status
  ]);
}

function verifySection() {
  const status = el('p', { class: 'inline-status', role: 'status' });
  const btn = Button({
    label: 'Verify all entries',
    onClick: async () => {
      btn.disabled = true;
      status.className = 'inline-status';
      status.textContent = 'Verifying…';
      try {
        const result = await app.verifyIntegrity();
        if (result.valid) {
          status.className = 'inline-status success';
          status.textContent = `✓ All ${result.count} entries verified.`;
        } else {
          status.className = 'inline-status error';
          status.textContent = `✗ Chain breaks at entry #${result.breakAt} (reason: ${result.reason}).`;
        }
      } catch (err) {
        status.className = 'inline-status error';
        status.textContent = `Verification failed: ${err.message}`;
      }
      btn.disabled = false;
    }
  });
  return section('Verify integrity', [
    el('p', { class: 'lede' }, [
      'Recompute the hash chain over your entries and confirm nothing has been tampered with.'
    ]),
    btn,
    status
  ]);
}

function wipeSection(controller) {
  const btn = Button({
    label: 'Wipe all data',
    variant: 'danger',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Wipe all data',
        message:
          'This deletes every entry and your passphrase. There is no recovery. Type WIPE to confirm.',
        confirmLabel: 'Wipe',
        variant: 'danger',
        requireType: 'WIPE'
      });
      if (!ok) return;
      await app.wipe();
      controller.refresh();
    }
  });
  return section('Wipe all data', [
    el('p', { class: 'lede' }, [
      'Permanently delete everything stored on this device. There is no passphrase recovery; use this if you forgot your passphrase or want to start over.'
    ]),
    btn
  ]);
}

function aboutSection() {
  return section('About', [
    el('dl', { class: 'about-list' }, [
      el('dt', {}, ['Version']),
      el('dd', {}, [app.APP_VERSION]),
      el('dt', {}, ['Source']),
      el('dd', {}, [
        el('a', {
          href: 'https://github.com/kevindm1989-afk/plivex',
          target: '_blank',
          rel: 'noopener'
        }, ['github.com/kevindm1989-afk/plivex'])
      ]),
      el('dt', {}, ['Documents']),
      el('dd', {}, [
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
        }, ['Terms']),
        ' · ',
        el('a', {
          href: 'https://github.com/kevindm1989-afk/plivex/blob/main/docs/EVIDENTIARY_USE.md',
          target: '_blank',
          rel: 'noopener'
        }, ['Evidentiary Use'])
      ])
    ])
  ]);
}

export function render(root, controller) {
  clear(root);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('entry-list')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Settings'])
  ]);

  root.appendChild(
    el('section', { class: 'screen settings' }, [
      topbar,
      changePassphraseSection(controller),
      exportSection(),
      importSection(controller),
      verifySection(),
      wipeSection(controller),
      aboutSection()
    ])
  );
}
