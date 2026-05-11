import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconBack } from '../icons.js';
import * as app from '../../app.js';

function photoDataUrl(photo) {
  return `data:${photo.type || 'image/jpeg'};base64,${photo.dataB64}`;
}

function audioSummary(a) {
  const sizeMb = a.dataB64 ? ((a.dataB64.length * 0.75) / 1024 / 1024).toFixed(2) : '?';
  return `Audio: ${a.name || 'unnamed'} (${a.type || 'unknown type'}, ~${sizeMb} MB)`;
}

function entryInRange(entry, from, to) {
  if (!from && !to) return true;
  const day = typeof entry.created_at === 'string' ? entry.created_at.slice(0, 10) : '';
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function renderEntry(entry, supersededUuids) {
  const isSuperseded = supersededUuids.has(entry.uuid);
  const isEdit = entry.supersedes !== undefined;
  const tags = [];
  if (entry.payload?.type) tags.push(entry.payload.type);
  if (isSuperseded) tags.push('SUPERSEDED');
  if (isEdit) tags.push('EDITED');

  const children = [
    el('div', { class: 'print-entry-head' }, [
      el('h2', { class: 'print-entry-title' }, [entry.payload?.title || '(untitled)']),
      el('p', { class: 'print-entry-meta' }, [
        `Entry #${entry.id} · ${formatDateTime(entry.created_at)}`
      ]),
      tags.length
        ? el('p', { class: 'print-entry-tags' }, [tags.join(' · ')])
        : null
    ].filter(Boolean))
  ];

  if (entry.payload?.witness) {
    children.push(
      el('p', { class: 'print-meta-line' }, [
        el('strong', {}, ['Witness: ']),
        entry.payload.witness
      ])
    );
  }
  if (entry.payload?.location) {
    children.push(
      el('p', { class: 'print-meta-line' }, [
        el('strong', {}, ['Location: ']),
        entry.payload.location
      ])
    );
  }
  if (entry.payload?.followUpDate) {
    children.push(
      el('p', { class: 'print-meta-line' }, [
        el('strong', {}, ['Follow up by: ']),
        entry.payload.followUpDate
      ])
    );
  }

  if (entry.payload?.content) {
    children.push(el('div', { class: 'print-content' }, [entry.payload.content]));
  }

  if (Array.isArray(entry.payload?.photos) && entry.payload.photos.length > 0) {
    children.push(
      el(
        'div',
        { class: 'print-photos' },
        entry.payload.photos.map((p) =>
          el('img', {
            class: 'print-photo',
            src: photoDataUrl(p),
            alt: p.name || ''
          })
        )
      )
    );
  }

  if (Array.isArray(entry.payload?.audio) && entry.payload.audio.length > 0) {
    children.push(
      el(
        'ul',
        { class: 'print-audio-list' },
        entry.payload.audio.map((a) => el('li', {}, [audioSummary(a)]))
      )
    );
  }

  children.push(
    el('dl', { class: 'print-hash' }, [
      el('dt', {}, ['UUID']),
      el('dd', { class: 'mono small' }, [entry.uuid]),
      el('dt', {}, ['Entry hash']),
      el('dd', { class: 'mono small' }, [entry.entry_hash]),
      el('dt', {}, ['Previous hash']),
      el('dd', { class: 'mono small' }, [entry.prev_hash]),
      ...(entry.supersedes
        ? [
            el('dt', {}, ['Supersedes (UUID)']),
            el('dd', { class: 'mono small' }, [entry.supersedes])
          ]
        : [])
    ])
  );

  return el('article', { class: 'print-entry' }, children);
}

export async function render(root, controller, params = {}) {
  clear(root);

  const mode = params.mode === 'single' ? 'single' : 'archive';
  const from = typeof params.from === 'string' ? params.from : '';
  const to = typeof params.to === 'string' ? params.to : '';

  let entries = [];
  let single = null;
  try {
    if (mode === 'single' && params.id !== undefined) {
      single = await app.getEntry(params.id);
      if (single) entries = [single];
    } else {
      entries = await app.listEntries();
      entries = entries.filter((e) => entryInRange(e, from, to));
    }
  } catch (err) {
    root.appendChild(el('p', { class: 'screen-error' }, [`Failed to load: ${err.message}`]));
    return;
  }

  const certData = await app.getCertificateData();

  const backTarget = mode === 'single'
    ? () => controller.navigate('entry-detail', { id: params.id })
    : () => controller.navigate('settings');

  const printBtn = Button({
    label: 'Print / Save as PDF',
    onClick: () => window.print()
  });
  printBtn.classList.add('no-print');

  const topbar = el('header', { class: 'topbar no-print' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: backTarget
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, [
      mode === 'single' ? 'Print entry' : 'Print archive'
    ]),
    el('div', { class: 'topbar-actions' }, [printBtn])
  ]);

  const supersededUuids = new Set();
  for (const e of entries) if (e.supersedes) supersededUuids.add(e.supersedes);

  const headerInfo = [
    el('h1', { class: 'print-doc-title' }, ['Plivex records']),
    el('p', { class: 'print-doc-sub' }, [
      `Generated ${formatDateTime(new Date().toISOString())} · Plivex v${app.APP_VERSION}`
    ]),
    el('dl', { class: 'print-chain-summary' }, [
      el('dt', {}, ['Entries in this document']),
      el('dd', {}, [String(entries.length)]),
      el('dt', {}, ['Total entries in chain']),
      el('dd', {}, [String(certData.total_entries)]),
      el('dt', {}, ['Current chain head']),
      el('dd', { class: 'mono small' }, [certData.chain_head]),
      ...(mode === 'archive' && (from || to)
        ? [
            el('dt', {}, ['Date range']),
            el('dd', {}, [`${from || '…'} → ${to || '…'}`])
          ]
        : [])
    ])
  ];

  const body = el('div', { class: 'print-doc' });
  for (const h of headerInfo) body.appendChild(h);

  if (entries.length === 0) {
    body.appendChild(
      el('p', { class: 'empty-state' }, [
        mode === 'single'
          ? 'Entry not found.'
          : 'No entries match this filter.'
      ])
    );
  } else {
    for (const e of entries) {
      body.appendChild(renderEntry(e, supersededUuids));
    }
  }

  body.appendChild(
    el('footer', { class: 'print-doc-footer' }, [
      el('p', {}, [
        'This document was generated by Plivex from records stored locally on the holder\'s device. Each entry above shows its SHA-256 hash and the previous entry\'s hash; the chain head shown in the header anchors the whole sequence. Anyone with this document can verify the chain by running Plivex on the source data and comparing the hashes.'
      ])
    ])
  );

  root.appendChild(
    el('section', { class: 'screen print-screen' }, [topbar, body])
  );
}
