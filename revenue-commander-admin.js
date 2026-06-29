const PRESETS = {
  local_home: {
    market: "Pine Bluff + White Hall Home Services",
    state: "AR",
    cities: ["Pine Bluff", "White Hall"],
    queries: ["plumber", "electrician", "HVAC contractor", "roofing contractor", "landscaper"]
  },
  local_personal: {
    market: "Pine Bluff + White Hall Local Services",
    state: "AR",
    cities: ["Pine Bluff", "White Hall"],
    queries: ["barber shop", "beauty salon", "house cleaning service", "handyman", "pest control service"]
  },
  little_rock_home: {
    market: "Little Rock Home Services",
    state: "AR",
    cities: ["Little Rock", "North Little Rock"],
    queries: ["plumber", "electrician", "HVAC contractor", "roofing contractor", "landscaper"]
  }
};

const CITY_CENTERS = {
  "pine bluff|AR": { latitude: 34.2284, longitude: -92.0032 },
  "white hall|AR": { latitude: 34.2737, longitude: -92.0909 },
  "little rock|AR": { latitude: 34.7465, longitude: -92.2896 },
  "north little rock|AR": { latitude: 34.7695, longitude: -92.2671 }
};

function cityWithCenter(city, state) {
  return { city, state, ...(CITY_CENTERS[`${city.toLowerCase()}|${state}`] || {}) };
}

const $ = id => document.getElementById(id);

function lines(id) {
  return $(id).value.split("\n").map(value => value.trim()).filter(Boolean);
}

function tokenOrThrow() {
  const token = $("token").value.trim();
  if (!token) throw new Error("Enter your admin token first.");
  return token;
}

function setStatus(message, kind = "") {
  const status = $("status");
  status.textContent = message;
  status.className = `status${kind ? ` ${kind}` : ""}`;
}

async function requestJson(path, options = {}) {
  const token = tokenOrThrow();
  const headers = new Headers(options.headers || {});
  headers.set("x-admin-token", token);
  if (options.body) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `Request failed with ${response.status}` }; }
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
  return data;
}

async function withButton(button, workingText, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = workingText;
  try {
    await action();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  $("market").value = preset.market;
  $("marketFilter").value = preset.market;
  $("state").value = preset.state;
  $("cities").value = preset.cities.join("\n");
  $("queries").value = preset.queries.join("\n");
  $("categoryFilter").value = "";
}

function syncCategoryFilterFromQueries() {
  const queries = lines("queries");
  if (queries.length === 1) $("categoryFilter").value = queries[0];
}

async function scanMarket() {
  const state = $("state").value.trim().toUpperCase();
  const cities = lines("cities");
  const queries = lines("queries");
  if (!cities.length || !queries.length) throw new Error("Add at least one city and one business type.");
  if (cities.length * queries.length > 30) throw new Error("Reduce this scan to 30 or fewer city × business-type searches.");

  setStatus("Finding phone-backed businesses…");
  const data = await requestJson("/api/scan-market", {
    method: "POST",
    body: JSON.stringify({
      market: $("market").value.trim(),
      state,
      minReviews: Number($("minReviews").value || 10),
      minRating: Number($("minRating").value || 4.4),
      radiusMiles: Number($("radiusMiles").value || 30),
      limitPerQuery: Number($("limitPerQuery").value || 20),
      cities: cities.map(city => cityWithCenter(city, state)),
      queries
    })
  });
  $("marketFilter").value = data.market;
  syncCategoryFilterFromQueries();
  setStatus(
    `Found ${data.totalFound} listings and saved ${data.totalSaved} unique, call-ready businesses. ` +
    `${data.skippedNoPhone} had no phone and ${data.skippedLowReviews} were below your review minimum. ` +
    `${data.skippedLowRating} were below ${data.minRating} stars and ${data.skippedOutsideRadius} were outside ${data.radiusMiles} miles. ` +
    "Next: Compare Reviews.",
    "success"
  );
}

async function benchmark() {
  setStatus("Comparing each company with nearby review leaders…");
  const data = await requestJson("/api/benchmark", {
    method: "POST",
    body: JSON.stringify({ market: $("marketFilter").value.trim() || $("market").value.trim() })
  });
  setStatus(`Updated competitor evidence for ${data.updated} businesses. Next: audit top websites or load the queue.`, "success");
}

async function auditWebsites() {
  setStatus("Auditing up to 20 top websites. This step can take longer because it verifies live mobile evidence…");
  const data = await requestJson("/api/audit-websites", {
    method: "POST",
    body: JSON.stringify({
      market: $("marketFilter").value.trim() || $("market").value.trim(),
      limit: 20
    })
  });
  setStatus(`Audited ${data.auditedCount} websites and refreshed their opportunity scores.`, "success");
}

async function loadCompanies() {
  const params = new URLSearchParams({
    minScore: $("minScore").value || "50",
    limit: $("companyLimit").value || "40",
    phoneOnly: "1",
    minRating: $("queueMinRating").value || "4.4",
    maxDistance: $("radiusMiles").value || "30",
    campaign: $("campaignFilter").value || "website"
  });
  const market = $("marketFilter").value.trim();
  const searchType = $("categoryFilter").value.trim();
  if (market) params.set("market", market);
  if (searchType) params.set("searchType", searchType);
  if ($("tierFilter").value) params.set("tier", $("tierFilter").value);

  setStatus("Loading the highest-priority call list…");
  const data = await requestJson(`/api/companies?${params}`);
  renderCompanies(data.companies || []);
  setStatus(`Loaded ${data.count} phone-backed businesses, ranked by verified opportunity.`, "success");
}

async function exportCsv() {
  const token = tokenOrThrow();
  const params = new URLSearchParams({
    minScore: $("minScore").value || "50",
    limit: "1000",
    minRating: $("queueMinRating").value || "4.4",
    maxDistance: $("radiusMiles").value || "30",
    campaign: $("campaignFilter").value || "website"
  });
  const market = $("marketFilter").value.trim();
  const searchType = $("categoryFilter").value.trim();
  if (market) params.set("market", market);
  if (searchType) params.set("searchType", searchType);

  setStatus("Preparing the locked Google Sheets call-list export…");
  const response = await fetch(`/api/export.csv?${params}`, {
    headers: { "x-admin-token": token },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Export failed with ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  link.href = objectUrl;
  link.download = match?.[1] || "revenue-commander-call-sheet.csv";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setStatus("Call list exported. The admin token was sent securely in a request header and was not placed in the URL.", "success");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function appendText(parent, text, className = "") {
  const span = document.createElement("span");
  span.textContent = text == null ? "" : String(text);
  if (className) span.className = className;
  parent.append(span);
  return span;
}

function textCell(row, text, className = "") {
  const cell = document.createElement("td");
  appendText(cell, text, className);
  row.append(cell);
  return cell;
}

function externalLink(parent, label, value) {
  const safeUrl = safeExternalUrl(value);
  if (!safeUrl) return;
  const link = document.createElement("a");
  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "proof-link";
  link.textContent = label;
  parent.append(link);
}

function tierClass(value) {
  const tier = String(value || "");
  if (tier.startsWith("Tier 1")) return "tier tier1";
  if (tier.startsWith("Tier 2")) return "tier tier2";
  if (tier.includes("Skip")) return "tier skip";
  return "tier";
}

function renderCompanies(companies) {
  const body = $("companyRows");
  body.replaceChildren();
  $("queueSummary").textContent = `${companies.length} calls loaded`;

  if (!companies.length) {
    const row = document.createElement("tr");
    const cell = textCell(row, "No matching businesses. Lower the minimum score or scan another category.", "empty-state");
    cell.colSpan = 8;
    body.append(row);
    return;
  }

  for (const company of companies) {
    const row = document.createElement("tr");
    textCell(row, company.revenue_leak_score ?? "", "score");
    textCell(row, company.priority_tier || "", tierClass(company.priority_tier));

    const companyCell = document.createElement("td");
    appendText(companyCell, company.company_name || "", "company-name");
    const phone = String(company.business_phone || "").trim();
    if (phone) {
      const phoneLink = document.createElement("a");
      const dialable = phone.replace(/[^\d+]/g, "");
      phoneLink.href = `tel:${dialable}`;
      phoneLink.className = "phone-link";
      phoneLink.textContent = `Call ${phone}`;
      companyCell.append(phoneLink);
    }
    if (company.walk_in_candidate) appendText(companyCell, "Walk-in option", "pill");
    row.append(companyCell);

    const marketCell = document.createElement("td");
    appendText(marketCell, company.city || "");
    marketCell.append(document.createElement("br"));
    appendText(marketCell, company.formatted_address || company.market || "", "muted");
    row.append(marketCell);

    textCell(row, company.score_reason || "");
    textCell(row, company.recommended_offer || "");

    const openerCell = textCell(row, company.opening_line || company.primary_hook || "");
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "micro-button";
    copyButton.textContent = "Copy opener";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(company.opening_line || company.primary_hook || "");
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Copy unavailable";
      }
    });
    openerCell.append(document.createElement("br"), copyButton);

    const proofCell = document.createElement("td");
    proofCell.className = "proof-links";
    externalLink(proofCell, "Google Maps", company.google_maps_url);
    externalLink(proofCell, "Website", company.website);
    row.append(proofCell);

    body.append(row);
  }
}

$("marketPreset").addEventListener("change", event => applyPreset(event.target.value));
$("scanBtn").addEventListener("click", event => withButton(event.currentTarget, "Finding…", scanMarket));
$("benchmarkBtn").addEventListener("click", event => withButton(event.currentTarget, "Comparing…", benchmark));
$("auditBtn").addEventListener("click", event => withButton(event.currentTarget, "Auditing…", auditWebsites));
$("loadBtn").addEventListener("click", event => withButton(event.currentTarget, "Loading…", loadCompanies));
$("exportBtn").addEventListener("click", event => withButton(event.currentTarget, "Exporting…", exportCsv));
$("tierFilter").addEventListener("change", () => {
  if ($("token").value.trim()) loadCompanies().catch(error => setStatus(error.message, "error"));
});
$("campaignFilter").addEventListener("change", () => {
  if ($("token").value.trim()) loadCompanies().catch(error => setStatus(error.message, "error"));
});
