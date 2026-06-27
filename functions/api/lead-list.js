// GET /api/lead-list?engine=&minScore=&pitch=&market=&minReviews=&limit=  (token via header)
import { checkAuth, json, MIN_REVIEWS } from "./_engine.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.DB) return json({ error: "D1 binding DB not found" }, 500);

  const engine = url.searchParams.get("engine");
  const minScore = parseInt(url.searchParams.get("minScore") || "0", 10);
  const pitch = url.searchParams.get("pitch");
  const market = url.searchParams.get("market");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
  // Review floor: defaults to MIN_REVIEWS (10), filters out already-saved spam.
  const minReviews = parseInt(url.searchParams.get("minReviews") || String(MIN_REVIEWS), 10);

  const where = ["score >= ?", "review_count >= ?"];
  const args = [isNaN(minScore) ? 0 : minScore, isNaN(minReviews) ? MIN_REVIEWS : minReviews];
  if (engine && engine !== "all") { where.push("engine = ?"); args.push(engine); }
  if (pitch && pitch !== "all") { where.push("pitch = ?"); args.push(pitch); }
  if (market) { where.push("market = ?"); args.push(market); }

  const sql = "SELECT * FROM leads WHERE " + where.join(" AND ") + " ORDER BY score DESC LIMIT ?";
  args.push(limit);

  try {
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json({ ok: true, count: results.length, leads: results });
  } catch (e) {
    return json({ error: "Query failed: " + String(e) }, 500);
  }
}
