import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { iconBack } from '../icons.js';
import * as app from '../../app.js';

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthKey(iso) {
  return typeof iso === 'string' ? iso.slice(0, 7) : '';
}

function dayKey(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

function monthLabel(key) {
  const [y, m] = key.split('-').map((s) => Number(s));
  return new Date(y, m - 1, 1).toLocaleString(undefined, { year: 'numeric', month: 'long' });
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

// Monday-first day-of-week index (0 = Mon, 6 = Sun)
function dowMondayFirst(date) {
  const d = date.getDay();
  return (d + 6) % 7;
}

export async function render(root, controller) {
  clear(root);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('entry-list')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Calendar'])
  ]);

  const screen = el('section', { class: 'screen calendar-screen' }, [topbar]);
  root.appendChild(screen);

  let entries;
  try {
    entries = await app.listEntries();
  } catch (err) {
    screen.appendChild(el('p', { class: 'screen-error' }, [`Failed to load: ${err.message}`]));
    return;
  }

  if (entries.length === 0) {
    screen.appendChild(
      el('p', { class: 'empty-state' }, ['No entries yet.'])
    );
    return;
  }

  // Group entries by day (newest at the back of the array, which is fine).
  // Iterate to bucket per yyyy-mm-dd, keeping months in descending order.
  const byMonth = new Map(); // key 'YYYY-MM' -> Map<day, entries[]>
  for (const e of entries) {
    const k = monthKey(e.created_at);
    if (!k) continue;
    const dk = dayKey(e.created_at);
    if (!byMonth.has(k)) byMonth.set(k, new Map());
    const inner = byMonth.get(k);
    if (!inner.has(dk)) inner.set(dk, []);
    inner.get(dk).push(e);
  }
  const monthKeys = [...byMonth.keys()].sort().reverse();

  screen.appendChild(
    el('p', { class: 'lede' }, [
      'Calendar view of entries by day. Months are shown newest first. Tap a date with entries to see the day\'s entries below.'
    ])
  );

  let expandedDay = null;
  const expandedBox = el('div', { class: 'calendar-day-detail', hidden: true });

  function renderExpanded() {
    clear(expandedBox);
    if (!expandedDay) {
      expandedBox.setAttribute('hidden', '');
      return;
    }
    expandedBox.removeAttribute('hidden');
    const list = [];
    for (const m of monthKeys) {
      const inner = byMonth.get(m);
      if (inner.has(expandedDay)) {
        for (const e of inner.get(expandedDay)) list.push(e);
      }
    }
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    expandedBox.appendChild(
      el('h2', { class: 'calendar-day-heading' }, [expandedDay])
    );
    if (list.length === 0) {
      expandedBox.appendChild(el('p', { class: 'empty-state' }, ['No entries on this day.']));
      return;
    }
    const ul = el('ul', { class: 'calendar-day-list' });
    for (const e of list) {
      ul.appendChild(
        el('li', {}, [
          el('button', {
            type: 'button',
            class: 'link-button',
            onClick: () => controller.navigate('entry-detail', { id: e.id })
          }, [
            `${formatDateTime(e.created_at)} · ${e.payload?.title || '(untitled)'}`
          ])
        ])
      );
    }
    expandedBox.appendChild(ul);
  }

  for (const mk of monthKeys) {
    const [y, m] = mk.split('-').map((s) => Number(s));
    const dim = daysInMonth(y, m - 1);
    const firstDow = dowMondayFirst(new Date(y, m - 1, 1));
    const grid = el('div', { class: 'calendar-grid' });
    for (const lbl of DOW_LABELS) {
      grid.appendChild(el('div', { class: 'calendar-dow' }, [lbl]));
    }
    for (let i = 0; i < firstDow; i++) {
      grid.appendChild(el('div', { class: 'calendar-cell calendar-cell-blank' }));
    }
    const inner = byMonth.get(mk);
    for (let d = 1; d <= dim; d++) {
      const dk = `${mk}-${String(d).padStart(2, '0')}`;
      const list = inner.get(dk) || [];
      const isToday = dk === new Date().toISOString().slice(0, 10);
      const has = list.length > 0;
      const cell = el(
        has ? 'button' : 'div',
        {
          class:
            'calendar-cell' +
            (has ? ' calendar-cell-has' : '') +
            (isToday ? ' calendar-cell-today' : ''),
          ...(has
            ? {
                type: 'button',
                attrs: { 'aria-label': `${dk}: ${list.length} entries` },
                onClick: () => {
                  expandedDay = dk;
                  renderExpanded();
                  expandedBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }
            : {})
        },
        [
          el('span', { class: 'calendar-cell-day' }, [String(d)]),
          has ? el('span', { class: 'calendar-cell-count' }, [String(list.length)]) : null
        ].filter(Boolean)
      );
      grid.appendChild(cell);
    }
    screen.appendChild(
      el('section', { class: 'calendar-month' }, [
        el('h2', { class: 'calendar-month-heading' }, [monthLabel(mk)]),
        grid
      ])
    );
  }

  screen.appendChild(expandedBox);
}
