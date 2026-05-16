import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconGear, iconLock, iconPlus, iconCalendar } from '../icons.js';
import { TEMPLATES } from '../templates.js';
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
  // Attachment filenames are user-meaningful; let them match search.
  for (const collection of ['photos', 'audio', 'files']) {
    const arr = p[collection];
    if (!Array.isArray(arr)) continue;
    for (const a of arr) {
      if (a && typeof a.name === 'string' && a.name.toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

function entryMatchesDateRange(entry, from, to) {
  if (!from && !to) return true;
  const day = typeof entry.created_at === 'string' ? entry.created_at.slice(0, 10) : '';
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// Local-zone "YYYY-MM-DD". Avoids the off-by-one near midnight that
// toISOString() (UTC) would produce for users in non-UTC zones.
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

function followUpStatus(entry, supersededUuids) {
  const due = entry.payload?.followUpDate;
  if (typeof due !== 'string' || !DUE_RE.test(due)) return null;
  if (supersededUuids.has(entry.uuid)) return null;
  const today = todayISO();
  if (due < today) {
    const dueMs = Date.parse(due + 'T00:00:00Z');
    const todayMs = Date.parse(today + 'T00:00:00Z');
    if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) {
      return { kind: 'overdue', label: 'Overdue', date: due };
    }
    const days = Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000));
    return { kind: 'overdue', label: `Overdue ${days}d`, date: due };
  }
  if (due === today) return { kind: 'due', label: 'Due today', date: due };
  return { kind: 'future', label: `Follow-up ${due}`, date: due };
}

// Split `text` into an array of strings and <mark> elements based on
// case-insensitive matches of `query`. Empty query returns a single
// string. Children-shaped: works directly as el() children.
function highlightMatches(text, query) {
  if (!query || !text) return [text];
  const t = String(text);
  const q = query.toLowerCase();
  const lower = t.toLowerCase();
  const out = [];
  let i = 0;
  while (i < t.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      out.push(t.slice(i));
      break;
    }
    if (idx > i) out.push(t.slice(i, idx));
    out.push(el('mark', {}, [t.slice(idx, idx + q.length)]));
    i = idx + q.length;
  }
  return out;
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
          attrs: { 'aria-label': 'Calendar' },
          onClick: () => controller.navigate('calendar')
        },
        [svgFromString(iconCalendar())]
      ),
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

  // Load entries up front so we can compute the follow-up-due count for
  // the banner row. (Was previously loaded later, which left the
  // followUpDueCount reference below in a temporal dead zone and threw a
  // ReferenceError that aborted the entire render — see the v1.14.1
  // hotfix note in CHANGELOG.md.)
  let entries;
  try {
    entries = await app.listEntries();
  } catch (err) {
    screen.appendChild(
      el('p', { class: 'entry-row-error' }, ['Failed to load entries.'])
    );
    return;
  }

  // Pre-compute superseded uuids and follow-up-due count over the
  // chronological entries (pre-reverse).
  const supersededUuids = new Set();
  for (const e of entries) {
    if (e.supersedes) supersededUuids.add(e.supersedes);
  }
  let followUpDueCount = 0;
  for (const e of entries) {
    const s = followUpStatus(e, supersededUuids);
    if (s && (s.kind === 'due' || s.kind === 'overdue')) followUpDueCount++;
  }

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

  if (followUpDueCount > 0) {
    screen.appendChild(
      el('div', { class: 'reminder-banner reminder-banner-warn', role: 'status' }, [
        el('span', { class: 'reminder-message' }, [
          `${followUpDueCount} entr${followUpDueCount === 1 ? 'y' : 'ies'} need follow-up.`
        ])
      ])
    );
  }

  // Quick-add templates: one tap → pre-filled entry form. Renders above
  // the blank-slate compose button so the fast path is the first thing
  // the user sees on the entry list.
  const quickAdd = el('div', { class: 'quick-add', attrs: { 'aria-label': 'Quick add' } }, [
    el('span', { class: 'quick-add-label' }, ['Quick add'])
  ]);
  for (const tpl of TEMPLATES) {
    quickAdd.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'quick-add-chip',
          onClick: () => controller.navigate('entry-form', { mode: 'new', template: tpl.id })
        },
        [tpl.label]
      )
    );
  }
  screen.appendChild(quickAdd);

  // Compose action.
  const composeBtn = Button({
    label: 'New entry',
    full: true,
    icon: svgFromString(iconPlus()),
    onClick: () => controller.navigate('entry-form', { mode: 'new' })
  });
  composeBtn.classList.add('compose-btn');
  screen.appendChild(composeBtn);

  // Entries are computed up front; reverse for newest-first. The list
  // container is appended after the filter bar below (single append).
  entries.reverse();
  const listEl = el('div', { class: 'entry-list-content' });

  if (entries.length === 0) {
    screen.appendChild(
      el('div', { class: 'empty-state' }, [
        el('p', {}, ['No entries yet. Tap + to add one.']),
        el('p', {}, [
          el(
            'button',
            {
              type: 'button',
              class: 'link-button',
              onClick: () => controller.navigate('help')
            },
            ['Read the help guide first']
          )
        ])
      ])
    );
    return;
  }

  // Build the filter bar.
  let searchQuery = '';
  let typeFilter = '';
  let fromDate = '';
  let toDate = '';

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

  const fromInput = el('input', {
    type: 'date',
    id: 'filter-date-from',
    class: 'date-input',
    attrs: { 'aria-label': 'From date' },
    onInput: (e) => {
      fromDate = e.target.value;
      applyFilters();
    }
  });
  const toInput = el('input', {
    type: 'date',
    id: 'filter-date-to',
    class: 'date-input',
    attrs: { 'aria-label': 'To date' },
    onInput: (e) => {
      toDate = e.target.value;
      applyFilters();
    }
  });
  const dateRange = el('div', { class: 'date-range' }, [
    el('label', { for: 'filter-date-from', class: 'date-range-label' }, ['From']),
    fromInput,
    el('label', { for: 'filter-date-to', class: 'date-range-label' }, ['To']),
    toInput
  ]);

  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'link-button filter-clear',
      hidden: true,
      onClick: () => {
        searchQuery = '';
        typeFilter = '';
        fromDate = '';
        toDate = '';
        searchInput.value = '';
        fromInput.value = '';
        toInput.value = '';
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
      ? [searchInput, chipsContainer, dateRange, clearBtn]
      : [searchInput, dateRange, clearBtn]
  );
  screen.appendChild(filterBar);

  // Group rendering target.
  screen.appendChild(listEl);

  function entryRow(entry) {
    const isSuperseded = supersededUuids.has(entry.uuid);
    const isEdit = entry.supersedes !== undefined;
    const isDecryptFailed = entry.decryptError !== undefined;
    const fu = followUpStatus(entry, supersededUuids);
    const titleNodes = isDecryptFailed
      ? [`[Could not decrypt — entry #${entry.id}]`]
      : highlightMatches(entryTitle(entry.payload), searchQuery);
    return el(
      'li',
      {
        class:
          'entry-row' +
          (isSuperseded ? ' superseded' : '') +
          (isDecryptFailed ? ' entry-row-error-row' : ''),
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
            el('h3', { class: 'entry-row-title' }, titleNodes),
            isDecryptFailed
              ? el('span', { class: 'tag tag-decrypt-failed' }, ['decrypt failed'])
              : null,
            entry.payload?.type
              ? el('span', { class: 'tag tag-type' }, [entry.payload.type])
              : null,
            fu
              ? el('span', { class: `tag tag-followup tag-followup-${fu.kind}` }, [fu.label])
              : null,
            Array.isArray(entry.payload?.photos) && entry.payload.photos.length > 0
              ? el('span', { class: 'tag tag-photos' }, [
                  `${entry.payload.photos.length} photo${entry.payload.photos.length === 1 ? '' : 's'}`
                ])
              : null,
            Array.isArray(entry.payload?.audio) && entry.payload.audio.length > 0
              ? el('span', { class: 'tag tag-audio' }, [
                  `${entry.payload.audio.length} audio`
                ])
              : null,
            Array.isArray(entry.payload?.files) && entry.payload.files.length > 0
              ? el('span', { class: 'tag tag-files' }, [
                  `${entry.payload.files.length} file${entry.payload.files.length === 1 ? '' : 's'}`
                ])
              : null,
            isSuperseded ? el('span', { class: 'tag tag-muted' }, ['superseded']) : null,
            isEdit ? el('span', { class: 'tag' }, ['edited']) : null
          ].filter(Boolean)
        ),
        el('p', { class: 'entry-row-meta' }, [formatDateTime(entry.created_at)]),
        entryPreview(entry.payload)
          ? el('p', { class: 'entry-row-preview' },
              highlightMatches(entryPreview(entry.payload), searchQuery)
            )
          : null
      ].filter(Boolean)
    );
  }

  function applyFilters() {
    const active = !!(searchQuery || typeFilter || fromDate || toDate);
    if (active) clearBtn.removeAttribute('hidden');
    else clearBtn.setAttribute('hidden', '');

    const filtered = entries.filter(
      (e) =>
        entryMatchesText(e, searchQuery) &&
        (!typeFilter || e.payload?.type === typeFilter) &&
        entryMatchesDateRange(e, fromDate, toDate)
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
