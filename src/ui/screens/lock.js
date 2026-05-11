import { el, clear } from '../dom.js';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';
import { confirmDialog } from '../components/dialog.js';
import * as app from '../../app.js';

export function render(root, controller) {
  clear(root);

  let pass = '';
  let busy = false;

  const errorEl = el('p', { class: 'field-error', role: 'alert' });

  const passInput = Input({
    label: 'Passphrase',
    type: 'password',
    autocomplete: 'current-password',
    onInput: (v) => {
      pass = v;
      errorEl.textContent = '';
      unlockBtn.disabled = busy || pass.length === 0;
    }
  });

  const submit = async () => {
    if (busy) return;
    if (pass.length === 0) return;
    busy = true;
    unlockBtn.disabled = true;
    errorEl.textContent = '';
    const result = await app.unlock(pass);
    if (result.ok) {
      controller.refresh();
      return;
    }
    busy = false;
    errorEl.textContent = 'Passphrase did not match. Plivex has no recovery — there are no failed-attempt limits, no email reset, no developer override.';
    pass = '';
    passInput.input.value = '';
    passInput.input.focus();
    unlockBtn.disabled = true;
  };

  const unlockBtn = Button({
    label: 'Unlock',
    type: 'submit',
    full: true,
    disabled: true,
    onClick: submit
  });

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Wipe all data',
      message:
        'There is no passphrase recovery. Wiping deletes every entry permanently. Type WIPE to confirm.',
      confirmLabel: 'Wipe',
      variant: 'danger',
      requireType: 'WIPE'
    });
    if (!ok) return;
    await app.wipe();
    controller.refresh();
  };

  const form = el('form', {
    class: 'screen lock',
    onSubmit: (e) => { e.preventDefault(); submit(); }
  }, [
    el('h1', {}, ['Plivex']),
    el('p', { class: 'lede' }, ['Enter your passphrase to unlock.']),
    passInput.wrap,
    errorEl,
    unlockBtn,
    el('div', { class: 'screen-footer' }, [
      el('details', { class: 'lock-recovery' }, [
        el('summary', {}, ['How recovery works']),
        el('p', { class: 'lede small' }, [
          'Plivex has no passphrase recovery. The encryption key is derived from your passphrase, so without it the encrypted data cannot be decrypted by anyone — including the developer.'
        ]),
        el('p', { class: 'lede small' }, [
          'If you have an exported backup file, you can wipe this install and import the backup on the next install. The same passphrase that wrapped the backup is still required.'
        ]),
        el('p', { class: 'lede small' }, [
          'If you have no backup and have lost the passphrase, the only path forward is to wipe and start fresh.'
        ])
      ]),
      el('button', {
        type: 'button',
        class: 'link-button danger-link',
        onClick: wipe
      }, ['I forgot my passphrase'])
    ])
  ]);

  root.appendChild(form);
  setTimeout(() => passInput.input.focus(), 0);
}
