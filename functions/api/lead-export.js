// GET /api/lead-export?engine=&minScore=&pitch=&market=&minReviews=
// Authentication is accepted only through the x-admin-token request header.
import { csvEscape, responseSecurityHeaders } from "../_utils.js";
import { checkAuth, MIN_REVIEWS } from "./_engine.js";

const SCHEMA_VERSION = "lead_engine_v1";
const COLUMNS = [
  { key: "schema_version", value: () => SCHEMA_VERSION },
  { key: "lead_id", value: row => `LE-${row.place_id}` },
  { key: "discovered_at", value: row => row.scanned_at || "" },
  { key: "last_verified_at", value: row => row.scanned_at || "" },
  { key: "engine", value: row => row.engine || "" },
  { key: "market", value: row => row.market || "" },
  { key: "city", value: row => row.city || "" },
  { key: "company", value: row => row.company || "" },
  { key: "phone", value: row => row.phone || "" },
  { key: "address", value: row => row.address || "" },
  { key: "rating", value: row => row.rating ?? "" },
  { key: "review_count", value: row => row.review_count ?? 0 },
  { key: "has_website", value: row => row.has_website ? "Yes" : "No" },
  { key: "website_url", value: row => row.website || "" },
  { key: "score", value: row => row.score ?? 0 },
  { key: "pitch", value: row => row.pitch || "" },
  { key: "hook", value: row => row.hook || "" },
  { key: "maps_url", value: row => row.maps_url || "" },
  { key: "contact_status", value: () => "New" },
  { key: "decision_maker", value: () => "" },
  { key: "last_contacted_at", value: () => "" },
  { key: "next_follow_up_at", value: () => "" },
  { key: "quoted_price", value: () => "" },
  { key: "cash_collected", value: () => "" },
  { key: "notes", value: () => "" },
  { key: "lost_reason", value: () => "" }
];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!checkAuth(request, env)) return new Response("Unauthorized", { status: 401, headers: responseSecurityHeaders() });
  if (!env.DB) return new Response("D1 binding DB not found", { status: 500, headers: responseSecurityHeaders() });

  const engine = url.searchParams.get("engine");
  const minScore = Number.parseInt(url.searchParams.get("minScore") || "0", 10);
  const pitch = url.searchParams.get("pitch");
  const market = url.searchParams.get("market");
  const minReviews = Number.parseInt(url.searchParams.get("minReviews") || String(MIN_REVIEWS), 10);

  const where = ["score >= ?", "review_count >= ?"];
  const args = [Number.isNaN(minScore) ? 0 : minScore, Number.isNaN(minReviews) ? MIN_REVIEWS : minReviews];
  if (engine && engine !== "all") { where.push("engine = ?"); args.push(engine); }
  if (pitch && pitch !== "all") { where.push("pitch = ?"); args.push(pitch); }
  if (market) { where.push("market = ?"); args.push(market); }

  const sql = "SELECT place_id, engine, market, company, phone, city, address, rating, review_count, has_website, website, score, pitch, hook, maps_url, scanned_at FROM leads WHERE " + where.join(" AND ") + " ORDER BY score DESC";

  let results;
  try {
    ({ results } = await env.DB.prepare(sql).bind(...args).all());
  } catch (error) {
    return new Response("Query failed: " + String(error), { status: 500, headers: responseSecurityHeaders() });
  }

  const lines = [COLUMNS.map(column => csvEscape(column.key)).join(",")];
  for (const row of results) {
    lines.push(COLUMNS.map(column => csvEscape(column.value(row))).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const tag = pitch && pitch !== "all" ? pitch.toLowerCase().replace(/\s/g, "") : engine || "all";
  const filename = `leadengine_${tag}_${stamp}.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: responseSecurityHeaders({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Schema": SCHEMA_VERSION
    })
  });
}
