# Revenue Commander Deployment Handoff

This version keeps the same process you already use:

1. Upload or commit the updated repository files to GitHub.
2. Push to the branch connected to Cloudflare Pages.
3. Cloudflare automatically publishes the changes.

No framework, package installation, or database migration is required for this update.

## What changed

- Removed the Apollo button, API endpoint, runtime code, export fields, configuration, and new-install database fields.
- Rebuilt the queue around phone-backed local businesses.
- Added Pine Bluff, White Hall, and Little Rock presets.
- Replaced unsupported “missed-call exposure” claims with evidence the scanner actually verifies.
- Removed the Arizona/large-market scoring bonus.
- Added call-now links, copyable opening lines, recommended offers, score reasons, and walk-in flags.
- Removed admin-token authentication from URL query strings.
- Changed exports to authenticated downloads using the request header.
- Locked the Revenue Commander CSV as `revenue_commander_v1`.
- Locked the Lead Engine CSV as `lead_engine_v1`.
- Added spreadsheet-formula protection, UTF-8 encoding, stable lead IDs, and blank sales-tracking columns.
- Removed unsafe insertion of business data into the Revenue Commander page.
- Added `noindex`, no-cache, browser security, and clickjacking headers to the admin page.

## Cloudflare cleanup after deployment

1. Rotate `ADMIN_TOKEN` because the old export process placed it in a URL.
2. Replace the token you paste into Revenue Commander with the new value.
3. Delete the unused `APOLLO_API_KEY` secret from the Cloudflare project.

Do not put either the old or new admin token in GitHub.

Existing Apollo columns in the live D1 database may remain as unused historical columns. The application no longer reads, writes, displays, or exports them. Leaving the columns avoids a risky production-data migration.

## Five-minute verification

1. Open `/revenue-commander-admin.html`.
2. Confirm the page defaults to Pine Bluff + White Hall.
3. Enter the new admin token.
4. Click `4 · Load Today's Queue` to confirm existing records load.
5. Run a small scan using one city and one business type.
6. Export the Google Sheets call list.
7. Confirm the browser address bar never contains `token=`.
8. Open the CSV and confirm the first column is `schema_version` and its value is `revenue_commander_v1`.

## Recommended daily use

- 9:00–9:20: load or build the top 40 call list.
- 9:20–11:00: first call block.
- 12:00–2:15: second call block and local visits.
- 2:15–3:00: follow-ups, previews, payments, and next-day queue preparation.

Keep sales outcomes in the blank tracking columns after importing the CSV into Google Sheets. Revenue Commander does not overwrite that sheet.
