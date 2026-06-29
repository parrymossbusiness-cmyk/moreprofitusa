import { csvEscape, clampInt, marketDistanceMiles, matchesCampaign, primaryHook, requireAdmin, responseSecurityHeaders, safeNum, scoreCompany, tier } from "../_utils.js";
import {
  REVENUE_EXPORT_COLUMNS,
  REVENUE_EXPORT_SCHEMA_VERSION
} from "../_revenue_export_schema.js";

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: responseSecurityHeaders({ "allow": "GET, OPTIONS" })
  });
}

function searchTypeTerms(value) {
  return String(value || "")
    .split(/[\n,|]+/)
    .map(term => term.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return new Response("D1 binding DB is missing.", {
    status: 500,
    headers: responseSecurityHeaders()
  });

  const url = new URL(context.request.url);
  const market = (url.searchParams.get("market") || "").trim();
  const minScore = clampInt(url.searchParams.get("minScore"), 0, 100, 50);
  const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 1000);
  const campaign = (url.searchParams.get("campaign") || "all").trim();
  const searchTypes = searchTypeTerms(url.searchParams.get("searchType"));
  const minRating = Math.min(5, Math.max(0, safeNum(url.searchParams.get("minRating"), 4.4)));
  const maxDistance = Math.min(100, Math.max(1, safeNum(url.searchParams.get("maxDistance"), 30)));

  let query = "SELECT * FROM companies WHERE business_phone IS NOT NULL AND TRIM(business_phone) != ''";
  const binds = [];
  if (market) { query += " AND market = ?"; binds.push(market); }
  if (searchTypes.length) {
    query += ` AND LOWER(COALESCE(search_query, primary_type, '')) IN (${searchTypes.map(() => "?").join(",")})`;
    binds.push(...searchTypes);
  }
  query += " ORDER BY review_count DESC LIMIT 2000";

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  const header = REVENUE_EXPORT_COLUMNS.map(column => csvEscape(column.key)).join(",");
  const lines = [header];

  const rankedRows = (rows.results || [])
    .map(row => {
      const currentScore = scoreCompany(row);
      return {
        ...row,
        revenue_leak_score: currentScore,
        priority_tier: tier(currentScore),
        primary_hook: primaryHook(row)
      };
    })
    .filter(row => safeNum(row.rating) >= minRating)
    .filter(row => {
      const distance = marketDistanceMiles(row);
      return distance === null || distance <= maxDistance;
    })
    .filter(row => matchesCampaign(row, campaign))
    .filter(row => row.revenue_leak_score >= minScore)
    .sort((a, b) => b.revenue_leak_score - a.revenue_leak_score || b.review_count - a.review_count || b.review_gap - a.review_gap)
    .slice(0, limit);

  for (const row of rankedRows) {
    lines.push(REVENUE_EXPORT_COLUMNS.map(column => csvEscape(column.value(row))).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${lines.join("\r\n")}`;
  return new Response(csv, {
    headers: responseSecurityHeaders({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="revenue-commander-call-sheet-${stamp}.csv"`,
      "x-export-schema": REVENUE_EXPORT_SCHEMA_VERSION,
      "expires": "0"
    })
  });
}
