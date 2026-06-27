import { json, optionsResponse, readJson, requireAdmin, detectWebsiteSignals, scoreCompany, tier, primaryHook } from "../_utils.js";

async function checkWebsite(url) {
  if (!url) return { website_live: 0, https_ok: 0, html: "", status: null, final_url: "" };
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  let parsed;
  try { parsed = new URL(normalized); } catch { return { website_live: 0, https_ok: 0, html: "", status: null, final_url: "", error: "Invalid website URL" }; }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { website_live: 0, https_ok: 0, html: "", status: null, final_url: "", error: "Unsupported website protocol" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local")) {
    return { website_live: 0, https_ok: 0, html: "", status: null, final_url: "", error: "Local website addresses are not audited" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "MoreProfitUSA-RevenueCommander/1.0" }
    });
    const contentType = resp.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await resp.text() : "";
    return {
      website_live: resp.ok ? 1 : 0,
      https_ok: normalized.startsWith("https://") && resp.ok ? 1 : 0,
      html: html.slice(0, 250000),
      status: resp.status,
      final_url: resp.url
    };
  } catch (e) {
    return { website_live: 0, https_ok: 0, html: "", status: null, final_url: "", error: e.name === "AbortError" ? "Website check timed out" : e.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPageSpeed(env, url) {
  if (!url) return { mobile_score: null, seo_score: null, accessibility_score: null };
  const key = env.PAGESPEED_API_KEY || env.GOOGLE_MAPS_API_KEY;
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url.startsWith("http") ? url : `https://${url}`);
  u.searchParams.set("strategy", "mobile");
  u.searchParams.set("category", "performance");
  u.searchParams.append("category", "seo");
  u.searchParams.append("category", "accessibility");
  if (key) u.searchParams.set("key", key);

  try {
    const resp = await fetch(u.toString());
    if (!resp.ok) return { mobile_score: null, seo_score: null, accessibility_score: null, pagespeed_error: await resp.text() };
    const data = await resp.json();
    const cats = data.lighthouseResult?.categories || {};
    return {
      mobile_score: cats.performance?.score !== undefined ? Math.round(cats.performance.score * 100) : null,
      seo_score: cats.seo?.score !== undefined ? Math.round(cats.seo.score * 100) : null,
      accessibility_score: cats.accessibility?.score !== undefined ? Math.round(cats.accessibility.score * 100) : null
    };
  } catch (e) {
    return { mobile_score: null, seo_score: null, accessibility_score: null, pagespeed_error: e.message };
  }
}

export async function onRequestOptions() { return optionsResponse("POST, OPTIONS"); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const body = await readJson(context.request);
  const limit = Math.min(Number(body.limit || 25), 100);
  const market = body.market || null;
  const onlyUnaudited = body.onlyUnaudited !== false;

  let query = `SELECT * FROM companies WHERE website IS NOT NULL AND website != ''`;
  const binds = [];
  if (market) { query += ` AND market = ?`; binds.push(market); }
  if (onlyUnaudited) query += ` AND (mobile_score IS NULL OR website_live = 0)`;
  query += ` ORDER BY review_count DESC LIMIT ?`;
  binds.push(limit);

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  const audited = [];

  for (const company of rows.results || []) {
    const website = company.website;
    const site = await checkWebsite(website);
    const signals = detectWebsiteSignals(site.html || "");
    const psi = site.website_live ? await runPageSpeed(context.env, site.final_url || website) : { mobile_score: null, seo_score: null, accessibility_score: null };
    const updated = { ...company, ...site, ...signals, ...psi };
    updated.revenue_leak_score = scoreCompany(updated);
    updated.priority_tier = tier(updated.revenue_leak_score);
    updated.primary_hook = primaryHook(updated);

    await context.env.DB.prepare(`
      UPDATE companies SET
        website_live=?, https_ok=?, mobile_score=?, seo_score=?, accessibility_score=?,
        click_to_call_visible=?, online_booking_visible=?, after_hours_visible=?, text_back_visible=?,
        revenue_leak_score=?, priority_tier=?, primary_hook=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      site.website_live, site.https_ok,
      psi.mobile_score, psi.seo_score, psi.accessibility_score,
      signals.click_to_call_visible, signals.online_booking_visible, signals.after_hours_visible, signals.text_back_visible,
      updated.revenue_leak_score, updated.priority_tier, updated.primary_hook, company.id
    ).run();

    audited.push({ id: company.id, company_name: company.company_name, website, website_live: site.website_live, mobile_score: psi.mobile_score, score: updated.revenue_leak_score, hook: updated.primary_hook });
  }

  return json({ ok: true, auditedCount: audited.length, audited });
}
