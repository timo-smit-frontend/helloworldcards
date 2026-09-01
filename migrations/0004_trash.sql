ALTER TABLE products ADD COLUMN deleted_at TEXT;
ALTER TABLE events ADD COLUMN deleted_at TEXT;
ALTER TABLE faqs ADD COLUMN deleted_at TEXT;
ALTER TABLE pages ADD COLUMN deleted_at TEXT;
