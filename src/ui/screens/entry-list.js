import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconGear, iconLock, iconPlus } from '../icons.js';
import * as app from '../../app.js';

function entryTitle(payload) {
  if (payload && typeof payload === 'object' && typeof payload.title === 'string' && payload.title) {
    return payload.title;
  }
  return '(untitled)';
}

function entryPreview(payload) {
  const text = payload && typeof payload === 'object' && typeof payload.content === 'string'
    ? payload.content
    : '';
  if (!text) return '';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

export async function render(root, controller) {
  clear(root);

  const screen = el('section', { class: 'screen entry-list' });
  root.appendChild(screen);

  // Top bar
  const topbar = el('header', { class: 'topbar' }, [
    el('h1', { class: 'topbar-title' }, ['Plivex']),
    el('div', { class: 'topbar-actions' }, [
      el('button', {
        type: 'button',
        class: 'icon-button',
        attrs: { 'aria-label': 'Settings' },
        onClick: () => controller.navigate('settings')
      }, [svgFromString(iconGear())]),
      el('button', {
        type: 'button',
        class: 'icon-button',
        attrs: { 'aria-label': 'Lock' },
        onClick: async () => {
          await app.lock();
          controller.refresh();
        }
      }, [svgFromString(iconLock())])
    ])
  ]);
  screen.appendChild(topbar);

  // Compose action
  const composeBtn = Button({
    label: 'New entry',
    full: true,
    icon: svgFromString(iconPlus()),
    onClick: () => controller.navigate('entry-form', { mode: 'new' })
  });
  composeBtn.classList.add('compose-btn');
  screen.appendChild(composeBtn);

  // Loading then list
  const listEl = el('ul', { class: 'entry-rows', attrs: { 'aria-busy': 'true' } }, [
    el('li', { class: 'entry-row-loading' }, ['Loading…'])
  ]);
  screen.appendChild(listEl);

  let entries;
  try {
    entries = await app.listEntries();
  } catch (err) {
    listEl.innerHTML = '';
    listEl.appendChild(el('li', { class: 'entry-row-error' }, ['Failed to load entries.']));
    return;
  }

  // Mark superseded ones based on supersedes references.
  const supersededUuids = new Set();
  for (const e of entries) {
    if (e.supersedes) supersededUuids.add(e.supersedes);
  }

  // Display newest first.
  entries.reverse();

  listEl.removeAttribute('aria-busy');
  clear(listEl);

  if (entries.length === 0) {
    screen.appendChild(
      el('div', { class: 'empty-state' }, [
        el('p', {}, ['No entries yet. Tap + to add one.'])
      ])
    );
    return;
  }

  for (const entry of entries) {
    const isSuperseded = supersededUuids.has(entry.uuid);
    const isEdit = entry.supersedes !== undefined;
    const row = el('li', {
      class: 'entry-row' + (isSuperseded ? ' superseded' : ''),
      attrs: { tabindex: '0', role: 'button' },
      onClick: () => controller.navigate('entry-detail', { id: entry.id }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          controller.navigate('entry-detail', { id: entry.id });
        }
      }
    }, [
      el('div', { class: 'entry-row-header' }, [
        el('h2', { class: 'entry-row-title' }, [entryTitle(entry.payload)]),
        isSuperseded ? el('span', { class: 'tag tag-muted' }, ['superseded']) : null,
        isEdit ? el('span', { class: 'tag' }, ['edited']) : null
      ].filter(Boolean)),
      el('p', { class: 'entry-row-meta' }, [formatDateTime(entry.created_at)]),
      entryPreview(entry.payload)
        ? el('p', { class: 'entry-row-preview' }, [entryPreview(entry.payload)])
        : null
    ].filter(Boolean));
    listEl.appendChild(row);
  }
}
