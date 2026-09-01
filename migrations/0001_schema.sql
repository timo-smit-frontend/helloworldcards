CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE nav_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location TEXT NOT NULL CHECK (location IN ('header', 'footer')),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  pokemon_id INTEGER,
  price TEXT,
  language TEXT,
  grader TEXT,
  year INTEGER,
  marktplaats_url TEXT,
  slug TEXT NOT NULL UNIQUE,
  cost REAL,
  sold INTEGER NOT NULL DEFAULT 0,
  concept INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT,
  acquired_at TEXT,
  grade REAL,
  cardmarket_url TEXT,
  reverse_holo INTEGER NOT NULL DEFAULT 0,
  first_edition INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  location TEXT NOT NULL
);

CREATE TABLE faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_image TEXT,
  blocks TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_products_sold ON products (sold);
CREATE INDEX idx_products_slug ON products (slug);
CREATE INDEX idx_events_date ON events (date);
CREATE INDEX idx_pages_status ON pages (status);
CREATE INDEX idx_nav_location_sort ON nav_items (location, sort);
