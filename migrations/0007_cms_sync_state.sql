CREATE TABLE cms_sync_state (
  part TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
