CREATE TABLE media_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
ALTER TABLE media ADD COLUMN folder_id INTEGER;
CREATE INDEX idx_media_folder ON media (folder_id);
