// POST /api/lead-scan
// Body: { engine, market, state, cities[], queries[] }  (token via x-admin-token header)
import { runScan, ensureTable, saveLeads, checkAuth, json } from "./_engine.js";

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.GOOGLE_MAPS_API_KEY) return json({ error: "GOOGLE_MAPS_API_KEY not set" }, 500);
  if (!env.DB) return json({ error: "D1 binding DB not found" }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const engine = body.engine === "local" ? "local" : "national";
  const market = (body.market || "").trim();
  const state = (body.state || "").trim();
  const cities = (body.cities || []).map((c) => c.trim()).filter(Boolean);
  const queries = (body.queries || []).map((q) => q.trim()).filter(Boolean);

  if (!market) return json({ error: "Market name required" }, 400);
  if (!state) return json({ error: "State required" }, 400);
  if (!cities.length) return json({ error: "At least one city required" }, 400);
  if (!queries.length) return json({ error: "At least one search query required" }, 400);

  const result = await runScan({
    apiKey: env.GOOGLE_MAPS_API_KEY,
    engine, market, state, cities, queries,
  });
  if (result.error) return json({ error: result.error }, 400);

  try {
    await ensureTable(env.DB);
    await saveLeads(env.DB, result.leads);
  } catch (e) {
    return json({ error: "DB write failed: " + String(e) }, 500);
  }

  return json({
    ok: true,
    stats: result.stats,
    saved: result.leads.length,
    preview: result.leads.slice(0, 20),
  });
}
