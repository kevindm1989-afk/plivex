# Changelog

All notable changes to Plivex are recorded here. Versions follow semantic versioning. Each release is also tagged in git.

## [1.15.0] — 2026-05-16

### Added
- **Web Share Target.** Plivex now appears in the OS share sheet of other apps. Tap Share → Plivex from Photos / Files / a browser / etc. and the contents land in a new entry — text becomes content, images become photo attachments, audio becomes audio attachments, anything else becomes a file attachment. Per-entry caps still apply (overflow is dropped).
- New `share_target` block in `manifest.webmanifest` (POST + multipart/form-data, accepting `image/*`, `audio/*`, `application/pdf`, `text/*`, `*/*`).
- New `handleShareTarget` in `sw.js` parses the incoming multipart payload, classifies files by MIME, base64-encodes them, and stashes a normalized payload in a transient `plivex-share-staging` cache. Redirects the navigation to `./?share=pending`.
- `src/app.js`: `loadPendingShare()`, `getPendingShare()`, `clearPendingShare()` — handles the staged payload, holds it in module-scoped state until consumed.
- `src/ui/ui.js`: bootstrap reads the staging area on `?share=pending`, cleans the URL, and the next `draw()` diverts to `entry-form` with `params.shared` once the user is unlocked.
- `src/ui/screens/entry-form.js`: new `params.shared` path. Pre-fills title + content + attachments. Edit mode and template prefill remain unchanged; share takes precedence over template but never over an existing original.
- Help screen: new "Sharing into Plivex" section, including the caveat that the share payload sits briefly unencrypted in a transient cache (no master key yet) and the note about iOS Safari not exposing installed PWAs in the share sheet.

### Changed
- `APP_VERSION` `1.14.3` → `1.15.0`. `CACHE_VERSION` `plivex-v21` → `plivex-v22`.

### Tests
- 1 new test in `tests/ui-screens.test.js`: `renders new-entry form pre-filled from a Web Share Target payload`. Asserts title + content + photo/file render hooks all fire when `params.shared` is provided. 207 total passing.

## [1.14.3] — 2026-05-16

### Fixed
- **`decryptRecord` no longer aborts the entire list on a single bad record.** Previously, one corrupted entry would make `app.listEntries()` throw, which the UI rendered as a generic "Failed to load entries." error — looking exactly like the v1.14.1 symptom. Now decrypt errors per-record return a sentinel `{ id, uuid, ..., payload: null, decryptError }` and the other entries still surface. The list and detail screens render the broken row with a `decrypt failed` tag and a clear "[Could not decrypt — entry #N]" title.
- **`importBackup` is now truly atomic.** Previously the path was `wipeDatabase()` → `openDB()` → transaction. A failure between the wipe and the writes destroyed old data without committing new. Now everything happens inside a single `readwrite` transaction over both stores, using `store.clear()` instead of dropping the database. If anything throws — including the `openDB` retry that was outside the try block — the transaction aborts and existing data is preserved.
- **Per-entry shape validation in `importBackup`** runs before any storage write. A backup with a malformed entry (missing `uuid`/`created_at`/`prev_hash`/`entry_hash`, or a non-string `encrypted_payload.iv`/`ciphertext`) is now rejected with `reason: 'malformed'` instead of being passed into the put-loop where it could mid-loop abort the transaction.
- **Audio recorder no longer leaks the mic.** A user starting a recording then tapping Back (instead of Stop) used to leave the mic stream, MediaRecorder, and elapsed-time interval running — mic LED stayed on indefinitely. New `node.dispose()` hook and a `MutationObserver` that watches for the recorder's removal from the DOM both stop everything cleanly.
- **Follow-up date math is timezone-safe.** `todayISO()` now uses local-zone components (was UTC via `toISOString().slice(0,10)`, off-by-one near midnight for non-UTC users). NaN guards prevent `'Overdue NaNd'` from rendering on malformed date strings imported from a tampered backup.
- **`chain.js`: removed a duplicate `getAllEntriesByid` (typo'd casing) and pulled `getAllEntriesById` from `storage.js` instead.** Dead-code cleanup; behavior unchanged.
- **`entry-form.js`: renamed shadowing `const files = ...` to `const incoming` inside the file/audio input handlers.** Previously these locals shadowed the outer form-state `files` array — no functional bug today, but a future edit reaching for the form state would have silently broken attachment persistence.
- **`entry-list.js`: removed dead `screen.appendChild(listEl)` left over from the v1.14.1 hotfix.** The list element is appended after the filter bar by the existing line at the bottom; the earlier one was a no-op move.

### Changed
- `APP_VERSION` `1.14.2` → `1.14.3`. `CACHE_VERSION` `plivex-v20` → `plivex-v21`.

### Tests
- 3 new tests covering the three biggest fixes:
  - `decryptRecord failure surface > listEntries returns a sentinel for a corrupted record instead of throwing`
  - `export / import > failed import preserves existing entries — atomicity across the wipe`
  - `export / import > malformed entry shape in backup is rejected before any wipe`
- 206 total passing.

## [1.14.2] — 2026-05-11

### Added
- **UI render smoke tests.** New `tests/ui-entry-list.test.js` and `tests/ui-screens.test.js` instantiate the render path for every screen (entry-list, setup, lock, entry-form, entry-detail, settings, certificate, stats, calendar, print-view, help) against a real DOM via happy-dom. They assert the resulting tree contains the expected markers. The v1.14.1 TDZ bug is now regression-tested directly: against the old buggy entry-list.js, 5/5 entry-list tests fail; against the current code, they pass.
- New `tests/_dom.js` helper that wires up a happy-dom Window, a navigation-capturing controller stub, and a `#root` container.
- 20 new smoke tests, total now 203/203 passing.

### Changed
- **Import confirm dialog rewritten to warn against the v1.14.1 failure mode.** The "Replace all data" dialog now explicitly tells the user: if the entry list looked empty before this, force-close and reopen Plivex first, because a rendering bug can make data appear missing when it is still in storage. Importing on top of that wipes the real data.
- `.dialog-message` now uses `white-space: pre-line` so multi-paragraph confirm messages render with line breaks instead of collapsing into one blob.
- `APP_VERSION` `1.14.1` → `1.14.2`. `CACHE_VERSION` `plivex-v19` → `plivex-v20`.

### Dependencies
- Added `happy-dom@20.9.0` as a devDependency. Tests-only; not loaded by the deployed app.

## [1.14.1] — 2026-05-11

### Fixed
- **Critical: entry list rendered as empty for everyone.** A temporal-dead-zone reference in `src/ui/screens/entry-list.js` referenced `followUpDueCount` (line 189) before its declaration (line 254). On every render the function threw a `ReferenceError` after appending the topbar and reminder banners, leaving the page looking like the database had been wiped. Bug was introduced in v1.12.0 (PR #23) and has been live since. Fix: hoist `app.listEntries()` and the follow-up-due computation above the banner block; the rest of the render flow is unchanged. The empty-list placeholder, filter bar, and entry rows now render again.

### Changed
- `APP_VERSION` `1.14.0` → `1.14.1`. `CACHE_VERSION` `plivex-v18` → `plivex-v19`.

### Tests
- No new tests; existing tests still pass (183/183). This was a UI render-order bug, not a logic or persistence bug — none of the existing tests instantiate the entry-list screen.

## [1.14.0] — 2026-05-11

### Added
- **File attachments on entries.** Up to 3 files per entry, 15 MB each. Any file type accepted (PDFs, text documents, spreadsheets, anything). Stored base64 inside the encrypted payload — same model as photos and audio. Downloaded back out via a Blob + object-URL `<a download>` on the entry detail; the file never leaves the device through Plivex.
- **Search highlighting.** When the search box has text, matches in entry-row titles and previews are wrapped in `<mark>` and rendered in a warm-yellow tint. Composes with all existing filters.
- Filenames of photos, audio, and files are now included in the search corpus alongside the existing fields (title, content, witness, location, type).

### Changed
- `APP_VERSION` `1.13.0` → `1.14.0`. `CACHE_VERSION` `plivex-v17` → `plivex-v18`.
- Help screen: "What an entry can hold" lists files.
- `PRIVACY.md`: new "File attachments" section.

### Tests
- 1 new test: round-trip an entry with a `files` field. 183 total passing.

## [1.13.0] — 2026-05-11

### Added
- **Statistics screen.** Settings → Records and integrity → Open statistics. Counts of active vs all-time entries, first/last entry, by-type breakdown (horizontal SVG bar charts — no inline styles, CSP-clean), by-month breakdown (last 12), follow-up status (overdue / today / this week / future), attachment totals, and storage usage. All computation runs locally on already-decrypted entries.
- **Calendar view.** New icon button in the entry-list topbar opens a month-by-month grid (Monday-first). Days with entries are accented; today is dashed-outlined. Tap any day with entries → list of that day's entries inline below the calendar, each item linking to the entry detail.
- New `src/ui/screens/stats.js` and `src/ui/screens/calendar.js` registered as routes.
- New `iconCalendar` and `iconChart` SVG icons.
- Help screen: new "Calendar and statistics" section.

### Changed
- `APP_VERSION` `1.12.0` → `1.13.0`. `CACHE_VERSION` `plivex-v16` → `plivex-v17`. New stats.js + calendar.js added to `APP_SHELL`.
- `manifest.webmanifest`: added `"categories": ["productivity", "utilities"]` for better PWA discoverability.

### Tests
- No new tests. Stats and calendar are read-only views over `listEntries`, which already has coverage. 182/182 still passing.

## [1.12.0] — 2026-05-11

### Added
- **Follow-up dates.** New optional `followUpDate` (YYYY-MM-DD) per entry. Set in the entry form alongside witness/location. Displayed on entry detail, in print views, and as a row tag on the entry list: "Overdue Xd" / "Due today" / "Follow-up YYYY-MM-DD" (future). A warning banner on the entry list aggregates the count of non-superseded entries due today or overdue.
- **Lock-screen recovery info.** New collapsible "How recovery works" panel below the unlock form, explaining there is no recovery, what an existing backup lets you do, and what the wipe path means.

### Changed
- **Settings reorganized into collapsible groups:** Security (passphrase, auto-lock — open by default), Data (export, backup reminders, import, storage), Records and integrity (verify, chain timestamping, certificate, print archive), Help, Danger zone (wipe), About (open by default). Built on native `<details>` so it's keyboard-accessible and CSP-clean.
- Lock screen wrong-passphrase message now reminds the user there is no recovery, no failed-attempt counter, and no developer override.
- `APP_VERSION` `1.11.0` → `1.12.0`. `CACHE_VERSION` `plivex-v15` → `plivex-v16`.

### Tests
- 1 new test: round-trip an entry with a `followUpDate` field. 182 total passing.

## [1.11.0] — 2026-05-11

### Added
- **Quick-add templates.** Chip row above the "New entry" button on the entry list: Incident, Pay issue, Verbal warning, Schedule, Harassment, Meeting, Conversation, Injury. Tapping a chip opens the entry form with the matching type pre-selected and a partial title (e.g., "Incident: ") already in place. Designed for capture-in-the-moment — fewer taps when something just happened.
- New `src/ui/templates.js` module owning the preset list.
- Help screen: new "Quick add" section.

### Changed
- `APP_VERSION` `1.10.0` → `1.11.0`. `CACHE_VERSION` `plivex-v14` → `plivex-v15`. New `./src/ui/templates.js` added to `APP_SHELL`.

### Tests
- No new tests. Templates are a UI prefill layer; entry-form's persistence path is already covered. 181/181 still passing.

## [1.10.0] — 2026-05-11

### Added
- **Print / Save-as-PDF, single entry.** New "Print" button on entry detail. Opens a print-view screen rendered with `@media print` styles and a `window.print()` trigger. Includes hashes, timestamps, photo embeds, and audio file references.
- **Print archive.** New "Print archive" section in Settings with optional date-range inputs. Opens a print view containing every entry (or every entry within the chosen range), each with its own hash block. The document header shows the current chain head, total entry count, and (when filtered) the date range — so the printout is independently verifiable against the live chain.
- New `src/ui/screens/print-view.js` registered as the `print-view` route.

### Changed
- `APP_VERSION` `1.9.0` → `1.10.0`. `CACHE_VERSION` `plivex-v13` → `plivex-v14`. New `./src/ui/screens/print-view.js` added to `APP_SHELL`.
- Help screen: new "Printing and PDF" section.

### Tests
- No new tests. Print rendering is pure UI; the underlying `listEntries`, `getEntry`, and `getCertificateData` already have coverage. 181/181 still passing.

## [1.9.0] — 2026-05-11

### Added
- **Audio attachments on entries.** Up to 3 clips per entry, 25 MB each. Two paths: record directly via `MediaRecorder` (with mic permission prompt) or attach an existing audio file. Stored base64 inside the encrypted payload — same model as photos, covered by the hash chain, included in backup exports.
- **In-form recorder UI.** Record / Stop buttons with a live elapsed-time readout and pulsing red indicator while capturing. Capability-gated: on browsers without `MediaRecorder`/`getUserMedia`, the recorder is replaced with a "use file upload instead" message.
- **Audio playback in entry detail.** Each clip rendered with native `<audio controls>`.
- **Audio count tag** on entry list rows (e.g., "2 audio").

### Changed
- `APP_VERSION` `1.8.0` → `1.9.0`. `CACHE_VERSION` `plivex-v12` → `plivex-v13`. New `./src/ui/components/audio-recorder.js` added to `APP_SHELL`.
- CSP extended with `media-src 'self' data: blob:` so data-URL audio playback is allowed.

### Privacy
- `PRIVACY.md`: new "Audio attachments" section. Includes a note that the legality of recording a given conversation depends on jurisdiction.

### Tests
- 1 new test: round-trip an entry with an audio field through encrypt/decrypt. 181 total passing.

## [1.8.0] — 2026-05-11

### Added
- **In-app help guide.** New `help` screen reachable from Settings → Help. Covers passphrase recovery (there isn't any), entry payload fields, hash chain, verification certificate, supersede semantics, backups + share sheet, auto-lock, what to do if a device is taken, and an explicit "what Plivex does NOT do" section.
- **Empty-state entry list link.** When the user has zero entries, the "No entries yet" placeholder includes a one-tap link to the help guide so first-run users can orient before writing anything.

### Changed
- `APP_VERSION` `1.7.0` → `1.8.0`. `CACHE_VERSION` `plivex-v11` → `plivex-v12`. New `./src/ui/screens/help.js` added to `APP_SHELL`.

### Tests
- No new tests. Help is static content. 180/180 still passing.

## [1.7.0] — 2026-05-11

### Added
- **Date-range filter** on the entry list. Two `<input type="date">` controls (From / To) added to the filter bar, between the type chips and Clear button. Inclusive on both ends. Composes with search and type filter; "Clear filters" resets all four at once.

### Changed
- `APP_VERSION` `1.6.0` → `1.7.0`. `CACHE_VERSION` `plivex-v10` → `plivex-v11`.

### Tests
- No new tests. Date filtering is UI-only, exercising the same in-memory entry list. 180/180 still passing.

## [1.6.0] — 2026-05-11

### Added
- **Photo attachments on entries.** Up to 5 photos per entry, 10 MB each. Selected via file picker (which surfaces the camera on mobile). Photos are stored base64-encoded inside the encrypted entry payload, so they are covered by the hash chain and included in every backup export. Original bytes are preserved — Plivex does not re-encode or strip EXIF.
- **Photo gallery on entry detail.** Thumbnails laid out in a responsive grid; tap any thumbnail to view full-size in an overlay. Escape or tap outside to close.
- **Photo count tag** on entry list rows that have photos (e.g., "3 photos").
- **Storage panel in Settings.** Shows current usage and quota via `navigator.storage.estimate()` (where supported), with text color shifting at 70% and 90% usage thresholds. Refresh button to re-check on demand. `app.getStorageEstimate()`.

### Changed
- `APP_VERSION` `1.5.0` → `1.6.0`. `CACHE_VERSION` `plivex-v9` → `plivex-v10`.

### Privacy
- `PRIVACY.md` updated: photos are stored encrypted alongside text, EXIF preserved, never uploaded.

### Tests
- 2 new tests: round-trip an entry with photos through encrypt/decrypt; chain verification across mixed photo/no-photo entries. 180 total passing.

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
