const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const showInstalledShell = () => {
  document.getElementById('install-prompt')?.setAttribute('hidden', '');
  document.getElementById('app')?.removeAttribute('hidden');
};

const showInstallPrompt = () => {
  document.getElementById('app')?.setAttribute('hidden', '');
  document.getElementById('install-prompt')?.removeAttribute('hidden');
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.error('Service worker registration failed:', err);
  }
};

const main = () => {
  if (isStandalone()) {
    showInstalledShell();
  } else {
    showInstallPrompt();
  }
  registerServiceWorker();
};

main();
