const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const SECURITY_HEADERS = {
  "cache-control": "no-store, private",
  "pragma": "no-cache",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS
    }
  });
}

function optionsResponse(methods = "POST, OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: {
      allow: methods,
      ...SECURITY_HEADERS
    }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function requireAdmin(request, env) {
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

function safeInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function safeNum(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInt(value, minimum, maximum, fallback) {
  const number = safeInt(value, fallback);
  return Math.min(maximum, Math.max(minimum, number));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildSearchQuery(category, city, state) {
  return `${category} near ${city}, ${state}`;
}

function placeToLead(place, meta) {
  const website = cleanText(place.websiteUri);
  const reviews = Number(place.userRatingCount || 0);
  const rating = Number(place.rating || 0);
  const company = cleanText(place.displayName?.text);
  const phone = cleanText(place.nationalPhoneNumber || place.internationalPhoneNumber);
  const category = cleanText(meta.category);
  const city = cleanText(meta.city);
  const state = cleanText(meta.state);
  const opening = company && reviews
    ? `${company} has ${reviews} Google reviews${rating ? ` at ${rating.toFixed(1)} stars` : ""}${website ? ", but I found an opportunity to improve the website path to more calls." : ", but no website is listed. I built a practical way to turn that reputation into more calls."}`
    : `${company || "This business"} appears to be a phone-backed ${category} prospect in ${city}.`;

  return {
    place_id: place.id || "",
    company,
    phone,
    category,
    city,
    state,
    rating: rating || "",
    review_count: reviews || 0,
    has_website: website ? "Yes" : "No",
    website,
    address: cleanText(place.formattedAddress),
    google_maps_url: cleanText(place.googleMapsUri),
    opening_line: opening,
    notes: ""
  };
}

async function searchPlaces(env, searchQuery, limit) {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.googleMapsUri",
    "places.websiteUri",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.rating",
    "places.userRatingCount"
  ].join(",");

  const collected = [];
  let pageToken = "";
  const pages = Math.min(2, Math.ceil(limit / 20));

  for (let page = 0; page < pages && collected.length < limit; page += 1) {
    if (pageToken) await sleep(1200);
    const body = {
      textQuery: searchQuery,
      pageSize: Math.min(20, Math.max(1, limit - collected.length)),
      languageCode: "en",
      regionCode: "US",
      includePureServiceAreaBusinesses: true
    };
    if (pageToken) body.pageToken = pageToken;

    const response = await fetch(GOOGLE_PLACES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Places error ${response.status}: ${text}`);
    }

    const data = await response.json();
    collected.push(...(data.places || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  return collected.slice(0, limit);
}

export async function onRequestOptions() {
  return optionsResponse("POST, OPTIONS");
}

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await readJson(context.request);
  const state = cleanText(body.state).toUpperCase();
  const cities = (Array.isArray(body.cities) ? body.cities : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 20);
  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 20);
  const minRating = Math.min(5, Math.max(0, safeNum(body.minRating, 0)));
  const minReviews = clampInt(body.minReviews, 0, 10000, 0);
  const maxResults = clampInt(body.maxResults, 1, 200, 40);
  const perSearch = clampInt(body.perSearch, 1, 40, 20);
  const websiteMode = cleanText(body.websiteMode || "no_website").toLowerCase();

  if (!state) return json({ error: "State is required." }, 400);
  if (!cities.length) return json({ error: "Add at least one city." }, 400);
  if (!categories.length) return json({ error: "Add at least one category." }, 400);
  if (cities.length * categories.length > 40) {
    return json({ error: "This search is too large. Keep cities × categories at 40 or fewer." }, 400);
  }

  const seen = new Set();
  const leads = [];
  const errors = [];
  const searches = [];
  let totalFound = 0;
  let skippedNoPhone = 0;
  let skippedWebsite = 0;
  let skippedLowRating = 0;
  let skippedLowReviews = 0;

  for (const city of cities) {
    for (const category of categories) {
      if (leads.length >= maxResults) break;
      const searchQuery = buildSearchQuery(category, city, state);
      const searchReport = {
        query: searchQuery,
        city,
        state,
        category,
        raw_found: 0,
        kept: 0,
        skipped_no_phone: 0,
        skipped_website: 0,
        skipped_low_rating: 0,
        skipped_low_reviews: 0,
        error: ""
      };
      try {
        const places = await searchPlaces(context.env, searchQuery, perSearch);
        searchReport.raw_found = places.length;
        totalFound += places.length;
        for (const place of places) {
          if (leads.length >= maxResults) break;
          const lead = placeToLead(place, { city, state, category });
          const key = lead.place_id || `${lead.company}|${lead.phone}`;
          if (!lead.company || seen.has(key)) continue;
          seen.add(key);
          if (!lead.phone) { skippedNoPhone += 1; searchReport.skipped_no_phone += 1; continue; }
          if (websiteMode === "no_website" && lead.website) { skippedWebsite += 1; searchReport.skipped_website += 1; continue; }
          if (Number(lead.rating || 0) < minRating) { skippedLowRating += 1; searchReport.skipped_low_rating += 1; continue; }
          if (Number(lead.review_count || 0) < minReviews) { skippedLowReviews += 1; searchReport.skipped_low_reviews += 1; continue; }
          leads.push(lead);
          searchReport.kept += 1;
        }
      } catch (error) {
        searchReport.error = error.message;
        errors.push({ city, category, error: error.message });
      } finally {
        searches.push(searchReport);
      }
    }
  }

  return json({
    ok: true,
    count: leads.length,
    totalFound,
    skippedNoPhone,
    skippedWebsite,
    skippedLowRating,
    skippedLowReviews,
    searches,
    errors,
    leads
  });
}
