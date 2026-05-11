import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconBack, iconEdit } from '../icons.js';
import * as app from '../../app.js';

function photoDataUrl(photo) {
  return `data:${photo.type || 'image/jpeg'};base64,${photo.dataB64}`;
}

function audioDataUrl(audio) {
  return `data:${audio.type || 'audio/webm'};base64,${audio.dataB64}`;
}

function openPhotoOverlay(photo) {
  const overlay = el(
    'div',
    {
      class: 'photo-overlay',
      attrs: { role: 'dialog', 'aria-label': photo.name || 'Photo', tabindex: '-1' },
      onClick: (e) => {
        if (e.target === overlay || e.target.classList.contains('photo-overlay-close')) {
          close();
        }
      },
      onKeyDown: (e) => {
        if (e.key === 'Escape') close();
      }
    },
    [
      el('button', {
        type: 'button',
        class: 'photo-overlay-close',
        attrs: { 'aria-label': 'Close' }
      }, ['×']),
      el('img', { src: photoDataUrl(photo), alt: photo.name || '' })
    ]
  );
  function close() {
    overlay.remove();
    document.body.classList.remove('overlay-open');
  }
  document.body.appendChild(overlay);
  document.body.classList.add('overlay-open');
  overlay.focus();
}

export async function render(root, controller, params = {}) {
  clear(root);

  const entry = await app.getEntry(params.id);
  if (!entry) {
    root.appendChild(el('section', { class: 'screen' }, [
      el('header', { class: 'topbar' }, [
        el('button', {
          type: 'button',
          class: 'icon-button',
          attrs: { 'aria-label': 'Back' },
          onClick: () => controller.navigate('entry-list')
        }, [svgFromString(iconBack())]),
        el('h1', { class: 'topbar-title' }, ['Entry'])
      ]),
      el('p', {}, ['Entry not found.'])
    ]));
    return;
  }

  // Look for a replacement (an entry whose supersedes points at this uuid)
  const all = await app.listEntries();
  const replacement = all.find((e) => e.supersedes === entry.uuid);
  let predecessor = null;
  if (entry.supersedes) {
    predecessor = await app.getEntryByUuid(entry.supersedes);
  }

  const editBtn = Button({
    label: 'Edit',
    icon: svgFromString(iconEdit()),
    onClick: () => controller.navigate('entry-form', { mode: 'edit', id: entry.id })
  });
  const printBtn = Button({
    label: 'Print',
    variant: 'secondary',
    onClick: () => controller.navigate('print-view', { mode: 'single', id: entry.id })
  });

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('entry-list')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Entry']),
    el('div', { class: 'topbar-actions' }, [printBtn, editBtn])
  ]);

  const tags = [];
  if (entry.payload?.type) tags.push(el('span', { class: 'tag tag-type' }, [entry.payload.type]));
  if (replacement) tags.push(el('span', { class: 'tag tag-muted' }, ['superseded']));
  if (predecessor) tags.push(el('span', { class: 'tag' }, ['edited']));

  const verifyBody = el('dl', { class: 'verify-details', hidden: true }, [
    el('dt', {}, ['UUID']),
    el('dd', { class: 'mono' }, [entry.uuid]),
    el('dt', {}, ['Created']),
    el('dd', {}, [entry.created_at]),
    el('dt', {}, ['Entry hash']),
    el('dd', { class: 'mono small' }, [entry.entry_hash]),
    el('dt', {}, ['Previous hash']),
    el('dd', { class: 'mono small' }, [entry.prev_hash]),
    ...(replacement
      ? [
          el('dt', {}, ['Replaced by']),
          el('dd', {}, [
            el('button', {
              type: 'button',
              class: 'link-button',
              onClick: () => controller.navigate('entry-detail', { id: replacement.id })
            }, [`#${replacement.id}`])
          ])
        ]
      : []),
    ...(predecessor
      ? [
          el('dt', {}, ['Replaces']),
          el('dd', {}, [
            el('button', {
              type: 'button',
              class: 'link-button',
              onClick: () => controller.navigate('entry-detail', { id: predecessor.id })
            }, [`#${predecessor.id}`])
          ])
        ]
      : [])
  ]);

  let verifyOpen = false;
  const verifyToggle = el('button', {
    type: 'button',
    class: 'link-button',
    attrs: { 'aria-expanded': 'false' },
    onClick: () => {
      verifyOpen = !verifyOpen;
      if (verifyOpen) {
        verifyBody.removeAttribute('hidden');
        verifyToggle.setAttribute('aria-expanded', 'true');
      } else {
        verifyBody.setAttribute('hidden', '');
        verifyToggle.setAttribute('aria-expanded', 'false');
      }
    }
  }, ['Verification details']);

  root.appendChild(
    el('section', { class: 'screen entry-detail' }, [
      topbar,
      el('div', { class: 'entry-detail-body' }, [
        el('h2', { class: 'entry-detail-title' }, [
          entry.payload?.title || '(untitled)'
        ]),
        tags.length ? el('div', { class: 'tag-row' }, tags) : null,
        el('p', { class: 'entry-detail-date' }, [formatDateTime(entry.created_at)]),
        entry.payload?.witness
          ? el('p', { class: 'entry-detail-meta' }, [
              el('strong', {}, ['Witness: ']),
              entry.payload.witness
            ])
          : null,
        entry.payload?.location
          ? el('p', { class: 'entry-detail-meta' }, [
              el('strong', {}, ['Location: ']),
              entry.payload.location
            ])
          : null,
        entry.payload?.followUpDate
          ? el('p', { class: 'entry-detail-meta' }, [
              el('strong', {}, ['Follow up by: ']),
              entry.payload.followUpDate
            ])
          : null,
        el('div', { class: 'entry-detail-content' }, [entry.payload?.content || '']),
        Array.isArray(entry.payload?.photos) && entry.payload.photos.length > 0
          ? el(
              'div',
              { class: 'photos-gallery', attrs: { 'aria-label': 'Attached photos' } },
              entry.payload.photos.map((p, i) =>
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'photo-tile',
                    attrs: { 'aria-label': `Open ${p.name || `photo ${i + 1}`}` },
                    onClick: () => openPhotoOverlay(p)
                  },
                  [
                    el('img', {
                      src: photoDataUrl(p),
                      alt: p.name || `photo ${i + 1}`,
                      attrs: { loading: 'lazy' }
                    })
                  ]
                )
              )
            )
          : null,
        Array.isArray(entry.payload?.audio) && entry.payload.audio.length > 0
          ? el(
              'div',
              { class: 'audio-list', attrs: { 'aria-label': 'Audio clips' } },
              entry.payload.audio.map((a, i) =>
                el('div', { class: 'audio-row' }, [
                  el('audio', {
                    controls: true,
                    src: audioDataUrl(a),
                    attrs: { preload: 'metadata' }
                  }),
                  el('span', { class: 'audio-name' }, [a.name || `clip ${i + 1}`])
                ])
              )
            )
          : null,
        el('div', { class: 'expandable' }, [verifyToggle, verifyBody])
      ].filter(Boolean))
    ])
  );
}
