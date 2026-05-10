# Changelog

All notable changes to Plivex are recorded here. Versions follow semantic versioning. Each release is also tagged in git.

## [Unreleased]

- Documentation hardening: CSP meta tag in `index.html`, `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`. Last-updated dates filled in across `PRIVACY.md`, `TERMS.md`, and `docs/EVIDENTIARY_USE.md`. `--border` and `--border-strong` already pass WCAG 1.4.11 (set in v1.2.0).

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
