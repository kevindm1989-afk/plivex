import * as app from '../app.js';
import * as installGate from './screens/install-gate.js';
import * as setup from './screens/setup.js';
import * as lock from './screens/lock.js';
import * as entryList from './screens/entry-list.js';
import * as entryForm from './screens/entry-form.js';
import * as entryDetail from './screens/entry-detail.js';
import * as settings from './screens/settings.js';
import * as certificate from './screens/certificate.js';
import * as help from './screens/help.js';
import * as printView from './screens/print-view.js';
import * as stats from './screens/stats.js';
import * as calendar from './screens/calendar.js';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

let currentScreen = null;
let currentParams = null;
let root = null;

const controller = {
  navigate(screen, params = {}) {
    currentScreen = screen;
    currentParams = params;
    return controller.refresh();
  },
  async refresh() {
    return draw();
  },
  getStatus: app.getStatus
};

async function draw() {
  if (!root) return;

  if (!isStandalone()) {
    installGate.render(root);
    return;
  }

  const status = (await app.getStatus()).status;

  if (status === 'unbooted') {
    return;
  }
  if (status === 'uninitialized') {
    setup.render(root, controller);
    return;
  }
  if (status === 'locked') {
    lock.render(root, controller);
    return;
  }

  // Unlocked: if a Web Share Target payload is waiting (stashed by the
  // service worker on ?share=pending), divert to entry-form pre-filled
  // with the shared content. Cleared from app + cache once consumed.
  const sharedPayload = app.getPendingShare();
  if (sharedPayload && currentScreen !== 'entry-form') {
    currentScreen = 'entry-form';
    currentParams = { mode: 'new', shared: sharedPayload };
    await app.clearPendingShare();
  }

  // unlocked
  if (currentScreen === 'entry-form') {
    return entryForm.render(root, controller, currentParams);
  }
  if (currentScreen === 'entry-detail') {
    return entryDetail.render(root, controller, currentParams);
  }
  if (currentScreen === 'settings') {
    return settings.render(root, controller);
  }
  if (currentScreen === 'certificate') {
    return certificate.render(root, controller);
  }
  if (currentScreen === 'help') {
    return help.render(root, controller);
  }
  if (currentScreen === 'print-view') {
    return printView.render(root, controller, currentParams);
  }
  if (currentScreen === 'stats') {
    return stats.render(root, controller);
  }
  if (currentScreen === 'calendar') {
    return calendar.render(root, controller);
  }
  return entryList.render(root, controller);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch {
    // Registration failure is non-fatal; the app still works online.
  }
}

async function start() {
  root = document.getElementById('root');
  if (!root) return;

  if (!isStandalone()) {
    installGate.render(root);
    return;
  }

  registerServiceWorker();

  // Activity listeners drive the auto-lock timer in app.js. Attached on
  // document so any user input anywhere in the app counts as activity.
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(ev, () => app.recordActivity(), { passive: true });
  }

  try {
    await app.bootstrap();
  } catch (err) {
    root.textContent = `Could not start: ${err.message}`;
    return;
  }

  // Web Share Target arrival: the SW redirected us with ?share=pending
  // and stashed the parsed payload in a transient cache. Load it before
  // first draw so the routing in draw() can divert to entry-form once
  // the user is unlocked. Clean the URL so a reload doesn't loop.
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('share') === 'pending') {
      await app.loadPendingShare();
      url.searchParams.delete('share');
      const cleaned = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
      window.history.replaceState(null, '', cleaned);
    }
  } catch {}

  await draw();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
