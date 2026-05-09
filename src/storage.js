// IndexedDB wrapper. Phase 2 will implement:
//   open/close DB, schema migrations
//   put/get/list entries
//   store/retrieve encrypted master key blob
// Object stores: entries, meta

export const DB_NAME = 'plivex';
export const DB_VERSION = 1;
export const STORE_ENTRIES = 'entries';
export const STORE_META = 'meta';
