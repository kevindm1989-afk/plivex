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

function buildBackupFilename(backup) {
  const today = new Date().toISOString().slice(0, 10);
  const count = backup.entries.length;
  const head = count > 0 ? backup.entries[count - 1].entry_hash.slice(0, 8) : 'genesis';
  return `plivex-backup-${today}-${count}entries-${head}.json`;
}

function exportSection() {
  const status = el('p', { class: 'inline-status', role: 'status' });
  const downloadBtn = Button({
    label: 'Download backup',
    onClick: async () => {
      try {
        const backup = await app.exportBackup();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildBackupFilename(backup);
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

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  const shareBtn = Button({
    label: 'Share backup',
    variant: 'secondary',
    onClick: async () => {
      try {
        const backup = await app.exportBackup();
        const json = JSON.stringify(backup, null, 2);
        const filename = buildBackupFilename(backup);
        const file = new File([json], filename, { type: 'application/json' });
        if (!navigator.canShare({ files: [file] })) {
          status.className = 'inline-status error';
          status.textContent = 'This browser cannot share files. Use Download instead.';
          return;
        }
        await navigator.share({
          files: [file],
          title: 'Plivex backup',
          text: 'Encrypted Plivex backup'
        });
        status.className = 'inline-status success';
        status.textContent = 'Shared.';
      } catch (err) {
        // Web Share rejects with AbortError when the user dismisses the
        // share sheet — treat as a silent cancellation, not an error.
        if (err && err.name === 'AbortError') {
          status.className = 'inline-status';
          status.textContent = '';
          return;
        }
        status.className = 'inline-status error';
        status.textContent = `Share failed: ${err.message}`;
      }
    }
  });

  const children = [
    el('p', { class: 'lede' }, [
      'Save an encrypted backup. The backup file requires your current passphrase to decrypt.'
    ]),
    el('div', { class: 'btn-row' }, canShare ? [downloadBtn, shareBtn] : [downloadBtn]),
    status
  ];
  return section('Export data', children);
}

function backupReminderSection() {
  const status = el('p', { class: 'inline-status', role: 'status' });
  let current = app.DEFAULT_BACKUP_REMINDER_DAYS;
  const select = el('select', {
    id: 'backup-reminder-days',
    class: 'select',
    onChange: async (e) => {
      const days = Number(e.target.value);
      status.className = 'inline-status';
      status.textContent = 'Saving…';
      try {
        await app.setBackupReminderDays(days);
        current = days;
        status.className = 'inline-status success';
        status.textContent =
          days === 0
            ? 'Backup reminders disabled.'
            : `Reminder set: every ${days} day${days === 1 ? '' : 's'}.`;
      } catch (err) {
        status.className = 'inline-status error';
        status.textContent = `Could not save: ${err.message}`;
      }
    }
  });
  for (const d of app.ALLOWED_BACKUP_REMINDER_DAYS) {
    const label = d === 0 ? 'Off' : `Every ${d} day${d === 1 ? '' : 's'}`;
    select.appendChild(el('option', { value: String(d) }, [label]));
  }
  // Populate current selection asynchronously.
  app.getBackupReminderDays().then((d) => {
    current = d;
    select.value = String(d);
  });

  return section('Backup reminders', [
    el('p', { class: 'lede' }, [
      'Plivex can show a banner on the entry list when you haven\'t exported a backup recently. The reminder is local — Plivex never contacts a server.'
    ]),
    el('label', { for: 'backup-reminder-days', class: 'field-label' }, ['Remind me']),
    select,
    status
  ]);
}

function chainTimestampSection() {
  const hashEl = el('p', { class: 'mono small chain-head-hash' }, ['…']);
  const status = el('p', { class: 'inline-status', role: 'status' });
  const copyBtn = Button({
    label: 'Copy chain head',
    onClick: async () => {
      try {
        const head = await app.getChainHead();
        await navigator.clipboard.writeText(head);
        status.className = 'inline-status success';
        status.textContent = 'Copied to clipboard.';
      } catch (err) {
        status.className = 'inline-status error';
        status.textContent = `Could not copy: ${err.message}`;
      }
    }
  });
  const refreshBtn = Button({
    label: 'Refresh',
    variant: 'secondary',
    onClick: async () => {
      try {
        const head = await app.getChainHead();
        hashEl.textContent = head;
      } catch (err) {
        hashEl.textContent = `Error: ${err.message}`;
      }
    }
  });
  // Initial load.
  app.getChainHead().then((head) => {
    hashEl.textContent = head;
  });

  return section('Chain timestamping', [
    el('p', { class: 'lede' }, [
      'Submit this hash to a public timestamping service (for example, OpenTimestamps at opentimestamps.org) to anchor your chain to a public record. The hash reveals nothing about your entries\' content. Save the resulting receipt; it proves your chain existed in this state at the time of timestamping.'
    ]),
    el('p', { class: 'field-label' }, ['Current chain head (latest entry hash):']),
    hashEl,
    el('div', { class: 'btn-row' }, [copyBtn, refreshBtn]),
    status
  ]);
}

function certificateSection(controller) {
  const btn = Button({
    label: 'View verification certificate',
    onClick: () => controller.navigate('certificate')
  });
  return section('Verification certificate', [
    el('p', { class: 'lede' }, [
      'Generate a one-page printable certificate showing the current chain state. Sign it on paper (and optionally have a witness sign) to create an offline anchor that proves the chain was in this state on this date.'
    ]),
    btn
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
  const reminderStatus = el('p', { class: 'inline-status', role: 'status' });
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

  const reminderSelect = el('select', {
    id: 'verify-reminder-days',
    class: 'select',
    onChange: async (e) => {
      const days = Number(e.target.value);
      reminderStatus.className = 'inline-status';
      reminderStatus.textContent = 'Saving…';
      try {
        await app.setVerifyReminderDays(days);
        reminderStatus.className = 'inline-status success';
        reminderStatus.textContent =
          days === 0
            ? 'Verification reminders disabled.'
            : `Reminder set: every ${days} day${days === 1 ? '' : 's'}.`;
      } catch (err) {
        reminderStatus.className = 'inline-status error';
        reminderStatus.textContent = `Could not save: ${err.message}`;
      }
    }
  });
  for (const d of app.ALLOWED_VERIFY_REMINDER_DAYS) {
    const label = d === 0 ? 'Off' : `Every ${d} day${d === 1 ? '' : 's'}`;
    reminderSelect.appendChild(el('option', { value: String(d) }, [label]));
  }
  app.getVerifyReminderDays().then((d) => {
    reminderSelect.value = String(d);
  });

  return section('Verify integrity', [
    el('p', { class: 'lede' }, [
      'Recompute the hash chain over your entries and confirm nothing has been tampered with.'
    ]),
    btn,
    status,
    el('label', { for: 'verify-reminder-days', class: 'field-label' }, ['Remind me to verify']),
    reminderSelect,
    reminderStatus
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

function autoLockSection() {
  const status = el('p', { class: 'inline-status', role: 'status' });
  const current = app.getAutoLockMinutes();
  const select = el('select', {
    id: 'auto-lock-minutes',
    class: 'select',
    onChange: async (e) => {
      const minutes = Number(e.target.value);
      status.className = 'inline-status';
      status.textContent = 'Saving…';
      try {
        await app.setAutoLockMinutes(minutes);
        status.className = 'inline-status success';
        status.textContent = `Auto-lock set to ${minutes} minute${minutes === 1 ? '' : 's'}.`;
      } catch (err) {
        status.className = 'inline-status error';
        status.textContent = `Could not save: ${err.message}`;
      }
    }
  });
  for (const m of app.ALLOWED_AUTO_LOCK_MINUTES) {
    const opt = el('option', {
      value: String(m),
      attrs: m === current ? { selected: '' } : {}
    }, [`${m} minute${m === 1 ? '' : 's'}`]);
    select.appendChild(opt);
  }
  return section('Auto-lock', [
    el('p', { class: 'lede' }, [
      'Plivex locks itself after this much inactivity. Wall-clock based, so backgrounding the app does not pause the timer.'
    ]),
    el('label', { for: 'auto-lock-minutes', class: 'field-label' }, ['Lock after']),
    select,
    status
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
      autoLockSection(),
      exportSection(),
      backupReminderSection(),
      importSection(controller),
      verifySection(),
      chainTimestampSection(),
      certificateSection(controller),
      wipeSection(controller),
      aboutSection()
    ])
  );
}
