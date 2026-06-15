// _engine.js — shared logic for the MoreProfitUSA Lead Engine
// Phone-first lead discovery via Google Places API (New).
// No Apollo. No website/mobile audit. No competitor benchmark.

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

// Field mask: only what we score on. Keeping this lean controls cost + speed.
// (Drop `places.reviews` to cut cost — recency just zeroes out gracefully.)
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.reviews",
].join(",");

// ---- Quality gates --------------------------------------------------------
// Phone is a hard gate (no number, no row).
// Reviews are a hard gate too: under MIN_REVIEWS = spam / lead-gen listings /
// too-new-to-be-a-good-client. Drops the fake "Quality HVAC City Experts" rows.
export const MIN_REVIEWS = 10;

// ---- Scoring weights (tunable) -------------------------------------------
const W_NO_WEBSITE = 35;   // strongest wedge: the premium-site pitch
const W_REVIEWS    = 30;   // call volume + established, payable business
const W_RATING     = 20;   // high rating + volume = inbound = missed-call leak
const W_RECENCY    = 15;   // active & reachable right now

const REVIEW_CAP = 200;    // 200+ reviews = full review points

function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function newestReviewDays(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return Infinity;
  let best = Infinity;
  for (const r of reviews) {
    const d = daysSince(r.publishTime);
    if (d < best) best = d;
  }
  return best;
}

function scoreLead(p) {
  const count = p.userRatingCount || 0;
  const rating = p.rating || 0;
  const hasWebsite = !!p.websiteUri;

  const sWebsite = hasWebsite ? 0 : W_NO_WEBSITE;
  const sReviews = Math.min(count, REVIEW_CAP) / REVIEW_CAP * W_REVIEWS;

  let sRating = 0;
  if (rating >= 3.5) {
    sRating = ((rating - 3.5) / 1.5) * W_RATING;
    if (count < 5) sRating *= 0.3;
  }

  const rd = newestReviewDays(p.reviews);
  let sRecency = 0;
  if (rd <= 30) sRecency = W_RECENCY;
  else if (rd <= 90) sRecency = W_RECENCY * 0.66;
  else if (rd <= 180) sRecency = W_RECENCY * 0.33;

  const total = Math.round(sWebsite + sReviews + sRating + sRecency);

  let pitch;
  if (!hasWebsite) {
    pitch = "NEW WEBSITE";          // no website ⇒ always the website wedge
  } else if (count >= 75 && rating >= 4.5) {
    pitch = "CALL VOLUME";
  } else if (count >= 75) {
    pitch = "REVIEW MGMT";
  } else {
    pitch = "REVIEW MGMT";
  }

  return { score: Math.min(total, 100), pitch };
}

function buildHook(p, pitch) {
  const count = p.userRatingCount || 0;
  const rating = p.rating ? p.rating.toFixed(1) : "—";
  const city = p._city || "your area";

  switch (pitch) {
    case "NEW WEBSITE":
      return `${count} reviews at ${rating}\u2605 and no website — you're the best-kept secret in ${city}. I can fix that this week.`;
    case "CALL VOLUME":
      return `${count} reviews means your phone rings a lot — how many of those calls are you catching when you're on a job?`;
    case "REVIEW MGMT":
    default:
      return `${rating}\u2605 across ${count} reviews — let's turn that into a system that keeps them coming and protects your reputation.`;
  }
}

async function searchPlaces(query, apiKey, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { error: `Places ${res.status}: ${txt.slice(0, 180)}` };
    }
    const data = await res.json();
    return { places: data.places || [] };
  } catch (e) {
    return { error: e.name === "AbortError" ? "timeout" : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function pooled(tasks, limit = 10) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runScan({ apiKey, engine, market, state, cities, queries }) {
  const combos = [];
  for (const city of cities) for (const q of queries) combos.push({ city, q });

  if (combos.length > 45) {
    return {
      error: `Scan too large: ${combos.length} city\u00d7query combos. Cap is 45 (free plan subrequest limit). Reduce cities or queries.`,
    };
  }

  const tasks = combos.map(({ city, q }) => async () => {
    const textQuery = `${q} in ${city}, ${state}`;
    const r = await searchPlaces(textQuery, apiKey);
    if (r.error) return { error: r.error, combo: textQuery };
    for (const p of r.places) p._city = city;
    return { places: r.places };
  });

  const settled = await pooled(tasks, 10);

  const byId = new Map();
  const errors = [];
  let rawCount = 0;
  let droppedNoPhone = 0;
  let droppedLowReviews = 0;

  for (const s of settled) {
    if (s.error) { errors.push(`${s.combo}: ${s.error}`); continue; }
    for (const p of s.places) {
      rawCount++;
      const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || "";
      if (!phone) { droppedNoPhone++; continue; }              // GATE 1: phone
      if ((p.userRatingCount || 0) < MIN_REVIEWS) {            // GATE 2: reviews
        droppedLowReviews++; continue;
      }
      if (byId.has(p.id)) continue;                            // DEDUPE
      const { score, pitch } = scoreLead(p);
      byId.set(p.id, {
        place_id: p.id,
        engine,
        market,
        company: p.displayName?.text || "",
        phone,
        city: p._city || "",
        address: p.formattedAddress || "",
        rating: p.rating || 0,
        review_count: p.userRatingCount || 0,
        has_website: p.websiteUri ? 1 : 0,
        website: p.websiteUri || "",
        score,
        pitch,
        hook: buildHook(p, pitch),
        maps_url: p.googleMapsUri || "",
        scanned_at: new Date().toISOString(),
      });
    }
  }

  const leads = Array.from(byId.values()).sort((a, b) => b.score - a.score);
  return {
    leads,
    stats: {
      combos: combos.length,
      raw: rawCount,
      droppedNoPhone,
      droppedLowReviews,
      unique: leads.length,
      errors,
    },
  };
}

export async function ensureTable(db) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS leads (" +
    "place_id TEXT PRIMARY KEY, engine TEXT, market TEXT, company TEXT, phone TEXT, " +
    "city TEXT, address TEXT, rating REAL, review_count INTEGER, has_website INTEGER, " +
    "website TEXT, score INTEGER, pitch TEXT, hook TEXT, maps_url TEXT, scanned_at TEXT)"
  );
}

export async function saveLeads(db, leads) {
  if (!leads.length) return 0;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO leads " +
    "(place_id, engine, market, company, phone, city, address, rating, review_count, " +
    "has_website, website, score, pitch, hook, maps_url, scanned_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const batch = leads.map((l) =>
    stmt.bind(
      l.place_id, l.engine, l.market, l.company, l.phone, l.city, l.address,
      l.rating, l.review_count, l.has_website, l.website, l.score, l.pitch,
      l.hook, l.maps_url, l.scanned_at
    )
  );
  await db.batch(batch);
  return leads.length;
}

export function checkAuth(request, env, url) {
  const token =
    request.headers.get("x-admin-token") ||
    (url && url.searchParams.get("token")) ||
    "";
  return env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
