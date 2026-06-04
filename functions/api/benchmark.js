import { json, readJson, requireAdmin, scoreCompany, tier, primaryHook } from "../_utils.js";

export async function onRequestOptions() { return json({ ok: true }); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const body = await readJson(context.request);
  const market = body.market || null;
  let where = "";
  const binds = [];
  if (market) { where = "WHERE market = ?"; binds.push(market); }

  const rows = await context.env.DB.prepare(`SELECT * FROM companies ${where}`).bind(...binds).all();
  const companies = rows.results || [];

  const byCity = new Map();
  for (const c of companies) {
    const key = `${c.market || ""}|${c.city || ""}`;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(c);
  }

  let updated = 0;
  for (const group of byCity.values()) {
    const ranked = [...group].sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    const top3 = ranked.slice(0, 3);
    const avgTop3 = Math.round(top3.reduce((sum, c) => sum + (c.review_count || 0), 0) / Math.max(top3.length, 1));

    for (const c of group) {
      const competitor = ranked.find(x => x.place_id !== c.place_id) || null;
      const topReviews = competitor?.review_count || 0;
      const reviewGap = Math.max(0, topReviews - (c.review_count || 0));
      const reviewGapPct = topReviews > 0 ? Math.round((reviewGap / topReviews) * 1000) / 10 : 0;
      const merged = { ...c, top_competitor_name: competitor?.company_name || "", top_competitor_reviews: topReviews, avg_top3_reviews: avgTop3, review_gap: reviewGap, review_gap_pct: reviewGapPct };
      const score = scoreCompany(merged);
      await context.env.DB.prepare(`
        UPDATE companies SET
          top_competitor_name=?, top_competitor_reviews=?, avg_top3_reviews=?, review_gap=?, review_gap_pct=?,
          revenue_leak_score=?, priority_tier=?, primary_hook=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        merged.top_competitor_name, topReviews, avgTop3, reviewGap, reviewGapPct,
        score, tier(score), primaryHook({ ...merged, revenue_leak_score: score }), c.id
      ).run();
      updated++;
    }
  }

  return json({ ok: true, market, updated });
}
