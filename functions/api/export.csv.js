import { requireAdmin, csvEscape } from "../_utils.js";

export async function onRequestOptions() {
  return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-admin-token", "access-control-allow-methods": "GET, OPTIONS" } });
}

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return new Response("D1 binding DB is missing.", { status: 500 });

  const url = new URL(context.request.url);
  const market = url.searchParams.get("market");
  const minScore = Number(url.searchParams.get("minScore") || 65);
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);

  let query = `SELECT * FROM companies WHERE revenue_leak_score >= ?`;
  const binds = [minScore];
  if (market) { query += ` AND market = ?`; binds.push(market); }
  query += ` ORDER BY revenue_leak_score DESC, review_gap DESC LIMIT ?`;
  binds.push(limit);

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  const fields = [
    "market", "city", "state", "company_name", "website", "business_phone", "rating", "review_count",
    "top_competitor_name", "top_competitor_reviews", "review_gap", "review_gap_pct", "mobile_score",
    "website_live", "click_to_call_visible", "online_booking_visible", "after_hours_visible", "text_back_visible",
    "revenue_leak_score", "priority_tier", "primary_hook", "google_maps_url", "apollo_contact_name", "apollo_title", "apollo_email", "apollo_phone", "status"
  ];
  const lines = [fields.join(",")];
  for (const row of rows.results || []) lines.push(fields.map(f => csvEscape(row[f])).join(","));

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="revenue-commander-export.csv"`,
      "access-control-allow-origin": "*"
    }
  });
}
