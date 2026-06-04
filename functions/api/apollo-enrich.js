import { json, readJson, requireAdmin, normalizeDomain } from "../_utils.js";

const APOLLO_PEOPLE_SEARCH = "https://api.apollo.io/api/v1/mixed_people/search";

const DEFAULT_TITLES = [
  "Owner", "Founder", "President", "CEO", "Chief Executive Officer", "General Manager", "Operations Manager", "Service Manager"
];

async function searchApollo(env, domain, titles) {
  if (!env.APOLLO_API_KEY) throw new Error("APOLLO_API_KEY is not configured.");
  if (!domain) throw new Error("Missing website domain for Apollo search.");

  const resp = await fetch(APOLLO_PEOPLE_SEARCH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": env.APOLLO_API_KEY
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      person_titles: titles,
      page: 1,
      per_page: 5
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apollo error ${resp.status}: ${text}`);
  }
  return await resp.json();
}

function pickBestPerson(people = []) {
  const titleRank = ["owner", "founder", "president", "ceo", "chief executive", "general manager", "operations", "service manager"];
  return [...people].sort((a, b) => {
    const at = (a.title || "").toLowerCase();
    const bt = (b.title || "").toLowerCase();
    const ar = titleRank.findIndex(t => at.includes(t));
    const br = titleRank.findIndex(t => bt.includes(t));
    return (ar === -1 ? 999 : ar) - (br === -1 ? 999 : br);
  })[0] || null;
}

export async function onRequestOptions() { return json({ ok: true }); }

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.DB) return json({ error: "D1 binding DB is missing." }, 500);

  const body = await readJson(context.request);
  const limit = Math.min(Number(body.limit || 25), 100);
  const minScore = Number(body.minScore || 65);
  const market = body.market || null;
  const titles = body.titles || DEFAULT_TITLES;

  let query = `SELECT * FROM companies WHERE revenue_leak_score >= ? AND website IS NOT NULL AND website != '' AND (apollo_status = 'Not Enriched' OR apollo_status IS NULL)`;
  const binds = [minScore];
  if (market) { query += ` AND market = ?`; binds.push(market); }
  query += ` ORDER BY revenue_leak_score DESC LIMIT ?`;
  binds.push(limit);

  const rows = await context.env.DB.prepare(query).bind(...binds).all();
  const results = [];

  for (const company of rows.results || []) {
    const domain = normalizeDomain(company.website);
    try {
      const apollo = await searchApollo(context.env, domain, titles);
      const people = apollo.people || apollo.contacts || [];
      const person = pickBestPerson(people);
      if (!person) {
        await context.env.DB.prepare(`UPDATE companies SET apollo_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind("No Contact Found", company.id).run();
        results.push({ company: company.company_name, domain, status: "No Contact Found" });
        continue;
      }

      const name = person.name || `${person.first_name || ""} ${person.last_name || ""}`.trim();
      const email = person.email || person.email_status === "verified" ? person.email : person.email || "";
      const phone = person.mobile_phone || person.phone_numbers?.[0]?.raw_number || person.sanitized_phone || "";

      await context.env.DB.prepare(`
        UPDATE companies SET apollo_status=?, apollo_contact_name=?, apollo_title=?, apollo_email=?, apollo_phone=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind("Enriched", name, person.title || "", email, phone, company.id).run();

      results.push({ company: company.company_name, domain, status: "Enriched", name, title: person.title || "", email, phone });
    } catch (e) {
      await context.env.DB.prepare(`UPDATE companies SET apollo_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(`Error: ${e.message.slice(0, 80)}`, company.id).run();
      results.push({ company: company.company_name, domain, status: "Error", error: e.message });
    }
  }

  return json({ ok: true, requested: rows.results?.length || 0, results });
}
