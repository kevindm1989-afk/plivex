import { el, clear } from '../dom.js';
import { Button } from './button.js';

// True when this browser exposes the MediaRecorder + getUserMedia stack.
// On unsupported platforms the recorder UI hides itself; file upload
// remains available as a fallback path.
export function recordingSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window.MediaRecorder === 'function'
  );
}

function pickMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const m of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return '';
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// Returns a DOM node that can be appended into the form. The component
// owns its own internal state machine: idle / requesting / recording /
// stopped (transient). On a successful capture it invokes
// onClipReady({ blob, durationMs, mimeType }). Errors go to onError(msg).
export function AudioRecorder({ onClipReady, onError, disabled = () => false }) {
  const node = el('div', { class: 'audio-recorder' });

  if (!recordingSupported()) {
    node.appendChild(
      el('p', { class: 'audio-recorder-fallback' }, [
        'In-browser recording is not supported here. Use "Add audio file" to attach an existing recording.'
      ])
    );
    return node;
  }

  let mediaRec = null;
  let stream = null;
  let chunks = [];
  let startMs = 0;
  let tickHandle = null;
  let state = 'idle';

  const status = el('p', { class: 'audio-recorder-status' });
  const elapsed = el('span', { class: 'audio-elapsed mono' }, ['0:00']);
  const indicator = el('span', { class: 'audio-indicator', hidden: true }, ['●']);

  const recordBtn = Button({
    label: 'Record audio',
    variant: 'secondary',
    onClick: () => start()
  });
  const stopBtn = Button({
    label: 'Stop',
    variant: 'danger',
    onClick: () => stop()
  });
  stopBtn.hidden = true;

  function renderState() {
    if (state === 'recording') {
      recordBtn.hidden = true;
      stopBtn.hidden = false;
      indicator.removeAttribute('hidden');
    } else {
      recordBtn.hidden = false;
      stopBtn.hidden = true;
      indicator.setAttribute('hidden', '');
      elapsed.textContent = '0:00';
    }
    recordBtn.disabled = disabled();
  }

  async function start() {
    if (disabled()) {
      status.textContent = 'Audio limit reached for this entry.';
      status.className = 'audio-recorder-status warn';
      return;
    }
    state = 'requesting';
    status.textContent = 'Requesting microphone…';
    status.className = 'audio-recorder-status';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      state = 'idle';
      const msg =
        err && err.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : `Could not access microphone: ${err.message}`;
      status.textContent = msg;
      status.className = 'audio-recorder-status warn';
      if (onError) onError(msg);
      renderState();
      return;
    }
    const mime = pickMimeType();
    try {
      mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      state = 'idle';
      status.textContent = `Recorder not available: ${err.message}`;
      status.className = 'audio-recorder-status warn';
      renderState();
      return;
    }
    chunks = [];
    mediaRec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    startMs = Date.now();
    mediaRec.start();
    state = 'recording';
    status.textContent = '';
    status.className = 'audio-recorder-status';
    tickHandle = setInterval(() => {
      elapsed.textContent = formatElapsed(Date.now() - startMs);
    }, 250);
    renderState();
  }

  function stop() {
    if (state !== 'recording' || !mediaRec) return;
    mediaRec.onstop = () => {
      const durationMs = Date.now() - startMs;
      const mimeType = mediaRec.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: mimeType });
      stream?.getTracks().forEach((t) => t.stop());
      if (tickHandle) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
      stream = null;
      mediaRec = null;
      chunks = [];
      state = 'idle';
      renderState();
      if (onClipReady) onClipReady({ blob, durationMs, mimeType });
    };
    mediaRec.onerror = (e) => {
      const msg = (e && e.error && e.error.message) || 'recording failed';
      stream?.getTracks().forEach((t) => t.stop());
      if (tickHandle) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
      stream = null;
      mediaRec = null;
      chunks = [];
      state = 'idle';
      status.textContent = `Recording failed: ${msg}`;
      status.className = 'audio-recorder-status warn';
      if (onError) onError(msg);
      renderState();
    };
    try {
      mediaRec.stop();
    } catch (err) {
      // Already stopped; let onstop fire naturally.
    }
  }

  // Stop everything (mic stream, MediaRecorder, elapsed-tick interval)
  // without delivering a clip. Used when the host unmounts the
  // recorder mid-recording — without this, the mic stream stays open
  // (LED stays on) until the tab is closed.
  function cancel() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
    if (mediaRec) {
      try {
        mediaRec.onstop = null;
        mediaRec.onerror = null;
        if (mediaRec.state !== 'inactive') mediaRec.stop();
      } catch {}
      mediaRec = null;
    }
    if (stream) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      stream = null;
    }
    chunks = [];
    state = 'idle';
    renderState();
  }

  const controls = el('div', { class: 'audio-recorder-row' }, [
    indicator,
    elapsed,
    recordBtn,
    stopBtn
  ]);
  node.appendChild(controls);
  node.appendChild(status);

  // Auto-cleanup: when the recorder is removed from the document tree
  // (entry-form unmounts via clear()), fire cancel() so the mic stream
  // and timer are released. Without this, navigating Back during a
  // recording leaves the mic indicator on indefinitely.
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!document.contains(node)) {
        cancel();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Public hooks for the host:
  //   refresh()  — re-evaluate disabled state when photo/audio count changes
  //   dispose()  — force-cleanup mid-recording (also auto-invoked on detach)
  node.refresh = renderState;
  node.dispose = cancel;

  renderState();
  return node;
}
