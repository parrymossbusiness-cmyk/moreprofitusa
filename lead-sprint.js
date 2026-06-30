const $ = id => document.getElementById(id);
let currentRows = [];

function lines(id) {
  return $(id).value.split("\n").map(value => value.trim()).filter(Boolean);
}

function setStatus(message, kind = "") {
  const status = $("status");
  status.textContent = message;
  status.className = `status${kind ? ` ${kind}` : ""}`;
}

function renderReceipt(searches = []) {
  const receipt = $("receipt");
  receipt.replaceChildren();
  if (!searches.length) {
    receipt.hidden = true;
    return;
  }

  const title = document.createElement("strong");
  title.textContent = "Search receipt";
  receipt.append(title);

  const list = document.createElement("ul");
  for (const item of searches) {
    const row = document.createElement("li");
    const parts = [
      `${item.query}`,
      `raw ${item.raw_found || 0}`,
      `kept ${item.kept || 0}`,
      `no phone ${item.skipped_no_phone || 0}`,
      `website ${item.skipped_website || 0}`,
      `low rating ${item.skipped_low_rating || 0}`,
      `low reviews ${item.skipped_low_reviews || 0}`
    ];
    row.textContent = parts.join(" · ");
    if (item.error) {
      row.textContent += ` · ERROR: ${item.error}`;
      row.className = "receipt-error";
    }
    list.append(row);
  }
  receipt.append(list);
  receipt.hidden = false;
}

function tokenOrThrow() {
  const token = $("token").value.trim();
  if (!token) throw new Error("Enter your admin token first.");
  return token;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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

function renderRows(rows) {
  currentRows = rows;
  $("count").textContent = `${rows.length} lead${rows.length === 1 ? "" : "s"}`;
  $("exportBtn").disabled = rows.length === 0;
  const body = $("rows");
  body.replaceChildren();
  if (!rows.length) renderReceipt([]);

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "empty";
    cell.textContent = "No matching businesses. Try All phone-backed businesses, lower reviews/rating, or search a broader category.";
    row.append(cell);
    body.append(row);
    return;
  }

  for (const lead of rows) {
    const row = document.createElement("tr");
    const cells = [
      lead.company,
      lead.phone,
      `${lead.city}, ${lead.state}`,
      lead.category,
      lead.rating || "",
      lead.review_count || "",
      "",
      lead.opening_line,
      ""
    ];

    for (let index = 0; index < cells.length; index += 1) {
      const cell = document.createElement("td");
      if (index === 1 && lead.phone) {
        const link = document.createElement("a");
        link.href = `tel:${lead.phone.replace(/[^\d+]/g, "")}`;
        link.textContent = lead.phone;
        cell.append(link);
      } else if (index === 6) {
        const hasWebsite = String(lead.has_website || "").toLowerCase() === "yes";
        const badge = document.createElement("span");
        badge.className = `pill ${hasWebsite ? "yes" : "no"}`;
        badge.textContent = hasWebsite ? "Has website" : "No website";
        cell.append(badge);
        if (lead.website) {
          cell.append(document.createElement("br"));
          const link = document.createElement("a");
          link.href = safeUrl(lead.website);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open";
          cell.append(link);
        }
      } else if (index === 8 && lead.google_maps_url) {
        const link = document.createElement("a");
        link.href = safeUrl(lead.google_maps_url);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Map";
        cell.append(link);
      } else {
        cell.textContent = cells[index] == null ? "" : String(cells[index]);
      }
      row.append(cell);
    }
    body.append(row);
  }
}

async function searchLeads() {
  const token = tokenOrThrow();
  const cities = lines("cities");
  const categories = lines("categories");
  if (!cities.length) throw new Error("Add at least one city.");
  if (!categories.length) throw new Error("Add at least one category.");
  if (cities.length * categories.length > 40) throw new Error("Keep city × category searches to 40 or fewer.");

  const body = {
    market: $("market").value.trim(),
    state: $("state").value.trim().toUpperCase(),
    cities,
    categories,
    minRating: Number($("minRating").value || 0),
    minReviews: Number($("minReviews").value || 0),
    websiteMode: $("websiteMode").value,
    maxResults: Number($("maxResults").value || 40),
    perSearch: Number($("perSearch").value || 20)
  };

  setStatus(`Searching ${cities.join(", ")} for ${categories.join(", ")}…`);
  const response = await fetch("/api/lead-sprint-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `Search failed with ${response.status}` }; }
  if (!response.ok) throw new Error(data.error || `Search failed with ${response.status}`);

  renderRows(data.leads || []);
  renderReceipt(data.searches || []);
  setStatus(
    `Search complete. Found ${data.totalFound} raw listings, kept ${data.count} leads, skipped ${data.skippedNoPhone} without phone, ${data.skippedWebsite} with websites, ${data.skippedLowRating} low rating, and ${data.skippedLowReviews} low review count.`,
    data.count ? "success" : "error"
  );
}

function exportCsv() {
  if (!currentRows.length) return;
  const columns = [
    "company", "phone", "category", "city", "state", "rating", "review_count",
    "has_website", "website", "address", "google_maps_url", "opening_line", "notes"
  ];
  const linesOut = [
    columns.join(","),
    ...currentRows.map(row => columns.map(column => csvEscape(row[column])).join(","))
  ];
  const csv = `\uFEFF${linesOut.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const market = ($("market").value.trim() || "lead-sprint").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${market || "lead-sprint"}-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setStatus(`Exported ${currentRows.length} rows. This CSV is generated only from the visible current-run results.`, "success");
}

function clearResults() {
  renderRows([]);
  renderReceipt([]);
  setStatus("Results cleared. Nothing saved.");
}

$("searchBtn").addEventListener("click", event => withButton(event.currentTarget, "Searching…", searchLeads));
$("exportBtn").addEventListener("click", exportCsv);
$("clearBtn").addEventListener("click", clearResults);
