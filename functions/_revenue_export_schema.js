import {
  isWalkInCandidate,
  leadId,
  primaryHook,
  recommendedOffer,
  scoreReason
} from "./_utils.js";

export const REVENUE_EXPORT_SCHEMA_VERSION = "revenue_commander_v1";

// Keep this order stable. Additive changes require a new schema version.
export const REVENUE_EXPORT_COLUMNS = [
  { key: "schema_version", value: () => REVENUE_EXPORT_SCHEMA_VERSION },
  { key: "lead_id", value: leadId },
  { key: "discovered_at", value: row => row.created_at || "" },
  { key: "last_verified_at", value: row => row.updated_at || "" },
  { key: "market", value: row => row.market || "" },
  { key: "state", value: row => row.state || "" },
  { key: "city", value: row => row.city || "" },
  { key: "company", value: row => row.company_name || "" },
  { key: "category", value: row => row.primary_type || row.search_query || "" },
  { key: "phone", value: row => row.business_phone || "" },
  { key: "address", value: row => row.formatted_address || "" },
  { key: "rating", value: row => row.rating ?? "" },
  { key: "review_count", value: row => row.review_count ?? 0 },
  { key: "has_website", value: row => row.website ? "Yes" : "No" },
  { key: "website_url", value: row => row.website || "" },
  { key: "mobile_score", value: row => row.mobile_score ?? "" },
  { key: "top_competitor", value: row => row.top_competitor_name || "" },
  { key: "competitor_reviews", value: row => row.top_competitor_reviews ?? 0 },
  { key: "review_gap", value: row => row.review_gap ?? 0 },
  { key: "review_gap_pct", value: row => row.review_gap_pct ?? 0 },
  { key: "score", value: row => row.revenue_leak_score ?? 0 },
  { key: "priority_tier", value: row => row.priority_tier || "" },
  { key: "score_reason", value: scoreReason },
  { key: "recommended_offer", value: recommendedOffer },
  { key: "opening_line", value: primaryHook },
  { key: "walk_in_candidate", value: row => isWalkInCandidate(row) ? "Yes" : "No" },
  { key: "maps_url", value: row => row.google_maps_url || "" },
  { key: "contact_status", value: () => "New" },
  { key: "decision_maker", value: () => "" },
  { key: "last_contacted_at", value: () => "" },
  { key: "next_follow_up_at", value: () => "" },
  { key: "quoted_price", value: () => "" },
  { key: "cash_collected", value: () => "" },
  { key: "notes", value: () => "" },
  { key: "lost_reason", value: () => "" }
];
