import { json, requireAdmin } from "../_utils.js";

export async function onRequestOptions() { return json({ ok: true }); }

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const url = new URL(context.request.url);
  const market = url.searchParams.get("market");
  const tierParam = url.searchParams.get("tier");
  const minScore = Number(url.searchParams.get("minScore") || 0);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  let query = `SELECT * FROM companies WHERE revenue_leak_score >= ?`;
  const binds = [minScore];
  if (market) { query += ` AND market = ?`; binds.push(market); }
  if (tierParam) { query += ` AND priority_tier LIKE ?`; binds.push(`${tierParam}%`); }
  query += ` ORDER BY revenue_leak_score DESC, review_gap DESC LIMIT ?`;
  binds.push(limit);

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  return json({ ok: true, count: rows.results?.length || 0, companies: rows.results || [] });
}
