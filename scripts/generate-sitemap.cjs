#!/usr/bin/env node
/**
 * Generate sitemap.xml at build time.
 *
 * Emits public/sitemap.xml combining:
 *   1. Static top-level pages (Home, Pricing, About, etc.)
 *   2. Every organisation profile page (slug URL: /org/{id}/{slug})
 *   3. Every funder profile page (/follow/{slug})
 *
 * Pulls the dynamic URLs from Supabase using the public anon key.
 * If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing, falls
 * back gracefully to emitting the static routes only — the build
 * still succeeds.
 *
 * Wire into package.json:
 *   "build": "node scripts/generate-sitemap.cjs && vite build"
 */

const fs = require("fs");
const path = require("path");

// Load .env if present, so local npm run build picks up creds.
try { require("dotenv").config(); } catch { /* optional */ }

const SITE_URL = (process.env.SITE_URL || "https://www.openbenefacts.ie").replace(/\/$/, "");
const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

const STATIC_ROUTES = [
  { loc: "/",                               changefreq: "daily",   priority: "1.0" },
  { loc: "/orgs",                           changefreq: "daily",   priority: "0.9" },
  { loc: "/funders",                        changefreq: "weekly",  priority: "0.9" },
  { loc: "/money",                          changefreq: "weekly",  priority: "0.8" },
  { loc: "/foundations",                    changefreq: "weekly",  priority: "0.7" },
  { loc: "/councils",                       changefreq: "weekly",  priority: "0.7" },
  { loc: "/trackers/emergency-accommodation", changefreq: "monthly", priority: "0.7" },
  { loc: "/knowledge",                      changefreq: "monthly", priority: "0.6" },
  { loc: "/pricing",                        changefreq: "monthly", priority: "0.6" },
  { loc: "/api",                            changefreq: "monthly", priority: "0.5" },
  { loc: "/open-data",                      changefreq: "monthly", priority: "0.5" },
  { loc: "/about",                          changefreq: "monthly", priority: "0.5" },
  { loc: "/sources",                        changefreq: "monthly", priority: "0.5" },
  { loc: "/media",                          changefreq: "monthly", priority: "0.5" },
  { loc: "/csr",                            changefreq: "monthly", priority: "0.5" },
  { loc: "/privacy",                        changefreq: "yearly",  priority: "0.2" },
  { loc: "/terms",                          changefreq: "yearly",  priority: "0.2" },
];

// Copied from src/App.jsx — kept in sync so generated slugs match the
// ones React replaceState() writes into the URL at runtime.
function slugify(input) {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function loadDynamicRoutes() {
  if (!SUPA_URL || !SUPA_KEY) {
    console.warn("[sitemap] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — emitting static routes only.");
    return [];
  }

  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch (e) {
    console.warn("[sitemap] @supabase/supabase-js not installed — emitting static routes only.");
    return [];
  }

  const sb = createClient(SUPA_URL, SUPA_KEY);

  const out = [];

  // Organisations — paginate because Supabase caps each request at 1000.
  let orgCount = 0;
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("organisations")
      .select("id, name, updated_at")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      console.warn("[sitemap] organisations query failed:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const org of data) {
      const slug = slugify(org.name);
      const loc = slug ? `/org/${org.id}/${slug}` : `/org/${org.id}`;
      out.push({
        loc,
        lastmod: org.updated_at?.slice(0, 10),
        changefreq: "monthly",
        priority: "0.5",
      });
      orgCount++;
    }
    if (data.length < PAGE_SIZE) break;
    page++;
    // Safety break — most sitemaps cap at 50,000 URLs.
    if (orgCount >= 49000) {
      console.warn(`[sitemap] hit 49,000 org cap — remaining orgs will not be in this sitemap.`);
      break;
    }
  }
  console.log(`[sitemap] loaded ${orgCount} organisation URLs`);

  // Funders — also dynamic. Use funder_summary view (read-optimised).
  try {
    const { data: funders, error: fErr } = await sb.from("funder_summary").select("*");
    if (fErr) {
      console.warn("[sitemap] funder_summary query failed:", fErr.message);
    } else if (funders?.length) {
      for (const f of funders) {
        const slug = slugify(f.name || f.funder_name);
        if (slug) {
          out.push({ loc: `/follow/${slug}`, changefreq: "weekly", priority: "0.6" });
        }
      }
      console.log(`[sitemap] loaded ${funders.length} funder URLs`);
    }
  } catch (e) {
    console.warn("[sitemap] funder query threw:", e.message);
  }

  return out;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function entryXml({ loc, lastmod, changefreq, priority }) {
  const url = loc.startsWith("http") ? loc : `${SITE_URL}${loc}`;
  const parts = [
    `    <loc>${escapeXml(url)}</loc>`,
    lastmod    ? `    <lastmod>${lastmod}</lastmod>`       : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority   ? `    <priority>${priority}</priority>`       : null,
  ].filter(Boolean);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

(async function main() {
  const dynamic = await loadDynamicRoutes();
  const all = [...STATIC_ROUTES, ...dynamic];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    all.map(entryXml).join("\n") + "\n" +
    "</urlset>\n";

  const outPath = path.join(__dirname, "..", "public", "sitemap.xml");
  fs.writeFileSync(outPath, xml, "utf8");
  console.log(`[sitemap] wrote ${all.length} URLs to public/sitemap.xml`);
})().catch(err => {
  console.error("[sitemap] failed:", err);
  // Don't fail the build — just keep whatever sitemap was already there.
  process.exit(0);
});
