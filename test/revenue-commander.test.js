import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  csvEscape,
  leadId,
  primaryHook,
  requireAdmin,
  scoreCompany,
  tier
} from "../functions/_utils.js";
import {
  REVENUE_EXPORT_COLUMNS,
  REVENUE_EXPORT_SCHEMA_VERSION
} from "../functions/_revenue_export_schema.js";
import { onRequestGet as exportRevenueCsv } from "../functions/api/export.csv.js";

test("admin authentication accepts headers and rejects URL tokens", () => {
  const env = { ADMIN_TOKEN: "correct-secret" };
  const queryOnly = new Request("https://example.com/api/export.csv?token=correct-secret");
  const headerRequest = new Request("https://example.com/api/export.csv", {
    headers: { "x-admin-token": "correct-secret" }
  });

  assert.equal(requireAdmin(queryOnly, env).ok, false);
  assert.equal(requireAdmin(headerRequest, env).ok, true);
});

test("CSV cells neutralize spreadsheet formulas", () => {
  assert.equal(csvEscape("=IMPORTXML(\"https://bad.example\")"), "\"'=IMPORTXML(\"\"https://bad.example\"\")\"");
  assert.equal(csvEscape("+15015551212"), "'+15015551212");
  assert.equal(csvEscape("ordinary text"), "ordinary text");
});

test("local cash scoring prioritizes reachable, established no-website businesses", () => {
  const strongNoSite = {
    business_phone: "(501) 555-0100",
    review_count: 90,
    rating: 4.8,
    website: "",
    review_gap: 0
  };
  const unauditedWebsite = {
    business_phone: "(501) 555-0101",
    review_count: 12,
    rating: 4.2,
    website: "https://example.com",
    website_live: 0,
    mobile_score: null,
    click_to_call_visible: 0,
    online_booking_visible: 0,
    after_hours_visible: 0,
    text_back_visible: 0,
    review_gap: 0
  };

  assert.ok(scoreCompany(strongNoSite) > scoreCompany(unauditedWebsite));
  assert.equal(tier(scoreCompany(strongNoSite)), "Tier 1 - Call Today");
});

test("opening lines distinguish evidence from speculation", () => {
  const line = primaryHook({
    company_name: "Sample Plumbing",
    business_phone: "501-555-0110",
    review_count: 42,
    rating: 4.8,
    website: ""
  });
  assert.match(line, /42 Google reviews/);
  assert.match(line, /no website is listed/i);
  assert.doesNotMatch(line, /missed call exposure/i);
});

test("Revenue Commander export schema remains locked to v1", () => {
  assert.equal(REVENUE_EXPORT_SCHEMA_VERSION, "revenue_commander_v1");
  assert.deepEqual(REVENUE_EXPORT_COLUMNS.map(column => column.key), [
    "schema_version", "lead_id", "discovered_at", "last_verified_at", "market",
    "state", "city", "company", "category", "phone", "address", "rating",
    "review_count", "has_website", "website_url", "mobile_score", "top_competitor",
    "competitor_reviews", "review_gap", "review_gap_pct", "score", "priority_tier",
    "score_reason", "recommended_offer", "opening_line", "walk_in_candidate", "maps_url",
    "contact_status", "decision_maker", "last_contacted_at", "next_follow_up_at",
    "quoted_price", "cash_collected", "notes", "lost_reason"
  ]);
  assert.equal(leadId({ place_id: "abc123", id: 9 }), "RC-abc123");
});

test("Revenue Commander frontend has no unsafe HTML rendering or Apollo runtime", () => {
  const html = readFileSync(new URL("../revenue-commander-admin.html", import.meta.url), "utf8");
  const javascript = readFileSync(new URL("../revenue-commander-admin.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /Apollo/i);
  assert.doesNotMatch(javascript, /innerHTML/);
  assert.doesNotMatch(javascript, /params\.set\(["']token["']/);
  assert.equal(existsSync(new URL("../functions/api/apollo-enrich.js", import.meta.url)), false);
});

test("Revenue Commander export returns a secure, versioned call sheet", async () => {
  const sample = {
    id: 1,
    place_id: "place-1",
    created_at: "2026-06-27T10:00:00Z",
    updated_at: "2026-06-27T11:00:00Z",
    market: "Pine Bluff + White Hall Home Services",
    state: "AR",
    city: "White Hall",
    company_name: "Sample Electric",
    primary_type: "electrician",
    business_phone: "+15015550100",
    formatted_address: "100 Main St",
    rating: 4.8,
    review_count: 120,
    website: "",
    review_gap: 40,
    review_gap_pct: 30,
    google_maps_url: "https://maps.google.com/example"
  };
  const DB = {
    prepare() {
      return {
        bind() {
          return { all: async () => ({ results: [sample] }) };
        }
      };
    }
  };
  const request = new Request("https://example.com/api/export.csv?minScore=0", {
    headers: { "x-admin-token": "correct-secret" }
  });

  const response = await exportRevenueCsv({
    request,
    env: { ADMIN_TOKEN: "correct-secret", DB }
  });
  const csv = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-export-schema"), "revenue_commander_v1");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.ok(csv.startsWith("schema_version,lead_id,"));
  assert.match(csv, /revenue_commander_v1,RC-place-1/);
  assert.match(csv, /'\+15015550100/);
});
