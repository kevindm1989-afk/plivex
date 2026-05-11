import { el, clear, svgFromString } from '../dom.js';
import { Input, Textarea } from '../components/input.js';
import { Button } from '../components/button.js';
import { confirmDialog } from '../components/dialog.js';
import { iconBack, iconCheck } from '../icons.js';
import * as app from '../../app.js';

export const ENTRY_TYPES = [
  '',
  'Schedule',
  'Pay',
  'Safety',
  'Discipline',
  'Harassment',
  'Meeting',
  'Conversation',
  'Injury',
  'Other'
];

export async function render(root, controller, params = {}) {
  clear(root);

  const mode = params.mode === 'edit' ? 'edit' : 'new';
  let original = null;
  if (mode === 'edit' && params.id !== undefined) {
    original = await app.getEntry(params.id);
  }

  let title = original?.payload?.title ?? '';
  let content = original?.payload?.content ?? '';
  let type = original?.payload?.type ?? '';
  let witness = original?.payload?.witness ?? '';
  let location = original?.payload?.location ?? '';
  let dirty = false;
  let busy = false;

  const errorEl = el('p', { class: 'screen-error', role: 'alert' });

  // Type select (optional categorization).
  const typeSelect = el('select', {
    id: 'entry-type',
    class: 'select',
    onChange: (e) => {
      type = e.target.value;
      dirty = true;
    }
  });
  for (const t of ENTRY_TYPES) {
    const label = t === '' ? '(no type)' : t;
    typeSelect.appendChild(el('option', { value: t }, [label]));
  }
  typeSelect.value = type;
  const typeField = el('div', { class: 'field' }, [
    el('label', { for: 'entry-type', class: 'field-label' }, ['Type (optional)']),
    typeSelect
  ]);

  const titleField = Input({
    label: 'Title',
    value: title,
    autocomplete: 'off',
    onInput: (v) => {
      title = v;
      dirty = true;
      updateSave();
    }
  });
  const contentField = Textarea({
    label: 'Content',
    value: content,
    rows: 10,
    onInput: (v) => {
      content = v;
      dirty = true;
      updateSave();
    }
  });

  const witnessField = Input({
    label: 'Witness (optional)',
    value: witness,
    autocomplete: 'off',
    onInput: (v) => {
      witness = v;
      dirty = true;
    }
  });
  const locationField = Input({
    label: 'Location (optional)',
    value: location,
    autocomplete: 'off',
    onInput: (v) => {
      location = v;
      dirty = true;
    }
  });

  const goBack = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        variant: 'danger'
      });
      if (!ok) return;
    }
    if (mode === 'edit' && params.id !== undefined) {
      controller.navigate('entry-detail', { id: params.id });
    } else {
      controller.navigate('entry-list');
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!title && !content) return;
    busy = true;
    saveBtn.disabled = true;
    errorEl.textContent = '';
    try {
      const payload = { title, content };
      if (type) payload.type = type;
      if (witness) payload.witness = witness;
      if (location) payload.location = location;
      const options = mode === 'edit' && original ? { supersedes: original.uuid } : undefined;
      await app.createEntry(payload, options);
      dirty = false;
      controller.navigate('entry-list');
    } catch (err) {
      busy = false;
      saveBtn.disabled = false;
      errorEl.textContent = `Could not save: ${err.message}`;
    }
  };

  const saveBtn = Button({
    label: 'Save',
    type: 'submit',
    icon: svgFromString(iconCheck()),
    onClick: submit
  });

  const updateSave = () => {
    saveBtn.disabled = busy || (!title && !content);
  };
  updateSave();

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: goBack
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, [mode === 'edit' ? 'Edit entry' : 'New entry']),
    el('div', { class: 'topbar-actions' }, [saveBtn])
  ]);

  const form = el('form', {
    class: 'screen entry-form',
    onSubmit: (e) => { e.preventDefault(); submit(); }
  }, [
    topbar,
    typeField,
    titleField.wrap,
    contentField.wrap,
    witnessField.wrap,
    locationField.wrap,
    errorEl
  ]);

  root.appendChild(form);
  setTimeout(() => titleField.input.focus(), 0);
}
