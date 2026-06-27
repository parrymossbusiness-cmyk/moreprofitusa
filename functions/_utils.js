const SECURITY_HEADERS = {
  "cache-control": "no-store, private",
  "pragma": "no-cache",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer"
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

export function optionsResponse(methods = "GET, POST, OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: {
      "allow": methods,
      ...SECURITY_HEADERS
    }
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function requireAdmin(request, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) {
    return {
      ok: false,
      response: json({ error: "ADMIN_TOKEN is not configured in Cloudflare environment variables." }, 500)
    };
  }

  const headerToken = request.headers.get("x-admin-token") || "";
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const supplied = headerToken || bearer;

  if (!supplied || supplied !== configured) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  }
  return { ok: true };
}

export function safeInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

export function safeNum(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampInt(value, minimum, maximum, fallback) {
  const number = safeInt(value, fallback);
  return Math.min(maximum, Math.max(minimum, number));
}

export function tier(score) {
  if (score >= 80) return "Tier 1 - Call Today";
  if (score >= 65) return "Tier 2 - Call This Week";
  if (score >= 50) return "Tier 3 - Nurture";
  return "Skip";
}

function hasWebsite(company) {
  return Boolean(String(company.website || "").trim());
}

function hasCompletedWebsiteEvidence(company) {
  return Boolean(
    company.website_live ||
    company.mobile_score !== null && company.mobile_score !== undefined ||
    company.seo_score !== null && company.seo_score !== undefined ||
    company.accessibility_score !== null && company.accessibility_score !== undefined
  );
}

export function scoreCompanyDetails(company) {
  let score = 0;
  const reasons = [];
  const phone = String(company.business_phone || "").trim();
  const reviews = safeInt(company.review_count);
  const rating = safeNum(company.rating);
  const reviewGap = safeInt(company.review_gap);
  const mobileScore = company.mobile_score === null || company.mobile_score === undefined
    ? null
    : safeInt(company.mobile_score);
  const websitePresent = hasWebsite(company);
  const audited = websitePresent && hasCompletedWebsiteEvidence(company);

  if (phone) {
    score += 20;
    reasons.push("phone available");
  }

  if (reviews >= 200) score += 20;
  else if (reviews >= 75) score += 17;
  else if (reviews >= 25) score += 13;
  else if (reviews >= 10) score += 8;
  if (reviews >= 10) reasons.push(`${reviews} Google reviews`);

  if (rating >= 4.7) score += 10;
  else if (rating >= 4.4) score += 8;
  else if (rating >= 4.0) score += 5;
  if (rating >= 4) reasons.push(`${rating.toFixed(1)} star rating`);

  if (!websitePresent) {
    score += 35;
    reasons.push("no website listed");
  } else if (audited) {
    if (!company.website_live) {
      score += 15;
      reasons.push("website did not pass the live check");
    }
    if (mobileScore !== null && mobileScore < 60) {
      score += 10;
      reasons.push(`mobile score ${mobileScore}`);
    } else if (mobileScore !== null && mobileScore < 75) {
      score += 6;
      reasons.push(`mobile score ${mobileScore}`);
    }
    if (!company.click_to_call_visible) {
      score += 5;
      reasons.push("no click-to-call found");
    }
    if (!company.online_booking_visible) score += 4;
    if (!company.text_back_visible) score += 4;
    if (!company.after_hours_visible) score += 4;
  }

  if (reviewGap >= 250) score += 15;
  else if (reviewGap >= 100) score += 12;
  else if (reviewGap >= 50) score += 8;
  else if (reviewGap >= 20) score += 4;
  if (reviewGap >= 20) reasons.push(`${reviewGap} review competitor gap`);

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reasons
  };
}

export function scoreCompany(company) {
  return scoreCompanyDetails(company).score;
}

export function scoreReason(company) {
  const reasons = scoreCompanyDetails(company).reasons;
  return reasons.slice(0, 4).join("; ") || "Insufficient verified opportunity data";
}

export function primaryHook(company) {
  const reviews = safeInt(company.review_count);
  const rating = safeNum(company.rating);
  const companyName = String(company.company_name || "the business").trim();
  const reviewProof = reviews > 0 ? `${reviews} Google reviews${rating ? ` at ${rating.toFixed(1)} stars` : ""}` : "your Google reputation";

  if (!hasWebsite(company)) {
    return `${companyName} has ${reviewProof}, but no website is listed. I built a practical way to turn that reputation into more calls.`;
  }
  if (company.mobile_score !== null && company.mobile_score !== undefined && safeInt(company.mobile_score) < 60) {
    return `Your website's mobile performance scored ${safeInt(company.mobile_score)}. I found a few changes that could make it easier for mobile visitors to call.`;
  }
  if (safeInt(company.review_gap) >= 20) {
    return `A nearby competitor has ${safeInt(company.review_gap)} more reviews. I mapped out a simple, policy-safe way to narrow that gap.`;
  }
  if (company.website_live && !company.click_to_call_visible) {
    return `I reviewed your website and couldn't find a clear click-to-call path for mobile visitors. I can show you the exact friction point.`;
  }
  if (company.website_live && !company.text_back_visible) {
    return `I couldn't find a text option on your website for callers who don't reach you. I can show you a simple recovery workflow.`;
  }
  return `${companyName} already has ${reviewProof}. I found a few ways to turn more of that trust into calls and booked work.`;
}

export function recommendedOffer(company) {
  if (!hasWebsite(company)) return "Website Launch";
  if (company.mobile_score !== null && company.mobile_score !== undefined && safeInt(company.mobile_score) < 60) {
    return "Website Conversion Upgrade";
  }
  if (safeInt(company.review_gap) >= 20) return "Review Growth System";
  if (company.website_live && !company.text_back_visible) return "Missed-Call Text-Back Pilot";
  return "Revenue Conversion Audit";
}

export function leadId(company) {
  const placeId = String(company.place_id || "").trim();
  if (placeId) return `RC-${placeId}`;
  return `RC-DB-${safeInt(company.id)}`;
}

export function isWalkInCandidate(company) {
  const city = String(company.city || "").trim().toLowerCase();
  const state = String(company.state || "").trim().toUpperCase();
  return state === "AR" && ["white hall", "pine bluff", "little rock"].includes(city) && Boolean(company.formatted_address);
}

export function detectWebsiteSignals(html = "") {
  return {
    click_to_call_visible: /tel:\+?\d|href=["']tel:/i.test(html) ? 1 : 0,
    online_booking_visible: /(book online|schedule online|request appointment|schedule service|book now|online booking|appointment)/i.test(html) ? 1 : 0,
    after_hours_visible: /(24\/7|24 hours|after hours|emergency service|same day|night|weekend)/i.test(html) ? 1 : 0,
    text_back_visible: /(text us|sms|message us|chat with us|live chat|text back)/i.test(html) ? 1 : 0
  };
}

export function csvEscape(value) {
  let string = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(string)) string = `'${string}`;
  if (/[",\r\n]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}

export function responseSecurityHeaders(extraHeaders = {}) {
  return { ...SECURITY_HEADERS, ...extraHeaders };
}
