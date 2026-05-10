# Contributing to Plivex

Plivex is a personal project published in the maintainer's individual capacity. This file describes the very limited contribution paths and the terms under which contributions are accepted, so there is no surprise on either side.

## Forking is encouraged. Pull requests are not.

The simplest path for any change you want to make is: fork the repository and run your own copy. Plivex is MIT-licensed; you may modify it and self-host without asking. There is no obligation on the maintainer to merge your changes back.

## What contributions might be accepted

- **Small bug fixes** with a clear reproduction and a focused diff.
- **Documentation typos** and minor copy fixes that do not change a privacy/terms claim.
- **Test additions** that don't require new dependencies.

## What contributions are unlikely to be accepted

- **New runtime dependencies.** Plivex ships zero runtime dependencies. The bar for adding any is very high.
- **New features outside the v1 scope.** Search, tags, sync, multi-device, accounts, native wrappers, server components — all of these are explicit non-goals.
- **Changes to `src/crypto.js`, `src/chain.js`, or `src/storage.js`.** The cryptographic and integrity behavior is intentionally narrow and audited. Changes here, even small ones, require disproportionately careful review.
- **Anything that adds analytics, telemetry, error reporting, version-check pings, or any other phone-home behavior.** These are explicitly forbidden by the privacy policy. PRs touching this area will be closed without merge.
- **Changes to the privacy policy or terms of use** unless directly tied to a code change that requires updated language.
- **UI redesigns or theme changes.** Light theme is a permanent non-goal.

## Process

1. Open an issue first describing what you want to change and why. The maintainer may say no before you spend time.
2. If the change is approved in concept, fork and submit a PR.
3. CI is not configured. Please run `npm test` locally and confirm all tests pass before opening the PR.
4. Keep the diff minimal. Don't bundle unrelated changes.
5. Add or update tests for any code change.

The maintainer's response time is best-effort. PRs may sit unmerged indefinitely. This is not personal — it's the nature of a one-person project.

## Contributor terms

By submitting a contribution to this repository (PR, issue with a code suggestion, etc.), you affirm that:

1. **You are the author** of the contribution, or you have the right to submit it under the project's MIT license.
2. **You license the contribution** under the same MIT terms as the rest of the project.
3. **You are not bound** by any other agreement (employer IP assignment, NDA, etc.) that would make point 2 impossible.

This is the same as the Linux kernel's "Developer Certificate of Origin" approach. There is no separate Contributor License Agreement (CLA) to sign. Submitting the contribution is the affirmation.

If you are not sure whether you have the right to license what you're submitting, please don't submit it.

## Security issues

Do not file public issues for security vulnerabilities. See `SECURITY.md` for the private reporting path.

## Code of conduct

Be respectful. Don't be a jerk. The maintainer reserves the right to close any issue or PR that does not engage in good faith, and to block users who do not.

This project does not have a formal code of conduct document beyond the above. If you'd like a more elaborate one (e.g., the Contributor Covenant), open an issue.

## What this file is not

This file is not a contract. It does not create a legal obligation on the maintainer. The software remains provided "as-is" per the MIT license; see `TERMS.md` for the full disclaimer.
