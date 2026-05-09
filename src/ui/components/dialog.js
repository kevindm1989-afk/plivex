import { el, clear } from '../dom.js';
import { Button } from './button.js';

// Returns a Promise that resolves with the user's choice. Renders a modal
// dialog appended to <body>; cleans up on resolve.
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'primary', requireType = null }) {
  return new Promise((resolve) => {
    let typedValue = '';
    const overlay = el('div', { class: 'dialog-overlay', role: 'presentation' });

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };

    const confirmBtn = Button({
      label: confirmLabel,
      variant,
      disabled: !!requireType,
      onClick: () => close(true)
    });

    const cancelBtn = Button({
      label: cancelLabel,
      variant: 'secondary',
      onClick: () => close(false)
    });

    const children = [
      el('h2', { class: 'dialog-title', id: 'dialog-title' }, [title]),
      el('p', { class: 'dialog-message' }, [message])
    ];

    if (requireType) {
      const typeInput = el('input', {
        type: 'text',
        autocomplete: 'off',
        class: 'dialog-type-input',
        attrs: { 'aria-label': `Type ${requireType} to confirm` },
        placeholder: `Type ${requireType}`,
        onInput: (e) => {
          typedValue = e.target.value;
          confirmBtn.disabled = typedValue !== requireType;
        }
      });
      children.push(typeInput);
      setTimeout(() => typeInput.focus(), 0);
    }

    children.push(el('div', { class: 'dialog-actions' }, [cancelBtn, confirmBtn]));

    const dialog = el(
      'div',
      {
        class: 'dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dialog-title'
      },
      children
    );

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    if (!requireType) setTimeout(() => confirmBtn.focus(), 0);
  });
}

export function alertDialog({ title, message }) {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'dialog-overlay', role: 'presentation' });
    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } };
    const okBtn = Button({ label: 'OK', onClick: close });
    const dialog = el(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      [
        el('h2', { class: 'dialog-title' }, [title]),
        el('p', { class: 'dialog-message' }, [message]),
        el('div', { class: 'dialog-actions' }, [okBtn])
      ]
    );
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    setTimeout(() => okBtn.focus(), 0);
  });
}
