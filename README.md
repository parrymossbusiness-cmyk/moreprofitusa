# More Profit USA

Static website and internal sales tools deployed through GitHub to Cloudflare Pages.

## Revenue Commander

Open `/revenue-commander-admin.html` to build a ranked, phone-backed conversation queue.

The current workflow is intentionally focused on small local businesses:

1. Scan a city and business-category cluster with Google Places.
2. Keep businesses with a phone number and the selected minimum review count.
3. Compare review strength with nearby competitors.
4. Audit the strongest website candidates for defensible mobile-conversion evidence.
5. Load the top 40 calls and export a locked Google Sheets-ready CSV.

### Revenue Commander files

```text
revenue-commander-admin.html        Admin interface
revenue-commander-admin.css         Admin design
revenue-commander-admin.js          Admin workflow and secure export
functions/_utils.js                 Authentication, scoring and safety helpers
functions/_revenue_export_schema.js Locked revenue_commander_v1 CSV definition
functions/api/scan-market.js        Google Places market scanner
functions/api/benchmark.js          Competitor review comparison
functions/api/audit-websites.js     Website and PageSpeed evidence
functions/api/companies.js          Ranked call queue
functions/api/export.csv.js         Secure call-list export
schema.sql                          D1 schema for new installations
_headers                            Static admin-page security headers
```

### Required Cloudflare bindings

```text
ADMIN_TOKEN
GOOGLE_MAPS_API_KEY
PAGESPEED_API_KEY   optional; GOOGLE_MAPS_API_KEY is used as fallback
DB                  D1 binding named moreprofit_revenue_commander
```

Never commit real API keys or admin tokens to GitHub.

## Lead Engine

The older Lead Engine remains available at `/lead-engine.html`. Its data stays in the separate `leads` table. Its CSV export also uses request-header authentication and the locked `lead_engine_v1` schema.

## Deployment

Push the repository to the connected GitHub branch. Cloudflare Pages deploys it automatically. See `REVENUE_COMMANDER_DEPLOY.md` for the plain-English handoff and verification checklist.
