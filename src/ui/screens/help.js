import { el, clear, svgFromString } from '../dom.js';
import { iconBack } from '../icons.js';

function section(heading, paragraphs) {
  const children = [el('h2', { class: 'help-heading' }, [heading])];
  for (const p of paragraphs) {
    if (Array.isArray(p)) {
      const ul = el('ul', { class: 'help-list' });
      for (const item of p) ul.appendChild(el('li', {}, [item]));
      children.push(ul);
    } else {
      children.push(el('p', {}, [p]));
    }
  }
  return el('section', { class: 'help-section' }, children);
}

export function render(root, controller) {
  clear(root);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('settings')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Help'])
  ]);

  root.appendChild(
    el('section', { class: 'screen help' }, [
      topbar,
      el('p', { class: 'lede' }, [
        'Plivex is a workplace-records log that stays on your device. Everything is encrypted with your passphrase. The sections below explain how each feature works and why it matters.'
      ]),

      section('Your passphrase is the only key', [
        'Your passphrase is used to derive an encryption key that protects every entry, including photos. The passphrase is never stored, never sent anywhere, and never recoverable.',
        'If you forget it, your data cannot be unlocked by anyone — including the developer. Write it down somewhere safe, or use a password manager.',
        'You can change your passphrase any time in Settings → Change passphrase. The data is re-wrapped on the spot; no re-encryption of every entry is needed.'
      ]),

      section('What an entry can hold', [
        'Each entry has a title and content. You can also add: a type (Schedule, Pay, Safety, Discipline, Harassment, Meeting, Conversation, Injury, Other), a witness name, a location, and up to 5 photos (10 MB each).',
        'Original photo bytes are kept as-is — Plivex does not strip EXIF. If a photo carries a capture time or GPS, that metadata is preserved inside the encrypted payload.'
      ]),

      section('The hash chain (tamper evidence)', [
        'Every entry has a SHA-256 hash that includes the previous entry\'s hash. This forms a chain: changing any past entry breaks every later hash. Verify integrity in Settings → Verify integrity to recompute the whole chain and confirm nothing has been altered.',
        'You can see the chain head (the latest entry\'s hash) in Settings → Chain timestamping. Submitting that hash to a free service like OpenTimestamps anchors your chain to a public record without revealing any entry contents — the hash leaks nothing about what you wrote.'
      ]),

      section('The verification certificate', [
        'Settings → View verification certificate generates a one-page printable summary: total entries, the chain head, the genesis hash, and any superseded entries. Print it and sign on paper (with a witness signature line if you want).',
        'A signed certificate is an offline anchor: it proves your chain was in this exact state on this date, without needing a server or any third-party service.'
      ]),

      section('Editing entries (supersede semantics)', [
        'Editing does not overwrite the original. The old entry is marked "superseded" and a new entry is appended that points back to it. Both entries remain in the chain. This is intentional — a tamper-evident log should not let you silently change history.'
      ]),

      section('Backups', [
        'Settings → Export → Download backup writes a single JSON file containing your encrypted entries plus the salt and wrapped master key. The same passphrase you use now will unlock it later.',
        'On phones that support it, "Share backup" hands the file to your OS share sheet so you can save it to any installed app — your cloud drive of choice, email to yourself, AirDrop, etc. Plivex itself never contacts a server.',
        'The backup-reminder banner on the entry list nudges you when you haven\'t exported in a while. Cadence is configurable in Settings → Backup reminders (Off / 3 / 7 / 14 / 30 days).'
      ]),

      section('Auto-lock', [
        'Plivex locks itself after a period of inactivity (default 15 minutes; configurable 1–60 in Settings → Auto-lock). The timer is wall-clock based, so backgrounding the app or locking your phone does not pause it.',
        'Locking only clears the master key from memory. Your data is never deleted by the auto-lock — it just sits there encrypted until you unlock again.'
      ]),

      section('If your phone is taken', [
        'Auto-lock and the passphrase gate help, but they are not magic. If you are forced to unlock the app, anyone can read your entries.',
        'Defense in depth: keep an exported backup somewhere off the device (your cloud drive, a trusted person, a safe), so even a wiped or seized device does not destroy your record.'
      ]),

      section('What Plivex does NOT do', [
        [
          'No servers. No accounts. No analytics. No telemetry.',
          'No automatic cloud backup — you control where (and whether) backups go.',
          'No legal advice. Plivex is a logging tool. Whether your records are admissible or useful in any specific situation is a question for a lawyer.',
          'No remote wipe, no recovery, no developer override. The only person with access to your data is you, while you have the passphrase.'
        ]
      ])
    ])
  );
}
