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
  const text =
    payload && typeof payload === 'object' && typeof payload.content === 'string'
      ? payload.content
      : '';
  if (!text) return '';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

const MONTH_LABEL = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'long' });
};
const MONTH_KEY = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function entryMatchesText(entry, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const p = entry.payload ?? {};
  for (const field of ['title', 'content', 'witness', 'location', 'type']) {
    const v = p[field];
    if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
  }
  return false;
}

export async function render(root, controller) {
  clear(root);

  const screen = el('section', { class: 'screen entry-list' });
  root.appendChild(screen);

  const topbar = el('header', { class: 'topbar' }, [
    el('h1', { class: 'topbar-title' }, ['Plivex']),
    el('div', { class: 'topbar-actions' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'icon-button',
          attrs: { 'aria-label': 'Settings' },
          onClick: () => controller.navigate('settings')
        },
        [svgFromString(iconGear())]
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-button',
          attrs: { 'aria-label': 'Lock' },
          onClick: async () => {
            await app.lock();
            controller.refresh();
          }
        },
        [svgFromString(iconLock())]
      )
    ])
  ]);
  screen.appendChild(topbar);

  // Reminder banners (conditional, best-effort).
  try {
    if (await app.shouldRemindBackup()) {
      screen.appendChild(
        el('div', { class: 'reminder-banner', role: 'status' }, [
          el('span', { class: 'reminder-message' }, [
            'You haven\'t exported a backup recently.'
          ]),
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onClick: () => controller.navigate('settings')
            },
            ['Export now']
          )
        ])
      );
    }
  } catch {}
  try {
    if (await app.shouldRemindVerify()) {
      screen.appendChild(
        el('div', { class: 'reminder-banner', role: 'status' }, [
          el('span', { class: 'reminder-message' }, [
            'Chain integrity hasn\'t been verified recently.'
          ]),
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onClick: () => controller.navigate('settings')
            },
            ['Verify now']
          )
        ])
      );
    }
  } catch {}

  // Compose action.
  const composeBtn = Button({
    label: 'New entry',
    full: true,
    icon: svgFromString(iconPlus()),
    onClick: () => controller.navigate('entry-form', { mode: 'new' })
  });
  composeBtn.classList.add('compose-btn');
  screen.appendChild(composeBtn);

  // Loading placeholder until entries arrive.
  const listEl = el('div', {
    class: 'entry-list-content',
    attrs: { 'aria-busy': 'true' }
  }, [el('p', { class: 'entry-row-loading' }, ['Loading…'])]);
  screen.appendChild(listEl);

  let entries;
  try {
    entries = await app.listEntries();
  } catch (err) {
    clear(listEl);
    listEl.removeAttribute('aria-busy');
    listEl.appendChild(el('p', { class: 'entry-row-error' }, ['Failed to load entries.']));
    return;
  }

  // Pre-compute index of superseded uuids and reverse for newest-first.
  const supersededUuids = new Set();
  for (const e of entries) {
    if (e.supersedes) supersededUuids.add(e.supersedes);
  }
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

  // Build the filter bar.
  let searchQuery = '';
  let typeFilter = '';

  const distinctTypes = Array.from(
    new Set(entries.map((e) => e.payload?.type).filter((t) => typeof t === 'string' && t))
  ).sort();

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search entries…',
    autocomplete: 'off',
    attrs: { 'aria-label': 'Search entries' },
    onInput: (e) => {
      searchQuery = e.target.value;
      applyFilters();
    }
  });

  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'link-button filter-clear',
      hidden: true,
      onClick: () => {
        searchQuery = '';
        typeFilter = '';
        searchInput.value = '';
        renderChips();
        applyFilters();
      }
    },
    ['Clear filters']
  );

  const chipsContainer = el('div', { class: 'filter-chips', attrs: { role: 'group', 'aria-label': 'Filter by type' } });

  function renderChips() {
    clear(chipsContainer);
    if (distinctTypes.length === 0) return;
    for (const t of distinctTypes) {
      const isActive = typeFilter === t;
      const chip = el(
        'button',
        {
          type: 'button',
          class: 'filter-chip' + (isActive ? ' filter-chip-active' : ''),
          attrs: { 'aria-pressed': isActive ? 'true' : 'false' },
          onClick: () => {
            typeFilter = isActive ? '' : t;
            renderChips();
            applyFilters();
          }
        },
        [t]
      );
      chipsContainer.appendChild(chip);
    }
  }
  renderChips();

  const filterBar = el(
    'div',
    { class: 'filter-bar' },
    distinctTypes.length > 0
      ? [searchInput, chipsContainer, clearBtn]
      : [searchInput, clearBtn]
  );
  screen.appendChild(filterBar);

  // Group rendering target.
  screen.appendChild(listEl);

  function entryRow(entry) {
    const isSuperseded = supersededUuids.has(entry.uuid);
    const isEdit = entry.supersedes !== undefined;
    return el(
      'li',
      {
        class: 'entry-row' + (isSuperseded ? ' superseded' : ''),
        attrs: { tabindex: '0', role: 'button' },
        onClick: () => controller.navigate('entry-detail', { id: entry.id }),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            controller.navigate('entry-detail', { id: entry.id });
          }
        }
      },
      [
        el(
          'div',
          { class: 'entry-row-header' },
          [
            el('h3', { class: 'entry-row-title' }, [entryTitle(entry.payload)]),
            entry.payload?.type
              ? el('span', { class: 'tag tag-type' }, [entry.payload.type])
              : null,
            isSuperseded ? el('span', { class: 'tag tag-muted' }, ['superseded']) : null,
            isEdit ? el('span', { class: 'tag' }, ['edited']) : null
          ].filter(Boolean)
        ),
        el('p', { class: 'entry-row-meta' }, [formatDateTime(entry.created_at)]),
        entryPreview(entry.payload)
          ? el('p', { class: 'entry-row-preview' }, [entryPreview(entry.payload)])
          : null
      ].filter(Boolean)
    );
  }

  function applyFilters() {
    const active = !!(searchQuery || typeFilter);
    if (active) clearBtn.removeAttribute('hidden');
    else clearBtn.setAttribute('hidden', '');

    const filtered = entries.filter(
      (e) =>
        entryMatchesText(e, searchQuery) &&
        (!typeFilter || e.payload?.type === typeFilter)
    );

    clear(listEl);

    if (filtered.length === 0) {
      listEl.appendChild(
        el('p', { class: 'empty-state filter-empty' }, [
          'No entries match your filters.'
        ])
      );
      return;
    }

    // Group by year-month (entries are already newest-first, so the natural
    // iteration order produces month groups in descending order).
    let currentKey = null;
    let currentList = null;
    for (const e of filtered) {
      const key = MONTH_KEY(e.created_at);
      if (key !== currentKey) {
        currentKey = key;
        listEl.appendChild(
          el('h2', { class: 'month-header' }, [MONTH_LABEL(e.created_at)])
        );
        currentList = el('ul', { class: 'entry-rows' });
        listEl.appendChild(currentList);
      }
      currentList.appendChild(entryRow(e));
    }
  }

  applyFilters();
}
