import {
  clampInt,
  json,
  optionsResponse,
  primaryHook,
  readJson,
  requireAdmin,
  safeNum,
  scoreCompany,
  tier,
  distanceMilesBetween
} from "../_utils.js";

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

function placeToCompany(place, meta) {
  return {
    place_id: place.id || "",
    market: meta.market || `${meta.city}, ${meta.state}`,
    city: meta.city || "",
    state: meta.state || "",
    search_query: meta.query || "",
    company_name: place.displayName?.text || "",
    formatted_address: place.formattedAddress || "",
    latitude: place.location?.latitude || null,
    longitude: place.location?.longitude || null,
    google_maps_url: place.googleMapsUri || "",
    website: place.websiteUri || "",
    business_phone: place.nationalPhoneNumber || place.internationalPhoneNumber || "",
    primary_type: place.primaryType || (place.types || [])[0] || "",
    rating: place.rating || null,
    review_count: place.userRatingCount || 0
  };
}

async function searchPlaces(env, query, city, state, limit, radiusMiles) {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");

  const body = {
    textQuery: `${query} in ${city.city}, ${state}`,
    pageSize: Math.min(Math.max(Number(limit || 20), 1), 20),
    languageCode: "en",
    regionCode: "US",
    includePureServiceAreaBusinesses: true
  };
  if (Number.isFinite(city.latitude) && Number.isFinite(city.longitude)) {
    body.locationBias = {
      circle: {
        center: { latitude: city.latitude, longitude: city.longitude },
        radius: Math.min(50000, Math.max(8047, radiusMiles * 1609.344))
      }
    };
  }

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.googleMapsUri",
    "places.websiteUri",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.rating",
    "places.userRatingCount",
    "places.primaryType",
    "places.types"
  ].join(",");

  const resp = await fetch(GOOGLE_PLACES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Places error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.places || [];
}

async function upsertCompany(env, c) {
  const score = scoreCompany(c);
  const pHook = primaryHook({ ...c, revenue_leak_score: score });
  const priority = tier(score);

  const stmt = env.DB.prepare(`
    INSERT INTO companies (
      place_id, market, city, state, search_query, company_name, formatted_address, latitude, longitude,
      google_maps_url, website, business_phone, primary_type, rating, review_count,
      revenue_leak_score, priority_tier, primary_hook, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(place_id) DO UPDATE SET
      market=excluded.market,
      city=excluded.city,
      state=excluded.state,
      search_query=excluded.search_query,
      company_name=excluded.company_name,
      formatted_address=excluded.formatted_address,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      google_maps_url=excluded.google_maps_url,
      website=excluded.website,
      business_phone=excluded.business_phone,
      primary_type=excluded.primary_type,
      rating=excluded.rating,
      review_count=excluded.review_count,
      revenue_leak_score=excluded.revenue_leak_score,
      priority_tier=excluded.priority_tier,
      primary_hook=excluded.primary_hook,
      updated_at=CURRENT_TIMESTAMP
  `);

  await stmt.bind(
    c.place_id, c.market, c.city, c.state, c.search_query, c.company_name, c.formatted_address,
    c.latitude, c.longitude, c.google_maps_url, c.website, c.business_phone, c.primary_type,
    c.rating, c.review_count, score, priority, pHook
  ).run();
}

export async function onRequestOptions() { return optionsResponse("POST, OPTIONS"); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await readJson(context.request);
  const cities = (Array.isArray(body.cities) ? body.cities : [{ city: body.city, state: body.state }])
    .map(item => ({
      city: String(item?.city || "").trim(),
      state: String(item?.state || body.state || "").trim().toUpperCase(),
      latitude: Number(item?.latitude),
      longitude: Number(item?.longitude)
    }))
    .filter(item => item.city && item.state)
    .slice(0, 10);
  const queries = (Array.isArray(body.queries) ? body.queries : [])
    .map(query => String(query || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  const limitPerQuery = clampInt(body.limitPerQuery, 1, 20, 20);
  const minReviews = clampInt(body.minReviews, 0, 10000, 10);
  const minRating = Math.min(5, Math.max(0, safeNum(body.minRating, 4.4)));
  const radiusMiles = Math.min(31, Math.max(5, safeNum(body.radiusMiles, 30)));
  const marketName = String(body.market || `${cities[0]?.city || "Market"}, ${cities[0]?.state || ""}`).trim();

  if (!marketName) return json({ error: "Market name is required." }, 400);
  if (!cities.length) return json({ error: "Add at least one city and state." }, 400);
  if (!queries.length) return json({ error: "Add at least one business type." }, 400);
  if (cities.length * queries.length > 30) {
    return json({ error: "This scan is too large. Keep cities × business types at 30 or fewer to control time and API usage." }, 400);
  }

  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  let totalFound = 0;
  let totalSaved = 0;
  let skippedNoPhone = 0;
  let skippedLowReviews = 0;
  let skippedLowRating = 0;
  let skippedOutsideRadius = 0;
  const errors = [];
  const seenPlaceIds = new Set();

  for (const c of cities) {
    for (const q of queries) {
      try {
        const places = await searchPlaces(context.env, q, c, c.state, limitPerQuery, radiusMiles);
        totalFound += places.length;
        for (const place of places) {
          const company = placeToCompany(place, { market: marketName, city: c.city, state: c.state, query: q });
          if (!company.place_id || !company.company_name) continue;
          if (!company.business_phone) { skippedNoPhone += 1; continue; }
          if (company.review_count < minReviews) { skippedLowReviews += 1; continue; }
          if (safeNum(company.rating) < minRating) { skippedLowRating += 1; continue; }
          if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && company.latitude !== null && company.longitude !== null) {
            const distance = distanceMilesBetween(c.latitude, c.longitude, company.latitude, company.longitude);
            if (distance !== null && distance > radiusMiles) { skippedOutsideRadius += 1; continue; }
          }
          if (seenPlaceIds.has(company.place_id)) continue;
          seenPlaceIds.add(company.place_id);
          await upsertCompany(context.env, company);
          totalSaved += 1;
        }
        await context.env.DB.prepare(`
          INSERT INTO scans (market, city, state, query, requested_limit, inserted_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(marketName, c.city, c.state, q, limitPerQuery, places.length).run();
      } catch (e) {
        errors.push({ city: c.city, query: q, error: e.message });
      }
    }
  }

  return json({
    ok: true,
    market: marketName,
    totalFound,
    totalSaved,
    skippedNoPhone,
    skippedLowReviews,
    skippedLowRating,
    skippedOutsideRadius,
    minRating,
    radiusMiles,
    errors
  });
}
