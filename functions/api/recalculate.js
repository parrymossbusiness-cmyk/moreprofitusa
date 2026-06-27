import { json, optionsResponse, requireAdmin, scoreCompany, tier, primaryHook } from "../_utils.js";

export async function onRequestOptions() { return optionsResponse("POST, OPTIONS"); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const rows = await context.env.DB.prepare(`SELECT * FROM companies`).all();
  let updated = 0;
  for (const row of rows.results || []) {
    const score = scoreCompany(row);
    await context.env.DB.prepare(`UPDATE companies SET revenue_leak_score=?, priority_tier=?, primary_hook=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(score, tier(score), primaryHook({ ...row, revenue_leak_score: score }), row.id).run();
    updated++;
  }
  return json({ ok: true, updated });
}
