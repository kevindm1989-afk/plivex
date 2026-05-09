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

- **Local-only storage.** Your data lives in your browser's local storage on your device. The app cannot transmit it anywhere.
- **Tamper-evident entries.** Each entry is cryptographically chained to the previous one. Edits create new records that supersede old ones rather than overwriting them.
- **Encrypted at rest.** Data is encrypted using a key derived from a passphrase you set. Lose the passphrase and the data cannot be recovered — by you, by me, by anyone.
- **No accounts.** There is no sign-up, no login, no email, no identifier of any kind tied to you.
- **No telemetry.** The app does not phone home. There are no analytics, no crash reporting, no remote configuration.

## Installing

This app is designed to be installed to your device's home screen, not just visited as a website.

**On iOS (Safari):** Open the app URL, tap the Share button, then "Add to Home Screen."

**On Android (Chrome):** Open the app URL, tap the menu button, then "Install app" or "Add to Home Screen."

The app will not function reliably as a regular bookmark. Installation to the home screen is required.

## Backing up your data

Because everything is local, **uninstalling the app or clearing your browser data will permanently delete your entries.** The app provides an export function — use it regularly. Save the exported file to your own personal cloud (iCloud, Google Drive, etc.) or another device you control. Backup is your responsibility; nothing in this app does it for you.

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
