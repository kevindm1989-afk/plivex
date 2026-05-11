# Changelog

All notable changes to Plivex are recorded here. Versions follow semantic versioning. Each release is also tagged in git.

## [1.5.0] — 2026-05-11

### Added
- **Search bar on the entry list.** Case-insensitive substring match across `title`, `content`, `witness`, `location`, and `type`. Runs over already-decrypted in-memory entries; no extra IndexedDB work.
- **Type filter chips.** Below the search input, one chip per type that actually exists in the user's data. Tap a chip to filter; tap again to clear. Active chip has the accent treatment.
- **Month grouping.** Entry rows are grouped under year-month headings (e.g., "May 2026") in descending order. Works in combination with search and type filters.
- **Clear filters** link button appears when search text or a type filter is active; resets both at once.

### Changed
- `APP_VERSION` `1.4.0` → `1.5.0`. `CACHE_VERSION` `plivex-v8` → `plivex-v9`.
- Entry row title is now `<h3>` (was `<h2>`) — gives the new month `<h2>` headers a cleaner outline.

### Tests
- No new tests. Search/filter/grouping is UI-only, exercising existing `app.listEntries` decryption path. 178/178 still passing.

## [1.4.0] — 2026-05-11

### Added
- **Entry type field.** Optional categorization on each entry, selectable from a fixed list (Schedule / Pay / Safety / Discipline / Harassment / Meeting / Conversation / Injury / Other). Persisted as `type` on the entry payload. Shown as a tag on entry rows and on entry detail.
- **Optional witness and location fields** on the entry form. Persisted as `witness` and `location` on the entry payload. Shown on entry detail when present. Hash chain handles new payload shapes automatically (canonical JSON sorts new keys; old entries verify unchanged).
- **Share-sheet export.** Settings → Export now offers a "Share backup" button alongside "Download backup" when the browser supports `navigator.share` with files. Uses the OS share sheet so the user can hand the file to any installed app without Plivex touching a third-party service. AbortError (user-dismissed sheet) is treated as silent cancel.
- **Verify-integrity reminder.** New section in Settings → Verify integrity: cadence select with Off / 7 / 30 / 90 days (default: 30). Banner on the entry list when the cadence has elapsed since the last successful verify. `verifyIntegrity()` writes `last_verified_at` on success. `app.shouldRemindVerify()`, `app.getVerifyReminderDays()`, `app.setVerifyReminderDays()`, `app.getLastVerifiedAt()`.

### Changed
- `APP_VERSION` `1.3.0` → `1.4.0`. `CACHE_VERSION` `plivex-v7` → `plivex-v8`.

### Tests
- 8 new tests (6 verify-reminder + 2 extended-payload round-trip + chain verification across mixed payloads). 178 total passing.

## [1.3.0] — 2026-05-11

### Added
- **Backup-reminder banner.** Entry list shows a banner when `last_export_at` is older than the configured cadence. Settings → "Backup reminders" select with Off / 3 / 7 / 14 / 30 days (default: 7). `app.shouldRemindBackup()`, `app.getBackupReminderDays()`, `app.setBackupReminderDays()`. `last_export_at` written automatically on every `exportBackup`.
- **Hashed export filenames.** Downloads named `plivex-backup-YYYY-MM-DD-Nentries-XXXXXXXX.json` where the suffix is the first 8 hex chars of the chain head (or `genesis` for an empty chain).
- **Chain timestamping panel** in Settings. Shows the current chain head (latest entry hash). "Copy chain head" button uses the local clipboard API. Brief copy explains submitting to OpenTimestamps; the app never contacts any third-party service on its own.
- **Verification certificate screen.** Settings → "View verification certificate" → printable one-page summary (generated date, app version, total entries, genesis hash, first/last entry hashes, list of supersede records, signature lines for holder + optional witness). `@media print` CSS strips the app chrome. `app.getCertificateData()` returns the structural metadata.

### Changed
- `APP_VERSION` `1.2.0` → `1.3.0`. `CACHE_VERSION` `plivex-v6` → `plivex-v7`. New `./src/ui/screens/certificate.js` added to `APP_SHELL`.

### Tests
- 12 new tests (5 backup-reminder + 3 chain-head + 4 certificate). 170 total passing.

## [Unreleased]

(none)

## [1.2.0] — 2026-05-09

### Added
- Auto-lock on idle. Default timeout 15 minutes; user-configurable in Settings (1, 5, 15, 30, 60). Wall-clock based.
- Settings → "Auto-lock" section with select dropdown.
- `recordActivity()` listener wired in `ui.js` on `pointerdown`, `keydown`, `touchstart`.
- Manual accessibility audit. Two structural fixes applied: per-instance dialog `aria-labelledby`, `alertDialog` now sets `aria-labelledby`.
- Auto-lock and Accessibility sections in `PRIVACY.md`.
- Auto-lock subsection in `TERMS.md`.

### Changed
- `--border` `#2e2e2e` → `#707070` (3.51:1 contrast on `--bg`, WCAG 1.4.11 PASS).
- `--border-strong` `#3a3a3a` → `#888888` (4.91:1 contrast on `--bg`, WCAG 1.4.11 PASS).
- `APP_VERSION` `1.1.0` → `1.2.0`. `CACHE_VERSION` `plivex-v4` → `plivex-v5`.

### Tests
- Added 9 auto-lock tests using an injectable clock (`_setClockForTesting`). 158 total passing.

## [1.1.0] — 2026-05-09

### Added
- Restore-from-backup option on the setup screen (no longer requires creating a temporary passphrase first).
- Dialog focus trap (Tab + Shift+Tab wrap correctly within open dialogs).
- `import_failed` reason returned by `importBackup` on transactional rollback.

### Changed
- Strength gate raised from `score >= 1` to `score >= 2` on Setup → Create and Settings → Change passphrase.
- `importBackup` now uses a single IndexedDB transaction across `meta` and `entries` stores. Failure mid-import rolls back atomically; status returns to `uninitialized` with no partial state.
- `APP_VERSION` `1.0.0` → `1.1.0`. `CACHE_VERSION` `plivex-v3` → `plivex-v4`.

### Tests
- Added 5 focus-trap tests (`tests/ui-dialog.test.js`) and 2 transactional-import tests. 149 total passing.

## [1.0.0] — 2026-05-09

First release. Plivex v1.0 is functionally complete: install, set passphrase, write/read/edit entries with hash chain, change passphrase, export/import, verify integrity, wipe.

### Added
- PWA shell with install gate, service worker (offline app shell cache), manifest, icons.
- `src/crypto.js` — PBKDF2-HMAC-SHA-256 (600,000 iterations, OWASP 2024), AES-GCM 256, passphrase strength heuristic, `MIN_PASSPHRASE_LENGTH = 12`.
- `src/storage.js` — IndexedDB layer via vendored `idb@8.0.3`. Two-layer key wrap (random master key encrypts entries; passphrase-derived KEK encrypts the master key). Schema-migration scaffolding.
- `src/chain.js` — SHA-256 hash chain with strict canonical JSON. Verification surfaces 8 distinct tamper modes.
- `src/app.js` — Orchestration layer with module-scoped state machine: `unbooted` / `uninitialized` / `locked` / `unlocked`.
- `src/ui/` — 7 screens (install gate, setup, lock, entry list, entry form, entry detail, settings) plus reusable components (button, input, dialog, strength meter). No framework.
- Hotfix during v1.0 cycle: button factory always attaches click listener regardless of initial `disabled` state — fixed five sites including the wipe confirmation dialog. (See PR #7.)

### Tested
- 142 tests across crypto / storage / chain / app / ui-button / ui-dialog suites at v1.0 release.

### Documents
- `PRIVACY.md`, `TERMS.md`, `docs/EVIDENTIARY_USE.md`, `LICENSE` (MIT), `README.md`.

## Tag conventions

Each version corresponds to a git tag (`v1.0.0`, `v1.1.0`, `v1.2.0`). Tags are annotated and point to the merge commit on `main` for that release.

## Format

This file roughly follows the "Keep a Changelog" convention: entries grouped under `Added` / `Changed` / `Removed` / `Fixed` / `Security` / `Tests`. Dates are ISO 8601.
