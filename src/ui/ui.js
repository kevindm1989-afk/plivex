import * as app from '../app.js';
import * as installGate from './screens/install-gate.js';
import * as setup from './screens/setup.js';
import * as lock from './screens/lock.js';
import * as entryList from './screens/entry-list.js';
import * as entryForm from './screens/entry-form.js';
import * as entryDetail from './screens/entry-detail.js';
import * as settings from './screens/settings.js';
import * as certificate from './screens/certificate.js';

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
  await draw();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
