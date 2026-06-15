# Lead Engine — Deploy Guide

A new, phone-first tool that lives **alongside** your existing Revenue Commander.
Same repo, same Cloudflare project, same secrets, same D1 database — new code, new URL.
Nothing about the old tool changes.

---

## What it does

Discovers businesses via Google Places (New) across a **city × business-type grid**,
runs the searches **in parallel**, **drops anything without a phone number**,
**dedupes**, **scores** each lead 0–100, tags the **pitch to lead with**, writes a ready
**hook** sentence, saves to D1, and exports a CSV call sheet.

No Apollo. No website/mobile audit. No competitor benchmark. Runs in seconds.

**Two engines** (toggle in the UI):
- **National** → call list. Columns: Score, Pitch, Company, Phone, City, Reviews, Website, Hook, Maps
- **Local** → call + walk-in. Same columns **+ Address**

---

## Files

```
lead-engine.html                  → deploy to site root → /lead-engine.html
functions/api/_engine.js          → shared scan + scoring logic
functions/api/lead-scan.js        → POST /api/lead-scan
functions/api/lead-list.js        → GET  /api/lead-list
functions/api/lead-export.js      → GET  /api/lead-export
```

---

## Deploy (3 steps, no re-provisioning)

### 1. Add the files to your repo
Copy them into `parrymossbusiness-cmyk/moreprofitusa`, preserving the `functions/api/`
path. If those function files already exist for the old tool, these have **different
names** (`lead-*`), so there's no collision. Commit and push — Cloudflare auto-deploys.

### 2. Confirm the secrets (you already have these)
Cloudflare → Pages → moreprofitusa → Settings → Variables and secrets:
- `GOOGLE_MAPS_API_KEY` ✓ (already set)
- `ADMIN_TOKEN` ✓ (already set)
- `PAGESPEED_API_KEY` — **not used** by this engine. Leave it or remove it; doesn't matter.

The D1 binding `DB` → `moreprofit_revenue_commander` is already wired. The engine creates
its **own** `leads` table on first scan, separate from the old tool's data.

### 3. Open it
`https://moreprofitusa.pages.dev/lead-engine.html`
Paste your admin token, pick an engine, run a scan.

---

## Daily use

1. **National:** Market = `San Diego`, State = `CA`, stack 4–6 nearby cities, keep the
   business-type list. Run scan → seconds later you have a ranked, phone-verified sheet.
2. **Download CSV** → upload to Google Drive → add your **Notes / Contacted / Left Message**
   columns there. Those stay in *your* copy; the engine never overwrites them.
3. **Local:** toggle to Local, cities = `Pine Bluff` / `White Hall`. CSV includes Address
   for walk-ins.

To hit 100+ leads, stack more cities — the grid is cities × business-types.

---

## Tuning (all in `_engine.js`, top of file)

- **Scoring weights:** `W_NO_WEBSITE` 35 · `W_REVIEWS` 30 · `W_RATING` 20 · `W_RECENCY` 15.
  Crank `W_NO_WEBSITE` higher if the no-site wedge matters more in your markets.
- **Cost control:** remove `places.reviews` from `FIELD_MASK` to drop to a cheaper Places
  SKU — recency just zeroes out, everything else still works.
- **Scan size cap:** 45 city×query combos (Cloudflare free-plan subrequest limit). The UI
  warns if you exceed it. Reduce cities or business-types.

---

## Notes

- Phone is a **hard gate**, not a score — no number, no row. Ever.
- Re-scanning the same market **updates** existing leads (keyed on Google place_id), so
  you can re-run daily without creating duplicates.
- This engine is intentionally separate from the old Revenue Commander so you can compare
  or fall back. When you're confident, the old tool can be retired.
