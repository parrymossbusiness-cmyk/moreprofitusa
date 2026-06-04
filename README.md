# More Profit USA Revenue Commander Internal Market Scanner

This is a Cloudflare Pages/Functions drop-in build for your existing GitHub + Cloudflare site.

It creates an internal admin tool at:

`/revenue-commander-admin.html`

The scanner is designed to help you wake up every morning with a ranked conversation queue of HVAC owners:

- Company name
- Google rating/review count
- Review gap vs. competitor
- Website live check
- Mobile performance score
- Missed-call / after-hours / text-back visibility flags
- Revenue Leak Score
- Apollo enrichment status
- CSV export

## Files included

```text
revenue-commander-admin.html          Admin dashboard
functions/_utils.js                   Shared helpers, scoring, admin protection
functions/api/scan-market.js          Google Places market scanner
functions/api/benchmark.js            Competitor review-gap calculator
functions/api/audit-websites.js       Website + PageSpeed mobile audit
functions/api/companies.js            Ranked company list endpoint
functions/api/export.csv.js           CSV export endpoint
functions/api/apollo-enrich.js        Apollo contact enrichment hook
schema.sql                            Cloudflare D1 database schema
wrangler.toml                         Cloudflare config example
```

## Required Cloudflare environment variables

Set these in Cloudflare Pages > Your Project > Settings > Environment Variables.

```text
ADMIN_TOKEN=choose-a-long-random-password
GOOGLE_MAPS_API_KEY=your-google-key
PAGESPEED_API_KEY=your-google-key-or-pagespeed-key
APOLLO_API_KEY=your-apollo-key
```

Do not commit real API keys to GitHub.

## Required Cloudflare D1 binding

Create a D1 database named:

`moreprofit_revenue_commander`

Bind it to your Pages project with the variable name:

`DB`

Cloudflare Pages Functions access bindings from `context.env`, and D1 provides SQL storage for Workers/Pages apps.

## Database setup

Install Wrangler if needed:

```bash
npm install -g wrangler
```

Create D1 database:

```bash
npx wrangler d1 create moreprofit_revenue_commander
```

Copy the database_id into `wrangler.toml` or bind it in the Cloudflare dashboard.

Run schema locally:

```bash
npx wrangler d1 execute moreprofit_revenue_commander --local --file=schema.sql
```

Run schema in production:

```bash
npx wrangler d1 execute moreprofit_revenue_commander --remote --file=schema.sql
```

## How to deploy on your current site

1. Download and unzip this package.
2. Copy these files/folders into your existing GitHub repo root:
   - `revenue-commander-admin.html`
   - `functions/`
   - `schema.sql`
   - `wrangler.toml` if you do not already have one
3. Commit and push to GitHub.
4. Cloudflare Pages will redeploy automatically.
5. Add/bind the D1 database and environment variables in Cloudflare.
6. Open `/revenue-commander-admin.html` on your domain.
7. Enter your admin token.
8. Run this workflow:
   - Run Market Scan
   - Benchmark Competitors
   - Audit Websites + Mobile
   - Load Companies
   - Export CSV or Apollo Enrich Top Leads

## Best first market test

Use this first:

Market: `Phoenix Metro`

Cities:

```text
Phoenix
Mesa
Chandler
Gilbert
Scottsdale
Tempe
```

Queries:

```text
HVAC contractor
AC repair
air conditioning repair
emergency AC repair
heating and cooling
```

## Recommended operating flow

Do not enrich every company with Apollo. First rank companies by Revenue Leak Score.

Recommended Apollo threshold:

- Score 65+
- Website is live
- Review gap is 100+
- Company appears independent, active, and owner-operated

The goal is not to build a giant database. The goal is to produce a daily conversation queue.

## Important notes

- This uses Google Places API, not brittle Google Maps scraping.
- PageSpeed audits can be slow. Run 25-50 at a time.
- Apollo API response shapes can vary based on plan and endpoint access. Test Apollo enrichment on 5 companies first.
- If your existing repo has a build system, make sure Cloudflare Pages still includes the `functions/` folder and the admin HTML in the published output.
