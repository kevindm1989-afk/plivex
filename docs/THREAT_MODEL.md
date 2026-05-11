# Plivex Threat Model

**Last updated:** 2026-05-10 (v1.2.0)

This document describes what Plivex is and is not designed to protect against. It's a companion to `PRIVACY.md`, and the explicit reference for what's in scope when evaluating the app's security claims.

## Goal

Plivex is a personal note-taking app. Its security goals are deliberately narrow: protect the user's content from passive disclosure when the user does not control physical access to their device, and surface evidence of tampering with stored entries.

## What Plivex protects against

1. **At-rest disclosure of the device's IndexedDB.** A bystander or technician with read-only filesystem access (e.g., reading a forensic image) sees only ciphertext for the entry payloads and the wrapped master key. PBKDF2-HMAC-SHA-256 with 600,000 iterations and AES-GCM 256 are used. Without the user's passphrase, the master key cannot be unwrapped.

2. **Tampering with stored entries.** Each entry is part of a SHA-256 hash chain over canonical JSON of its contents and the predecessor's hash. Modifying, deleting, reordering, or inserting entries changes the chain. Verification surfaces the break with a specific reason (`entry_hash_mismatch` / `prev_hash_mismatch` / `decryption_failed` / `malformed_entry`) and the offending entry id.

3. **Network-side eavesdropping.** Plivex makes no network requests after the initial app shell load. No telemetry. No analytics. No phone-home. No CDN dependencies. The only network traffic is the one-time fetch of the static app from GitHub Pages, after which the service worker caches the shell for offline use. Subsequent runs are fully offline-capable.

4. **Accidental third-party resource loads.** A strict Content Security Policy (`default-src 'self'`) is enforced via a meta tag. Future code that accidentally references a third-party URL would be blocked by the browser, not just by the developer's discipline.

5. **Active backgrounding / shoulder surfing.** Auto-lock clears the master key from working memory after a configurable timeout (default 15 minutes, range 1–60 minutes in Settings). Backgrounding the app or sleeping the device does not pause the timer.

## What Plivex does NOT protect against

The following are explicitly out of scope:

1. **Compromised device.** Malware running on the user's device with the user's privileges can read the unlocked database, log keystrokes, screenshot the screen, or extract the master key from JavaScript memory. Plivex runs in the same trust boundary as everything else on the device.

2. **Browser extensions.** Extensions installed by the user have access to the page's DOM and JavaScript context. A malicious extension can read decrypted entries, capture passphrases, or modify entries before they're hashed.

3. **The user's choice of passphrase.** A weak passphrase that a brute-force attack can guess defeats the encryption regardless of iteration count. Plivex enforces a 12-character minimum and a strength gate of score ≥ 2, but cannot prevent a user from setting a passphrase that is publicly known or guessable in context.

4. **Sharing the passphrase.** If the user tells another person their passphrase, that person can access all data.

5. **Physical coercion.** If the user is compelled to unlock the app, encryption provides no defense. There is no panic mode, no duress passphrase, no decoy database.

6. **Forgotten passphrases.** By design, the passphrase cannot be recovered. The "I forgot my passphrase" path is a wipe.

7. **Hardware-level attacks.** Cold-boot attacks on RAM, side-channel attacks on the browser's WebCrypto implementation, EM emanation attacks, physical chip readout of unlocked memory — none of these are mitigated.

8. **OS-level forensics on an unlocked device.** Browser swap files, browser history, paged-out memory, and similar artifacts may contain plaintext fragments. Plivex cannot prevent the operating system from caching its own data.

9. **Future cryptographic attacks.** AES-GCM-256 and PBKDF2-HMAC-SHA-256 are believed strong as of 2026. If a future cryptanalytic break appears, all stored entries become readable.

10. **Supply-chain compromise of the browser or device firmware.** A malicious browser build, a compromised OS update, or compromised device firmware can defeat all in-browser protections.

11. **Compromise of the GitHub Pages CDN at first load.** The first time the user visits the URL, the browser fetches the app from GitHub Pages. A compromise of that infrastructure could serve a malicious version of Plivex that bypasses every protection. Once the app is installed (the service worker caches the shell), subsequent loads come from the local cache and are offline. Users concerned about this should self-host (fork the repo and deploy to their own URL) or load the app once on a trusted network.

12. **Browser zero-days.** Bugs in the WebCrypto implementation, IndexedDB, or service worker layer of the browser may exist. Plivex relies on these primitives being correct.

13. **Side-channel timing attacks on AES-GCM.** Browser implementations of WebCrypto may or may not be constant-time depending on platform. Plivex does not attempt platform-specific mitigations.

14. **Adversaries with access to backup files outside the device.** The export file is encrypted (entries remain encrypted), but it includes the wrapped master key. Anyone with the export file plus the passphrase can decrypt all entries. Treat exports as sensitive.

15. **Adversaries with multiple historical snapshots.** The hash chain protects against tampering, but if an adversary obtains a database snapshot at time T1 and another at T2, they can detect that data changed between T1 and T2 even if both states are internally consistent. Plivex does not provide forward secrecy.

16. **Compelled disclosure.** Legal process compelling the user to provide their passphrase is outside the cryptographic model.

## Trust boundaries

| Layer | Trusted? | Notes |
|---|---|---|
| User's brain (passphrase memory) | yes | If forgotten, no recovery |
| User's device hardware | yes | Out of scope to defend against compromised hardware |
| User's OS | yes | Same |
| User's browser | yes | Same |
| Browser extensions | **NO** | Treated as part of the page's threat model |
| GitHub Pages CDN at first load | trust-then-verify | Cached locally after first install |
| GitHub Pages CDN at subsequent loads | not depended on | Service worker serves from local cache |
| Network between user and GitHub Pages | not trusted | At first install only sees TLS-protected static-asset fetches |
| Other apps on the user's device | not trusted | Plivex relies on the browser's same-origin isolation of IndexedDB |

## What the user can do to strengthen the model

- Use a passphrase with high entropy. 5–6 random diceware-style words is a reasonable target for non-adversarial settings; more for high-stakes settings.
- Write the passphrase down somewhere physically secure (a safe, a safe deposit box, an envelope with a trusted person). Forgetting it is the single biggest realistic risk in solo use.
- Avoid installing untrusted browser extensions.
- Export backups regularly to a location you control. Don't email exports to yourself or upload them to a service that can read them.
- For high-stakes use, self-host: fork the repo, deploy to your own GitHub Pages or local file server.
- Treat exports as sensitive — they include the wrapped master key.
- Periodically run **Settings → Verify integrity** to catch tampering.
- Set the auto-lock timeout appropriately for the threat: smaller for shared devices, larger for personal ones.
