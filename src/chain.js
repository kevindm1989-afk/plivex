// SHA-256 hash chain. Phase 2 will implement:
//   computeHash(prevHash, payload, timestamp)
//   appendEntry(payload)
//   verifyChain()
// Entry shape: { id, uuid, created_at, payload, prev_hash, entry_hash, supersedes? }

export const GENESIS_PREV_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';
