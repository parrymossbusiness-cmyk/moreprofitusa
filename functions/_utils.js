export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, x-admin-token",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    }
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function requireAdmin(request, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return { ok: false, response: json({ error: "ADMIN_TOKEN is not configured in Cloudflare environment variables." }, 500) };
  const headerToken = request.headers.get("x-admin-token") || "";
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const supplied = headerToken || bearer || queryToken;
  if (supplied !== configured) return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

export function normalizeDomain(url) {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return ""; }
}

export function safeInt(v, fallback = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function tier(score) {
  if (score >= 80) return "Tier 1 - Loom + Call Same Day";
  if (score >= 65) return "Tier 2 - Email + Call";
  if (score >= 50) return "Tier 3 - Nurture";
  return "Skip";
}

export function primaryHook(company) {
  if ((company.review_gap || 0) >= 250) return "Review Gap";
  if ((company.after_hours_visible || 0) === 0) return "Missed Calls / After-Hours";
  if ((company.mobile_score ?? 100) < 60) return "Mobile Conversion";
  if ((company.text_back_visible || 0) === 0) return "Slow Response / Text-Back";
  return "Revenue Leak";
}

export function scoreCompany(c) {
  let score = 0;
  const reviewGap = safeInt(c.review_gap);
  const rating = safeNum(c.rating);
  const mobileScore = c.mobile_score === null || c.mobile_score === undefined ? null : safeInt(c.mobile_score);
  const competitorReviews = safeInt(c.top_competitor_reviews);

  if (reviewGap >= 1000) score += 30;
  else if (reviewGap >= 500) score += 25;
  else if (reviewGap >= 250) score += 20;
  else if (reviewGap >= 100) score += 15;
  else if (reviewGap >= 50) score += 8;

  if (competitorReviews > 0 && rating > 0) {
    if (rating < 4.2) score += 10;
    else if (rating < 4.5) score += 6;
    else if (rating < 4.7) score += 3;
  }

  if (c.website_live) score += 5; // can afford/operate enough to evaluate
  else score += 10; // no website is itself a strong leak, but may be lower quality

  if (mobileScore !== null) {
    if (mobileScore < 40) score += 15;
    else if (mobileScore < 60) score += 12;
    else if (mobileScore < 75) score += 7;
  }

  if (!c.after_hours_visible) score += 15;
  if (!c.text_back_visible) score += 10;
  if (!c.online_booking_visible) score += 5;
  if (!c.click_to_call_visible) score += 5;

  const hotMarkets = ["AZ", "TX", "FL", "NV", "CA"];
  if (hotMarkets.includes((c.state || "").toUpperCase())) score += 10;

  // Avoid weird scores over 100.
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function detectWebsiteSignals(html = "") {
  const h = html.toLowerCase();
  return {
    click_to_call_visible: /tel:\+?\d|href=["']tel:/i.test(html) ? 1 : 0,
    online_booking_visible: /(book online|schedule online|request appointment|schedule service|book now|online booking|appointment)/i.test(html) ? 1 : 0,
    after_hours_visible: /(24\/7|24 hours|after hours|emergency service|emergency ac|same day|night|weekend)/i.test(html) ? 1 : 0,
    text_back_visible: /(text us|sms|message us|chat with us|live chat|text back)/i.test(html) ? 1 : 0,
  };
}

export function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
