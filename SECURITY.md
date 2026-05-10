# Security Policy

## Reporting a vulnerability

If you find a security issue in Plivex, please report it privately. The preferred path is GitHub's private security advisory:

https://github.com/kevindm1989-afk/plivex/security/advisories/new

Do not open a public issue or pull request for security-affecting bugs. Public discussion of an unpatched vulnerability puts current users at risk.

## What's in scope

- Cryptographic implementation in `src/crypto.js` (PBKDF2, AES-GCM, key derivation, key wrap)
- Hash chain integrity in `src/chain.js` (SHA-256, canonical JSON, tamper detection)
- Storage encryption in `src/storage.js` (master key wrap, meta records, transaction atomicity)
- Any behavior in the app that contradicts a claim in `PRIVACY.md` or `TERMS.md`
- Any code path that could exfiltrate data off-device

## What's out of scope

- Vulnerabilities in the user's device, browser, or operating system
- Vulnerabilities in third-party browser extensions
- Issues that require physical access to an unlocked device
- Issues with the user's choice of passphrase
- Forgotten passphrases — by design, there is no recovery
- The threat model excludes hardware-level attacks (cold-boot, side channels) and post-compromise scenarios where an attacker already controls the user's device

See the privacy policy for the security model the app does claim, and `docs/THREAT_MODEL.md` for the explicit threat model document.

## Response expectations

This is a personal project maintained by an individual in their personal capacity. Expectations:

- Best-effort response. No service-level agreement.
- No bug bounty. No financial compensation for reports.
- No deadline for fixes. Severity informs priority but not commitment.
- The maintainer may decline to fix issues that are working as designed (e.g., "I forgot my passphrase and want recovery" — by design, this isn't possible).

## Coordinated disclosure

If you're reporting a real vulnerability:

- Please give the maintainer reasonable time to assess and fix before any public disclosure. Reasonable depends on severity; 90 days is a common starting point.
- The maintainer will credit you in the fix's commit message and changelog entry if you'd like.
- If there's no response within 14 days, you may proceed with public disclosure on your own timeline.

## What this policy is not

This policy is not a contract. It does not create a legal obligation on the maintainer. The software is provided "as-is" per the MIT license; see `TERMS.md` for the full disclaimer.
