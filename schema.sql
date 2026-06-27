-- More Profit USA Revenue Commander internal market scanner schema
-- Run locally with: npx wrangler d1 execute moreprofit_revenue_commander --local --file=schema.sql
-- Run production with: npx wrangler d1 execute moreprofit_revenue_commander --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE,
  market TEXT,
  city TEXT,
  state TEXT,
  search_query TEXT,
  company_name TEXT NOT NULL,
  formatted_address TEXT,
  latitude REAL,
  longitude REAL,
  google_maps_url TEXT,
  website TEXT,
  business_phone TEXT,
  primary_type TEXT,
  rating REAL,
  review_count INTEGER DEFAULT 0,
  top_competitor_name TEXT,
  top_competitor_reviews INTEGER DEFAULT 0,
  avg_top3_reviews INTEGER DEFAULT 0,
  review_gap INTEGER DEFAULT 0,
  review_gap_pct REAL DEFAULT 0,
  website_live INTEGER DEFAULT 0,
  https_ok INTEGER DEFAULT 0,
  mobile_score INTEGER,
  seo_score INTEGER,
  accessibility_score INTEGER,
  click_to_call_visible INTEGER DEFAULT 0,
  online_booking_visible INTEGER DEFAULT 0,
  after_hours_visible INTEGER DEFAULT 0,
  text_back_visible INTEGER DEFAULT 0,
  revenue_leak_score INTEGER DEFAULT 0,
  priority_tier TEXT DEFAULT 'Unscored',
  primary_hook TEXT,
  status TEXT DEFAULT 'New',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_market ON companies(market);
CREATE INDEX IF NOT EXISTS idx_companies_city ON companies(city);
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(revenue_leak_score DESC);
CREATE INDEX IF NOT EXISTS idx_companies_place_id ON companies(place_id);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL,
  city TEXT,
  state TEXT,
  query TEXT,
  requested_limit INTEGER,
  inserted_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
