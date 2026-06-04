import { json, readJson, requireAdmin, scoreCompany, tier, primaryHook } from "../_utils.js";

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

async function searchPlaces(env, query, city, state, limit) {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");

  const body = {
    textQuery: `${query} ${city} ${state}`,
    maxResultCount: Math.min(Math.max(Number(limit || 20), 1), 20),
    languageCode: "en",
    regionCode: "US"
  };

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

export async function onRequestOptions() { return json({ ok: true }); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await readJson(context.request);
  const cities = body.cities || [{ city: body.city, state: body.state }];
  const queries = body.queries || ["HVAC contractor", "AC repair", "air conditioning repair", "emergency AC repair", "heating and cooling"];
  const limitPerQuery = body.limitPerQuery || 20;
  const marketName = body.market || `${cities[0]?.city || "Market"}, ${cities[0]?.state || ""}`.trim();

  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  let totalFound = 0;
  let totalSaved = 0;
  const errors = [];

  for (const c of cities) {
    for (const q of queries) {
      try {
        const places = await searchPlaces(context.env, q, c.city, c.state, limitPerQuery);
        totalFound += places.length;
        for (const place of places) {
          const company = placeToCompany(place, { market: marketName, city: c.city, state: c.state, query: q });
          if (!company.place_id || !company.company_name) continue;
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

  return json({ ok: true, market: marketName, totalFound, totalSaved, errors });
}
