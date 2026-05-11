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

export const MAX_PHOTOS_PER_ENTRY = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function photoDataUrl(photo) {
  return `data:${photo.type || 'image/jpeg'};base64,${photo.dataB64}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma === -1 ? '' : dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

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
  let photos = Array.isArray(original?.payload?.photos)
    ? original.payload.photos.slice()
    : [];
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

  // Photos field: hidden file input + visible "Add photo" button + grid of
  // thumbnails. Photos are stored inline in the encrypted payload so the
  // hash chain covers them and exports include them automatically.
  const photoStatus = el('p', { class: 'photo-status', role: 'status' });
  const photoGrid = el('div', { class: 'photos-grid' });

  const photoInput = el('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    hidden: true,
    onChange: async (e) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      let added = 0;
      let skipped = [];
      for (const f of files) {
        if (photos.length >= MAX_PHOTOS_PER_ENTRY) {
          skipped.push(`${f.name}: max ${MAX_PHOTOS_PER_ENTRY} photos per entry`);
          continue;
        }
        if (f.size > MAX_PHOTO_BYTES) {
          const sizeMb = (f.size / 1024 / 1024).toFixed(1);
          const capMb = MAX_PHOTO_BYTES / 1024 / 1024;
          skipped.push(`${f.name}: ${sizeMb} MB exceeds ${capMb} MB cap`);
          continue;
        }
        try {
          const dataB64 = await fileToBase64(f);
          photos.push({ name: f.name, type: f.type || 'image/jpeg', dataB64 });
          added++;
          dirty = true;
        } catch (err) {
          skipped.push(`${f.name}: ${err.message}`);
        }
      }
      renderPhotos();
      if (skipped.length === 0 && added > 0) {
        photoStatus.className = 'photo-status';
        photoStatus.textContent = '';
      } else if (skipped.length > 0) {
        photoStatus.className = 'photo-status photo-status-warn';
        photoStatus.textContent = `Skipped: ${skipped.join('; ')}`;
      }
      updateSave();
    }
  });

  function renderPhotos() {
    clear(photoGrid);
    photos.forEach((p, idx) => {
      photoGrid.appendChild(
        el('div', { class: 'photo-thumb' }, [
          el('img', {
            src: photoDataUrl(p),
            alt: p.name || `photo ${idx + 1}`,
            attrs: { loading: 'lazy' }
          }),
          el('button', {
            type: 'button',
            class: 'photo-remove',
            attrs: { 'aria-label': `Remove ${p.name || 'photo'}` },
            onClick: () => {
              photos.splice(idx, 1);
              dirty = true;
              renderPhotos();
              updateSave();
            }
          }, ['×'])
        ])
      );
    });
  }
  renderPhotos();

  const addPhotoBtn = Button({
    label: 'Add photo',
    variant: 'secondary',
    onClick: () => photoInput.click()
  });

  const photoField = el('div', { class: 'field photo-field' }, [
    el('span', { class: 'field-label' }, [
      `Photos (optional, up to ${MAX_PHOTOS_PER_ENTRY})`
    ]),
    photoGrid,
    el('div', { class: 'btn-row' }, [addPhotoBtn, photoInput]),
    photoStatus
  ]);

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
      if (photos.length > 0) payload.photos = photos;
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
    photoField,
    errorEl
  ]);

  root.appendChild(form);
  setTimeout(() => titleField.input.focus(), 0);
}
