# Plivex

A personal note-taking app for documenting workplace events, with local-only storage and tamper-evident entries.

## What this is

Plivex is a Progressive Web App (PWA) that lets you keep dated, structured notes about events at your workplace. It runs entirely in your browser. Your entries are stored on your own device and are never sent to any server.

## What this isn't

- It's not legal advice.
- It's not evidence-management software.
- It's not connected to any union, employer, or organization.
- It's not a service. There is no server, no account system, no cloud sync.
- It's not commercial. The app is free, with no ads, no payments, no upsells.

## How it works

- **Local-only storage.** Your data lives in your browser's local storage (IndexedDB) on your device. The app cannot transmit it anywhere.
- **Tamper-evident entries.** Each entry is cryptographically chained to the previous one with SHA-256. Edits create new records that supersede old ones rather than overwriting them, so the chain shows the full history.
- **Encrypted at rest.** Entries (including photos and audio) are encrypted with AES-GCM. The encryption key is derived from a passphrase you set, via PBKDF2-HMAC-SHA-256 at 600,000 iterations (OWASP 2024 guidance). Lose the passphrase and the data cannot be recovered — by you, by me, by anyone.
- **No accounts.** There is no sign-up, no login, no email, no identifier of any kind tied to you.
- **No telemetry.** The app does not phone home. There are no analytics, no crash reporting, no remote configuration.
- **No third-party services.** No fonts, scripts, or images load from any external service. The CSP enforces this at runtime.

## Features

**Entries**
- Title, content, optional type (Schedule / Pay / Safety / Discipline / Harassment / Meeting / Conversation / Injury / Other), optional witness, optional location
- Up to 5 photos per entry (10 MB each). Original bytes preserved — EXIF is not stripped.
- Up to 3 audio clips per entry (25 MB each). Record in-app via `MediaRecorder` or attach an existing file.
- Quick-add templates above "New entry" for one-tap capture (Incident, Pay issue, Verbal warning, Schedule, Harassment, Meeting, Conversation, Injury).

**Finding and reviewing**
- Search across title, content, witness, location, and type
- Type filter chips (auto-populated from your existing entries)
- Date-range filter (From / To)
- Month grouping with year-month headers
- Print preview for any single entry or a date-scoped archive — your browser's print dialog produces the PDF.

**Integrity**
- "Verify integrity" recomputes the entire hash chain
- Verification certificate: a printable one-page summary (chain head, total entries, supersede history, signature lines)
- Chain timestamping panel: copy the current chain head to anchor against OpenTimestamps or similar (you submit it yourself; Plivex never sends anything)
- Verification-reminder cadence (Off / 7 / 30 / 90 days)

**Security**
- Wall-clock auto-lock (1 / 5 / 15 / 30 / 60 minutes, default 15)
- Change passphrase (re-wraps the master key; entries aren't re-encrypted)
- Wipe — type-to-confirm; permanent and unrecoverable

**Backup and restore**
- Download backup → JSON file containing your encrypted entries plus the wrapped key. Filename includes the entry count and the first 8 hex chars of the chain head.
- Share backup → OS share sheet (where supported) — hand the file to your cloud drive, email, AirDrop, etc.
- Import → atomic, single-transaction replace. Failures roll back to empty.
- Backup-reminder cadence (Off / 3 / 7 / 14 / 30 days)

**Help**
- Built-in help screen accessible from Settings → Help, covering passphrase recovery (none), payload fields, hash chain, certificate, supersede semantics, backups, auto-lock, device-taken scenarios, and printing.

## Installing

This app is designed to be installed to your device's home screen, not just visited as a website.

**On iOS (Safari):** Open the app URL, tap the Share button, then "Add to Home Screen."

**On Android (Chrome):** Open the app URL, tap the menu button, then "Install app" or "Add to Home Screen."

The app will not function reliably as a regular bookmark. Installation to the home screen is required.

## Backing up your data

Because everything is local, **uninstalling the app or clearing your browser data will permanently delete your entries.** The app provides Download and Share backup options — use them regularly. Save the exported file to your own personal cloud (iCloud, Google Drive, etc.) or another device you control. Backup is your responsibility; nothing in this app does it for you.

The entry list shows a reminder banner when you haven't exported in a while (cadence configurable in Settings).

## Architecture

No framework, no bundler, no transpilation. The source in this repository is exactly what runs in your browser.

- `index.html` — the only HTML file. CSP set via `<meta>`.
- `sw.js` — service worker. Cache-first with network fallback over same-origin GETs.
- `src/crypto.js` — PBKDF2 + AES-GCM, passphrase strength heuristic.
- `src/storage.js` — IndexedDB wrapper (via vendored `idb`), two-layer key wrap.
- `src/chain.js` — SHA-256 hash chain with strict canonical JSON.
- `src/app.js` — orchestration: state machine, auto-lock, backups, reminders, certificate data.
- `src/ui/` — screens and components. Pure DOM, no virtual DOM.
- `tests/` — Node's built-in `node:test`. 181 tests across crypto, storage, chain, app, button, dialog.

Run the tests with `npm test` (Node ≥ 20).

## Privacy and terms

- [Privacy Policy](./PRIVACY.md)
- [Terms of Use](./TERMS.md)
- [Evidentiary Use Guide](./docs/EVIDENTIARY_USE.md)

## Source code

This is the entire source. Nothing runs anywhere else. You are welcome to read it, audit it, fork it, or self-host your own copy.

### Third-party code

The `vendor/` directory contains third-party JavaScript that ships verbatim alongside the app, so the source in this repository exactly matches what runs in your browser. There is no build step and no runtime download from a CDN or package registry.

- `vendor/idb.js` — `idb` by Jake Archibald (ISC). A small Promise wrapper around the browser's IndexedDB API. Each vendored file carries a header comment with the upstream version, source URL, license, and a SHA-256 hash of the upstream content for verification.

Updates to vendored files happen by replacing the entire file and bumping the header — no in-place patching.

## Contributions

This is a personal project published in my individual capacity. I'm not actively recruiting contributors. Pull requests are welcome but may not receive timely responses. If you want changes, the simplest path is to fork.

## License

MIT — see [LICENSE](./LICENSE).
