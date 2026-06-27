import {
  clampInt,
  isWalkInCandidate,
  json,
  leadId,
  optionsResponse,
  primaryHook,
  recommendedOffer,
  requireAdmin,
  scoreCompany,
  scoreReason,
  tier
} from "../_utils.js";

const COMPANY_FIELDS = [
  "id", "place_id", "market", "city", "state", "search_query", "company_name",
  "formatted_address", "google_maps_url", "website", "business_phone", "primary_type",
  "rating", "review_count", "top_competitor_name", "top_competitor_reviews",
  "avg_top3_reviews", "review_gap", "review_gap_pct", "website_live", "https_ok",
  "mobile_score", "seo_score", "accessibility_score", "click_to_call_visible",
  "online_booking_visible", "after_hours_visible", "text_back_visible",
  "revenue_leak_score", "priority_tier", "primary_hook", "status", "created_at", "updated_at"
].join(", ");

export async function onRequestOptions() {
  return optionsResponse("GET, OPTIONS");
}

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const url = new URL(context.request.url);
  const market = (url.searchParams.get("market") || "").trim();
  const tierParam = (url.searchParams.get("tier") || "").trim();
  const minScore = clampInt(url.searchParams.get("minScore"), 0, 100, 0);
  const limit = clampInt(url.searchParams.get("limit"), 1, 500, 40);
  const phoneOnly = url.searchParams.get("phoneOnly") !== "0";

  let query = `SELECT ${COMPANY_FIELDS} FROM companies WHERE 1 = 1`;
  const binds = [];
  if (market) { query += " AND market = ?"; binds.push(market); }
  if (phoneOnly) query += " AND business_phone IS NOT NULL AND TRIM(business_phone) != ''";
  query += " ORDER BY review_count DESC LIMIT 1000";

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  const companies = (rows.results || [])
    .map(row => {
      const currentScore = scoreCompany(row);
      const currentTier = tier(currentScore);
      return {
        ...row,
        revenue_leak_score: currentScore,
        priority_tier: currentTier,
        lead_id: leadId(row),
        score_reason: scoreReason(row),
        recommended_offer: recommendedOffer(row),
        opening_line: primaryHook(row),
        walk_in_candidate: isWalkInCandidate(row)
      };
    })
    .filter(row => row.revenue_leak_score >= minScore)
    .filter(row => !tierParam || row.priority_tier.startsWith(tierParam))
    .sort((a, b) => b.revenue_leak_score - a.revenue_leak_score || b.review_count - a.review_count || b.review_gap - a.review_gap)
    .slice(0, limit);

  return json({ ok: true, count: companies.length, companies });
}
