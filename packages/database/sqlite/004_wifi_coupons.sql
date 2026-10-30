CREATE TABLE wifi_coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(code) > 0 AND code NOT GLOB '*[^0-9]*'),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'delivered')),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  delivered_by TEXT REFERENCES users(id),
  delivered_at TEXT
);
CREATE INDEX wifi_coupons_status_idx ON wifi_coupons(status, uploaded_at, code);
