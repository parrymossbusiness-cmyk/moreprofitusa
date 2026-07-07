import {
  primaryHook,
  scoreReason
} from "./_utils.js";

export const REVENUE_EXPORT_SCHEMA_VERSION = "revenue_commander_v3_lean_sales";

// Keep this order stable. Additive changes require a new schema version.
export const REVENUE_EXPORT_COLUMNS = [
  { key: "market", value: row => row.market || "" },
  { key: "city", value: row => row.city || "" },
  { key: "company", value: row => row.company_name || "" },
  { key: "phone", value: row => row.business_phone || "" },
  { key: "address", value: row => row.formatted_address || "" },
  { key: "service_type", value: row => row.search_query || row.primary_type || "" },
  { key: "google_category", value: row => row.primary_type || "" },
  { key: "rating", value: row => row.rating ?? "" },
  { key: "review_count", value: row => row.review_count ?? 0 },
  { key: "website_status", value: row => row.website ? "Website listed on Google" : "No website listed on Google" },
  { key: "top_competitor", value: row => row.top_competitor_name || "" },
  { key: "competitor_reviews", value: row => row.top_competitor_reviews ?? 0 },
  { key: "review_gap", value: row => row.review_gap ?? 0 },
  { key: "review_gap_pct", value: row => row.review_gap_pct ?? 0 },
  { key: "score", value: row => row.revenue_leak_score ?? 0 },
  { key: "priority", value: row => row.priority_tier || "" },
  { key: "score_reason", value: scoreReason },
  { key: "opening_line", value: primaryHook },
  { key: "google_maps_url", value: row => row.google_maps_url || "" },
  { key: "contact_status", value: () => "New" },
  { key: "notes", value: () => "" }
];
