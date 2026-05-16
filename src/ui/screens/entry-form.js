import { el, clear, svgFromString } from '../dom.js';
import { Input, Textarea } from '../components/input.js';
import { Button } from '../components/button.js';
import { confirmDialog } from '../components/dialog.js';
import { AudioRecorder } from '../components/audio-recorder.js';
import { iconBack, iconCheck } from '../icons.js';
import { getTemplate } from '../templates.js';
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
export const MAX_AUDIO_PER_ENTRY = 3;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_ENTRY = 3;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

function photoDataUrl(photo) {
  return `data:${photo.type || 'image/jpeg'};base64,${photo.dataB64}`;
}

function audioDataUrl(audio) {
  return `data:${audio.type || 'audio/webm'};base64,${audio.dataB64}`;
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma === -1 ? '' : dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function render(root, controller, params = {}) {
  clear(root);

  const mode = params.mode === 'edit' ? 'edit' : 'new';
  let original = null;
  if (mode === 'edit' && params.id !== undefined) {
    original = await app.getEntry(params.id);
  }

  // For new entries, optional template seeds title/type. Edit mode
  // always wins over template prefill.
  const template = mode === 'new' && params.template ? getTemplate(params.template) : null;

  let title = original?.payload?.title ?? (template?.titlePrefix ?? '');
  let content = original?.payload?.content ?? '';
  let type = original?.payload?.type ?? (template?.type ?? '');
  let witness = original?.payload?.witness ?? '';
  let location = original?.payload?.location ?? '';
  let followUpDate = original?.payload?.followUpDate ?? '';
  let photos = Array.isArray(original?.payload?.photos)
    ? original.payload.photos.slice()
    : [];
  let audios = Array.isArray(original?.payload?.audio)
    ? original.payload.audio.slice()
    : [];
  let files = Array.isArray(original?.payload?.files)
    ? original.payload.files.slice()
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

  const followUpInput = el('input', {
    type: 'date',
    id: 'entry-follow-up',
    class: 'date-input',
    value: followUpDate,
    onInput: (e) => {
      followUpDate = e.target.value;
      dirty = true;
    }
  });
  const followUpField = el('div', { class: 'field' }, [
    el('label', { for: 'entry-follow-up', class: 'field-label' }, [
      'Follow up by (optional)'
    ]),
    followUpInput
  ]);

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
      const incoming = Array.from(e.target.files ?? []);
      e.target.value = '';
      let added = 0;
      let skipped = [];
      for (const f of incoming) {
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

  // Audio attachments: same encrypted-payload model as photos. Limited to
  // MAX_AUDIO_PER_ENTRY clips per entry and MAX_AUDIO_BYTES per clip.
  const audioStatus = el('p', { class: 'photo-status', role: 'status' });
  const audioList = el('div', { class: 'audio-list' });

  function renderAudios() {
    clear(audioList);
    audios.forEach((a, idx) => {
      audioList.appendChild(
        el('div', { class: 'audio-row' }, [
          el('audio', {
            controls: true,
            src: audioDataUrl(a),
            attrs: { preload: 'metadata' }
          }),
          el('span', { class: 'audio-name' }, [a.name || `clip ${idx + 1}`]),
          el('button', {
            type: 'button',
            class: 'audio-remove',
            attrs: { 'aria-label': `Remove ${a.name || 'audio clip'}` },
            onClick: () => {
              audios.splice(idx, 1);
              dirty = true;
              renderAudios();
              audioRecorder.refresh();
              updateSave();
            }
          }, ['Remove'])
        ])
      );
    });
  }

  async function addAudio({ blob, name, type }) {
    if (audios.length >= MAX_AUDIO_PER_ENTRY) {
      audioStatus.className = 'photo-status photo-status-warn';
      audioStatus.textContent = `Max ${MAX_AUDIO_PER_ENTRY} audio clips per entry.`;
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
      const capMb = MAX_AUDIO_BYTES / 1024 / 1024;
      audioStatus.className = 'photo-status photo-status-warn';
      audioStatus.textContent = `${name}: ${sizeMb} MB exceeds ${capMb} MB cap.`;
      return;
    }
    try {
      const dataB64 = await blobToBase64(blob);
      audios.push({ name, type: type || blob.type || 'audio/webm', dataB64 });
      dirty = true;
      audioStatus.className = 'photo-status';
      audioStatus.textContent = '';
      renderAudios();
      audioRecorder.refresh();
      updateSave();
    } catch (err) {
      audioStatus.className = 'photo-status photo-status-warn';
      audioStatus.textContent = `Could not read clip: ${err.message}`;
    }
  }

  const audioRecorder = AudioRecorder({
    disabled: () => audios.length >= MAX_AUDIO_PER_ENTRY,
    onClipReady: ({ blob, mimeType }) => {
      const ext = (mimeType && mimeType.includes('mp4')) ? 'm4a' : 'webm';
      const name = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      addAudio({ blob, name, type: mimeType });
    },
    onError: (msg) => {
      audioStatus.className = 'photo-status photo-status-warn';
      audioStatus.textContent = msg;
    }
  });

  const audioFileInput = el('input', {
    type: 'file',
    accept: 'audio/*',
    multiple: true,
    hidden: true,
    onChange: async (e) => {
      const incoming = Array.from(e.target.files ?? []);
      e.target.value = '';
      for (const f of incoming) {
        if (audios.length >= MAX_AUDIO_PER_ENTRY) break;
        await addAudio({ blob: f, name: f.name, type: f.type });
      }
    }
  });
  const addAudioFileBtn = Button({
    label: 'Add audio file',
    variant: 'secondary',
    onClick: () => audioFileInput.click()
  });

  const audioField = el('div', { class: 'field audio-field' }, [
    el('span', { class: 'field-label' }, [
      `Audio (optional, up to ${MAX_AUDIO_PER_ENTRY})`
    ]),
    audioList,
    audioRecorder,
    el('div', { class: 'btn-row' }, [addAudioFileBtn, audioFileInput]),
    audioStatus
  ]);
  renderAudios();

  // File attachments (PDF / docs / anything). Stored base64 inside the
  // encrypted payload like photos and audio. Caps: 3 files × 15 MB.
  const filesStatus = el('p', { class: 'photo-status', role: 'status' });
  const filesList = el('div', { class: 'files-list' });

  function renderFiles() {
    clear(filesList);
    files.forEach((f, idx) => {
      const sizeMb = ((f.dataB64.length * 0.75) / 1024 / 1024).toFixed(2);
      filesList.appendChild(
        el('div', { class: 'file-row' }, [
          el('span', { class: 'file-name' }, [f.name || `file ${idx + 1}`]),
          el('span', { class: 'file-meta' }, [`${f.type || 'unknown'} · ${sizeMb} MB`]),
          el('button', {
            type: 'button',
            class: 'audio-remove',
            attrs: { 'aria-label': `Remove ${f.name || 'file'}` },
            onClick: () => {
              files.splice(idx, 1);
              dirty = true;
              renderFiles();
              updateSave();
            }
          }, ['Remove'])
        ])
      );
    });
  }

  const filesInput = el('input', {
    type: 'file',
    multiple: true,
    hidden: true,
    onChange: async (e) => {
      const incoming = Array.from(e.target.files ?? []);
      e.target.value = '';
      const skipped = [];
      for (const f of incoming) {
        if (files.length >= MAX_FILES_PER_ENTRY) {
          skipped.push(`${f.name}: max ${MAX_FILES_PER_ENTRY} files per entry`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          const sizeMb = (f.size / 1024 / 1024).toFixed(1);
          const capMb = MAX_FILE_BYTES / 1024 / 1024;
          skipped.push(`${f.name}: ${sizeMb} MB exceeds ${capMb} MB cap`);
          continue;
        }
        try {
          const dataB64 = await fileToBase64(f);
          files.push({
            name: f.name,
            type: f.type || 'application/octet-stream',
            dataB64
          });
          dirty = true;
        } catch (err) {
          skipped.push(`${f.name}: ${err.message}`);
        }
      }
      renderFiles();
      if (skipped.length > 0) {
        filesStatus.className = 'photo-status photo-status-warn';
        filesStatus.textContent = `Skipped: ${skipped.join('; ')}`;
      } else {
        filesStatus.className = 'photo-status';
        filesStatus.textContent = '';
      }
      updateSave();
    }
  });
  const addFileBtn = Button({
    label: 'Add file',
    variant: 'secondary',
    onClick: () => filesInput.click()
  });

  const filesField = el('div', { class: 'field files-field' }, [
    el('span', { class: 'field-label' }, [
      `Files (optional, up to ${MAX_FILES_PER_ENTRY})`
    ]),
    filesList,
    el('div', { class: 'btn-row' }, [addFileBtn, filesInput]),
    filesStatus
  ]);
  renderFiles();

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
      if (followUpDate) payload.followUpDate = followUpDate;
      if (photos.length > 0) payload.photos = photos;
      if (audios.length > 0) payload.audio = audios;
      if (files.length > 0) payload.files = files;
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
    followUpField,
    photoField,
    audioField,
    filesField,
    errorEl
  ]);

  root.appendChild(form);
  setTimeout(() => titleField.input.focus(), 0);
}
