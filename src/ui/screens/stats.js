import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconBack } from '../icons.js';
import * as app from '../../app.js';

function svgEl(tag, props = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v === null || v === undefined) continue;
    node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) {
    if (c) node.appendChild(c);
  }
  return node;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map((s) => Number(s));
  return new Date(y, m - 1, 1).toLocaleString(undefined, { year: 'numeric', month: 'short' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statRow(label, count, pctOfMax) {
  const safePct = Math.max(0, Math.min(100, pctOfMax));
  const bar = svgEl('svg', {
    class: 'stat-bar',
    viewBox: '0 0 100 6',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true'
  }, [
    svgEl('rect', { x: 0, y: 0, width: safePct, height: 6, rx: 1 })
  ]);
  return el('div', { class: 'stat-row' }, [
    el('span', { class: 'stat-row-label' }, [label]),
    bar,
    el('span', { class: 'stat-row-count' }, [String(count)])
  ]);
}

function statBlock(title, body) {
  const children = [el('h2', { class: 'stat-block-title' }, [title])];
  for (const b of body) children.push(b);
  return el('section', { class: 'stat-block' }, children);
}

export async function render(root, controller) {
  clear(root);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('settings')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Statistics'])
  ]);

  const screen = el('section', { class: 'screen stats-screen' }, [topbar]);
  root.appendChild(screen);

  let entries;
  try {
    entries = await app.listEntries();
  } catch (err) {
    screen.appendChild(el('p', { class: 'screen-error' }, [`Failed to load: ${err.message}`]));
    return;
  }

  const supersededUuids = new Set();
  for (const e of entries) if (e.supersedes) supersededUuids.add(e.supersedes);
  const liveEntries = entries.filter((e) => !supersededUuids.has(e.uuid));

  if (entries.length === 0) {
    screen.appendChild(
      el('p', { class: 'empty-state' }, ['No entries yet. Stats will appear once you start writing.'])
    );
    return;
  }

  // Date span
  const sorted = [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // By type (only live entries)
  const typeCounts = new Map();
  for (const e of liveEntries) {
    const t = e.payload?.type || '(no type)';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const typeRows = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const typeMax = typeRows.length ? typeRows[0][1] : 1;

  // By month (live entries, last 12 calendar months)
  const monthCounts = new Map();
  for (const e of liveEntries) {
    const k = (e.created_at || '').slice(0, 7);
    if (k) monthCounts.set(k, (monthCounts.get(k) || 0) + 1);
  }
  const monthRows = [...monthCounts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const monthMax = monthRows.reduce((m, [, c]) => Math.max(m, c), 1);

  // Attachments
  let photoCount = 0;
  let photoEntries = 0;
  let audioCount = 0;
  let audioEntries = 0;
  for (const e of liveEntries) {
    if (Array.isArray(e.payload?.photos) && e.payload.photos.length > 0) {
      photoEntries++;
      photoCount += e.payload.photos.length;
    }
    if (Array.isArray(e.payload?.audio) && e.payload.audio.length > 0) {
      audioEntries++;
      audioCount += e.payload.audio.length;
    }
  }

  // Follow-ups
  const today = todayISO();
  const weekISO = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  let fuOverdue = 0;
  let fuToday = 0;
  let fuThisWeek = 0;
  let fuFuture = 0;
  for (const e of liveEntries) {
    const d = e.payload?.followUpDate;
    if (!d || typeof d !== 'string') continue;
    if (d < today) fuOverdue++;
    else if (d === today) fuToday++;
    else if (d <= weekISO) fuThisWeek++;
    else fuFuture++;
  }

  // Overview
  screen.appendChild(
    statBlock('Overview', [
      el('dl', { class: 'stat-defs' }, [
        el('dt', {}, ['Active entries']),
        el('dd', {}, [String(liveEntries.length)]),
        el('dt', {}, ['All-time records (incl. supersedes)']),
        el('dd', {}, [String(entries.length)]),
        el('dt', {}, ['First entry']),
        el('dd', {}, [formatDateTime(first.created_at)]),
        el('dt', {}, ['Most recent entry']),
        el('dd', {}, [formatDateTime(last.created_at)])
      ])
    ])
  );

  // By type
  screen.appendChild(
    statBlock('By type', typeRows.length === 0
      ? [el('p', { class: 'empty-state' }, ['No type data.'])]
      : typeRows.map(([t, c]) => statRow(t, c, (c / typeMax) * 100))
    )
  );

  // By month
  screen.appendChild(
    statBlock('By month (last 12)', monthRows.length === 0
      ? [el('p', { class: 'empty-state' }, ['No month data.'])]
      : monthRows.map(([k, c]) => statRow(monthLabel(k), c, (c / monthMax) * 100))
    )
  );

  // Follow-ups
  screen.appendChild(
    statBlock('Follow-ups', [
      el('dl', { class: 'stat-defs' }, [
        el('dt', { class: 'fu-overdue' }, ['Overdue']),
        el('dd', { class: 'fu-overdue' }, [String(fuOverdue)]),
        el('dt', { class: 'fu-due' }, ['Due today']),
        el('dd', { class: 'fu-due' }, [String(fuToday)]),
        el('dt', {}, ['This week']),
        el('dd', {}, [String(fuThisWeek)]),
        el('dt', {}, ['Future']),
        el('dd', {}, [String(fuFuture)])
      ])
    ])
  );

  // Attachments
  screen.appendChild(
    statBlock('Attachments', [
      el('dl', { class: 'stat-defs' }, [
        el('dt', {}, ['Photos']),
        el('dd', {}, [`${photoCount} across ${photoEntries} entries`]),
        el('dt', {}, ['Audio clips']),
        el('dd', {}, [`${audioCount} across ${audioEntries} entries`])
      ])
    ])
  );

  // Storage
  const est = await app.getStorageEstimate();
  if (est) {
    const pct = est.quota > 0 ? (est.usage / est.quota) * 100 : 0;
    screen.appendChild(
      statBlock('Storage', [
        el('p', {}, [
          est.quota > 0
            ? `Using ${formatBytes(est.usage)} of ${formatBytes(est.quota)} (${pct.toFixed(1)}%)`
            : `Using ${formatBytes(est.usage)}`
        ])
      ])
    );
  }
}
