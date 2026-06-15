// GET /api/lead-export?engine=&minScore=&pitch=&market=&minReviews=  (token via ?token=)
import { checkAuth, MIN_REVIEWS } from "./_engine.js";

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!checkAuth(request, env, url)) return new Response("Unauthorized", { status: 401 });
  if (!env.DB) return new Response("D1 binding DB not found", { status: 500 });

  const engine = url.searchParams.get("engine");
  const minScore = parseInt(url.searchParams.get("minScore") || "0", 10);
  const pitch = url.searchParams.get("pitch");
  const market = url.searchParams.get("market");
  const minReviews = parseInt(url.searchParams.get("minReviews") || String(MIN_REVIEWS), 10);

  const where = ["score >= ?", "review_count >= ?"];
  const args = [isNaN(minScore) ? 0 : minScore, isNaN(minReviews) ? MIN_REVIEWS : minReviews];
  if (engine && engine !== "all") { where.push("engine = ?"); args.push(engine); }
  if (pitch && pitch !== "all") { where.push("pitch = ?"); args.push(pitch); }
  if (market) { where.push("market = ?"); args.push(market); }

  const sql = "SELECT * FROM leads WHERE " + where.join(" AND ") + " ORDER BY score DESC";

  let results;
  try {
    ({ results } = await env.DB.prepare(sql).bind(...args).all());
  } catch (e) {
    return new Response("Query failed: " + String(e), { status: 500 });
  }

  const isLocal = engine === "local";
  const header = [
    "Score", "Pitch", "Company", "Phone", "City",
    ...(isLocal ? ["Address"] : []),
    "Reviews", "Website", "Hook", "Maps",
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const r of results) {
    const reviews = `${r.rating ? r.rating.toFixed(1) : "—"}\u2605 / ${r.review_count}`;
    const row = [
      r.score, r.pitch, r.company, r.phone, r.city,
      ...(isLocal ? [r.address] : []),
      reviews, r.has_website ? "Y" : "N", r.hook, r.maps_url,
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const tag = (pitch && pitch !== "all") ? pitch.toLowerCase().replace(/\s/g, "") : (engine || "all");
  const fname = `leadengine_${tag}_${stamp}.csv`;
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
