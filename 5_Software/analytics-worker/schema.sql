CREATE TABLE IF NOT EXISTS analytics_daily (
    date TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    page_views INTEGER NOT NULL DEFAULT 0,
    referrer_visits INTEGER NOT NULL DEFAULT 0,
    sample_interval REAL,
    source_window_start TEXT NOT NULL,
    source_window_end TEXT NOT NULL,
    collected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_daily_host_date_idx
    ON analytics_daily (host, date);

CREATE TABLE IF NOT EXISTS analytics_raw_archive (
    date TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    object_key TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    datasets_json TEXT NOT NULL,
    source_window_start TEXT NOT NULL,
    source_window_end TEXT NOT NULL,
    collected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_raw_archive_host_date_idx
    ON analytics_raw_archive (host, date);

CREATE TABLE IF NOT EXISTS analytics_raw_parts (
    date TEXT NOT NULL,
    part_no INTEGER NOT NULL,
    part_count INTEGER NOT NULL,
    host TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    collected_at TEXT NOT NULL,
    PRIMARY KEY (date, part_no)
);

CREATE INDEX IF NOT EXISTS analytics_raw_parts_host_date_idx
    ON analytics_raw_parts (host, date, part_no);
