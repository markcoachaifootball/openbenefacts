import { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Search, Building2, Users, TrendingUp, DollarSign, ChevronRight, ArrowLeft, Eye, Star, Shield, Menu, X, MapPin, Hash, Landmark, GraduationCap, Heart, Briefcase, Globe, Filter, ChevronDown, ExternalLink, Info, BarChart3, FileText, Award, Zap, Database, ArrowRight, Layers, Check, CreditCard, LogIn, UserPlus, Crown, Sparkles, LogOut, AlertTriangle, Lock, ArrowUpDown, Bookmark, Share2, Copy, Code, Download, Home } from "lucide-react";
import { supabase, fetchStats, fetchFunders, fetchOrganisations, fetchOrganisationsAdvanced, fetchOrganisation, searchOrganisations, fetchSectorCounts, fetchCountyCounts, fetchSubsectorCounts, fetchGovFormCounts, fetchDirectorBoards, fetchFunderGrants, fetchFunderGrantsByName, fetchSectorBenchmark } from "./supabase.js";
import { DATA } from "./data.js";
import CouncilFinancesPage from "./CouncilFinances.jsx";
import FollowTheMoneyPage from "./FollowTheMoney.jsx";
import EmergencyAccommodationPage from "./EmergencyAccommodation.jsx";
import KnowledgeBasePage from "./KnowledgeBase.jsx";

// ===========================================================
// ERROR BOUNDARY
// ===========================================================
import React, { Component } from "react";
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("React Error Boundary:", error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", { style: { padding: "40px", textAlign: "center", fontFamily: "-apple-system, sans-serif" } },
        React.createElement("h2", { style: { color: "#dc2626" } }, "Something went wrong"),
        React.createElement("p", { style: { color: "#666", margin: "12px 0" } }, String(this.state.error?.message || this.state.error)),
        React.createElement("button", { onClick: () => { this.setState({ hasError: false }); window.location.href = "/"; }, style: { background: "#059669", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer" } }, "Go Home")
      );
    }
    return this.props.children;
  }
}

// ===========================================================
// UTILITIES
// ===========================================================
const clean = (v) => {
  if (v == null || v === "" || v === false) return null;
  const s = typeof v === "string" ? v : String(v);
  return (!s || s === "nan" || s === "NaN" || s === "null" || s === "None" || s === "undefined") ? null : s;
};
// Fix badly concatenated org names (e.g. "CHILD ANDFAMILY AGENCY" → "Child And Family Agency")
const cleanName = (name) => {
  if (!name) return name;
  if (typeof name !== "string") name = String(name);
  // Fix missing spaces before capitals in ALL-CAPS names (e.g. "CHILDANDFAMILY" → "CHILD AND FAMILY")
  let fixed = name.replace(/([a-z])([A-Z])/g, "$1 $2")  // camelCase breaks
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")       // "ANDFAMILY" → "AND FAMILY"
    .replace(/\s+/g, " ").trim();
  // Title-case if the name is ALL CAPS (more readable)
  if (fixed === fixed.toUpperCase() && fixed.length > 3) {
    fixed = fixed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\b(Of|The|And|For|In|On|To|By|At|An|A)\b/g, m => m.toLowerCase())
      .replace(/^./, c => c.toUpperCase()); // ensure first char is uppercase
  }
  return fixed;
};
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e9) return `€${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${(n/1e3).toFixed(0)}K`;
  return `€${n.toLocaleString()}`;
};
// ===========================================================
// ENTITY CLASSIFIER — routes orgs to the correct canonical sources
// ===========================================================
// An Irish "nonprofit" in our database can be one of many legal forms.
// Each form files its accounts with a different authority, so pointing
// every listing at the Charities Regulator is wrong for ~40% of records.
// This classifier inspects name + sector + identifiers to work out the
// most likely type, then we use it to surface the right source links.
// Labels + descriptions for the fixed set of entity types. Keeping these in
// a single map means both the heuristic classifier and data ingested from
// the recipient-side scrapers (which set org.entity_type directly) render
// consistently.
const ENTITY_META = {
  local_authority: { label: "Local authority", description: "Irish local authorities are audited by the Local Government Audit Service. Annual financial statements are published on the council's own website and on gov.ie." },
  department: { label: "Government department", description: "Government departments publish annual reports and appropriation accounts through gov.ie, the C&AG, and the Oireachtas library." },
  state_body: { label: "State agency", description: "State agencies file annual reports with their parent department and publish audited accounts through the C&AG and gov.ie." },
  etb: { label: "Education & Training Board", description: "ETBs publish audited financial statements and governance reports through the Department of Education and the C&AG." },
  higher_ed: { label: "Higher education institution", description: "Universities and ITs file audited statements with the Higher Education Authority (HEA) and the C&AG." },
  school: { label: "School", description: "Schools file annual accounts with the Department of Education and, where relevant, their patron or ETB. The Financial Services Support Unit publishes sector-level data." },
  ahb: { label: "Approved Housing Body", description: "AHBs are regulated by the Approved Housing Bodies Regulatory Authority (AHBRA). Annual financial statements are filed with AHBRA and the Housing Agency." },
  sports_club: { label: "Sports club", description: "Sports clubs typically file through their national governing body (GAA, FAI, IRFU, Sport Ireland). Accounts may be published in club AGM minutes rather than a public regulator." },
  religious: { label: "Religious body", description: "Religious bodies often file with the Charities Regulator where registered. Some are constituted as unincorporated associations and publish accounts via their denomination or trust." },
  charity: { label: "Registered charity", description: "Registered charities file annual returns and financial statements with the Charities Regulator of Ireland." },
  company: { label: "Company (CRO)", description: "Non-charity companies file annual returns, accounts, and director lists with the Companies Registration Office (CRO)." },
  unknown: { label: "Irish organisation", description: "This organisation isn't in any of the regulators we've identified. Try a web search or help us classify it." },
};

function classifyEntity(org) {
  if (!org) return { type: "unknown", ...ENTITY_META.unknown };
  // Trust tags coming from the scraper pipeline
  if (org.entity_type && ENTITY_META[org.entity_type]) {
    return { type: org.entity_type, ...ENTITY_META[org.entity_type] };
  }
  const name = (cleanName(org.name) || "").toLowerCase();
  const sector = (clean(org.sector) || "").toLowerCase();
  const govForm = (clean(org.governing_form) || "").toLowerCase();
  const hasCharity = !!clean(org.charity_number);
  const hasCro = !!clean(org.cro_number);

  const pick = (type) => ({ type, ...ENTITY_META[type] });
  // Local authorities — county, city, borough councils
  if (/\b(county council|city council|borough council|town council|city and county council)\b/.test(name)) return pick("local_authority");
  // Central government departments
  if (/^(department of|office of the|office of public works)|\bminister for\b/.test(name)) return pick("department");
  // State agencies and NCAs
  if (/\b(hse|tusla|pobal|údarás|uisce éireann|irish water|fáilte ireland|an garda|revenue commissioners|ordnance survey|enterprise ireland|ida ireland|sfi|science foundation|coimisiún|údarás na gaeltachta)\b/.test(name)) return pick("state_body");
  // Schools — ETBs, primary, secondary, community, gaelscoil
  if (/\b(school|national school|n\.s\.|community college|vocational|etb|education and training board|gaelscoil|gaelcholáiste|coláiste|secondary|primary)\b/.test(name) || sector.includes("education")) {
    if (/\b(etb|education and training board)\b/.test(name)) return pick("etb");
    if (/\buniversity|institute of technology|college|tu dublin|mtu|atu|tus\b/.test(name)) return pick("higher_ed");
    return pick("school");
  }
  // Approved Housing Bodies
  if (/\b(approved housing body|ahb|housing association|co[- ]?operative housing|respond|tuath|clúid|cluid|oaklee|peter mcverry|focus ireland)\b/.test(name) || (sector.includes("housing") && govForm.includes("approved"))) return pick("ahb");
  // Sports clubs
  if (sector.includes("sport") || sector.includes("recreation") || /\b(gaa|club chlg|rfc|afc|fc|hurling|camogie|soccer|rugby|athletic)\b/.test(name)) return pick("sports_club");
  // Religious bodies
  if (sector.includes("religion") || /\b(parish|diocese|archdiocese|church of|catholic|presbyterian|methodist|synod)\b/.test(name)) return pick("religious");
  // Registered charity
  if (hasCharity) return pick("charity");
  // CRO company (non-charity)
  if (hasCro) return pick("company");
  // Fallback
  return pick("unknown");
}

// Returns an array of { label, href, note } source links tailored to the entity type
function getEntitySources(org, entity) {
  const name = cleanName(org.name) || "";
  const encName = encodeURIComponent(name);
  const sources = [];
  const gov = (q) => `https://www.gov.ie/en/search/?q=${encodeURIComponent(q)}`;
  const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

  switch (entity.type) {
    case "local_authority":
      sources.push({ label: "Local Government Audit Service", note: "Audited annual financial statements for all 31 local authorities", href: "https://www.gov.ie/en/organisation/local-government-audit-service/" });
      sources.push({ label: "Council's own website", note: "Most councils publish annual reports and budgets", href: google(`${name} annual report financial statements site:ie`) });
      sources.push({ label: "gov.ie — local authority data", note: "Sector-wide reports and published budgets", href: gov(`${name} annual report`) });
      sources.push({ label: "Oireachtas library", note: "Parliamentary reports referencing the council", href: `https://www.oireachtas.ie/en/search/?q=${encName}` });
      break;
    case "department":
      sources.push({ label: "gov.ie department page", note: "Annual reports, appropriation accounts, strategy statements", href: gov(name) });
      sources.push({ label: "Comptroller & Auditor General", note: "Audited accounts for all votes and departments", href: "https://www.audit.gov.ie/en/find-report/publications/" });
      sources.push({ label: "Oireachtas library", note: "Estimates, PQs, and committee reports", href: `https://www.oireachtas.ie/en/search/?q=${encName}` });
      sources.push({ label: "Revised Estimates Volume", note: "Published annually by DPER", href: "https://www.gov.ie/en/publication/revised-estimates-volume/" });
      break;
    case "state_body":
      sources.push({ label: "gov.ie organisation page", note: "Annual reports, governance, and board information", href: gov(name) });
      sources.push({ label: "Comptroller & Auditor General", note: "Audited accounts for state bodies", href: "https://www.audit.gov.ie/en/find-report/publications/" });
      sources.push({ label: "Oireachtas library", note: "Committee reports and parliamentary scrutiny", href: `https://www.oireachtas.ie/en/search/?q=${encName}` });
      sources.push({ label: "Organisation's own website", note: "Most state bodies publish their own annual reports", href: google(`${name} annual report site:ie`) });
      break;
    case "etb":
      sources.push({ label: "ETBI — Education and Training Boards Ireland", note: "Sector body with governance and financial reporting", href: "https://www.etbi.ie/" });
      sources.push({ label: "Department of Education", note: "ETB annual accounts and inspections", href: gov(`${name} annual accounts`) });
      sources.push({ label: "Comptroller & Auditor General", note: "Audited statements for each ETB", href: "https://www.audit.gov.ie/en/find-report/publications/" });
      sources.push({ label: "ETB's own website", note: "Annual reports and corporate plans", href: google(`${name} annual report`) });
      break;
    case "higher_ed":
      sources.push({ label: "Higher Education Authority (HEA)", note: "Financial statements and governance returns", href: "https://hea.ie/statistics/" });
      sources.push({ label: "Institution's own website", note: "Published annual reports and accounts", href: google(`${name} annual report financial statements`) });
      sources.push({ label: "Comptroller & Auditor General", note: "Audited accounts for publicly funded HEIs", href: "https://www.audit.gov.ie/en/find-report/publications/" });
      sources.push({ label: "Oireachtas library", note: "Parliamentary references and funding debates", href: `https://www.oireachtas.ie/en/search/?q=${encName}` });
      break;
    case "school":
      sources.push({ label: "Department of Education", note: "School rolls, FSSU financial reporting, and inspection reports", href: gov(`${name} school`) });
      sources.push({ label: "Financial Services Support Unit (FSSU)", note: "Financial reporting standards for voluntary secondary schools", href: "https://www.fssu.ie/" });
      sources.push({ label: "Department of Education school search", note: "Official school register", href: "https://www.gov.ie/en/service/find-a-school/" });
      sources.push({ label: "School's own website or parents association", note: "Annual reports and board notices", href: google(`${name} annual report`) });
      break;
    case "ahb":
      sources.push({ label: "AHBRA — Approved Housing Bodies Regulatory Authority", note: "Statutory regulator for all AHBs since 2021", href: "https://www.ahbregulator.ie/" });
      sources.push({ label: "Housing Agency", note: "Sector data, stock transfers, and performance reporting", href: "https://www.housingagency.ie/" });
      sources.push({ label: "ICSH — Irish Council for Social Housing", note: "Representative body with sector statistics", href: "https://icsh.ie/" });
      sources.push({ label: "AHB's own website", note: "Published accounts and tenant reports", href: google(`${name} annual report`) });
      break;
    case "sports_club":
      sources.push({ label: "Sport Ireland", note: "Grants, governance code and national funding data", href: "https://www.sportireland.ie/" });
      sources.push({ label: "National governing body", note: "GAA, FAI, IRFU, or relevant NGB holds affiliation records", href: google(`${name} governing body`) });
      sources.push({ label: "Club's own channels", note: "AGM minutes, newsletters, and club website", href: google(`${name} AGM accounts`) });
      sources.push({ label: "Charities Regulator", note: "Some larger clubs are also registered charities", href: `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities?q=${encName}` });
      break;
    case "religious":
      sources.push({ label: "Charities Regulator", note: "Many religious bodies are registered charities", href: clean(org.charity_number) ? `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities/charity-detail?regid=${org.charity_number}` : `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities?q=${encName}` });
      sources.push({ label: "Diocesan or denominational website", note: "Annual reports and trust accounts", href: google(`${name} diocese annual report`) });
      sources.push({ label: "CRO", note: "If constituted as a company limited by guarantee", href: clean(org.cro_number) ? `https://core.cro.ie/search?q=${org.cro_number}&type=companies` : `https://core.cro.ie/search?q=${encName}&type=companies` });
      break;
    case "charity":
      sources.push({ label: "Charities Regulator of Ireland", note: `Annual reports & filings — RCN ${org.charity_number}`, href: `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities/charity-detail?regid=${org.charity_number}` });
      if (clean(org.cro_number)) sources.push({ label: "CRO — Companies Registration Office", note: `Constitution & annual returns — ${org.cro_number}`, href: `https://core.cro.ie/search?q=${org.cro_number}&type=companies` });
      if (clean(org.revenue_chy)) sources.push({ label: "Revenue Commissioners", note: `Tax-exempt charity register — CHY ${org.revenue_chy}`, href: "https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/resident-charities.aspx" });
      sources.push({ label: "Find published accounts", note: "Annual reports, press releases and web mentions", href: google(`${name} Ireland annual report`) });
      break;
    case "company":
      sources.push({ label: "CRO (CORE)", note: `Accounts and director returns — CRO ${org.cro_number}`, href: `https://core.cro.ie/search?q=${org.cro_number}&type=companies` });
      sources.push({ label: "Charities Regulator — check by name", note: "Some non-profit companies are also registered charities", href: `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities?q=${encName}` });
      sources.push({ label: "Find published accounts", note: "Filed returns or voluntary reports on the web", href: google(`${name} accounts CRO`) });
      break;
    default:
      sources.push({ label: "Charities Regulator — search by name", note: "Not currently matched to a registered charity", href: `https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities?q=${encName}` });
      sources.push({ label: "CRO (CORE) — search by name", note: "Check Ireland's company register", href: `https://core.cro.ie/search?q=${encName}&type=companies` });
      sources.push({ label: "gov.ie", note: "Search Irish government publications", href: gov(name) });
      sources.push({ label: "Find published accounts", note: "Annual reports, press releases and web mentions", href: google(`${name} Ireland annual report`) });
  }
  return sources;
}

// CSV download utility — free tier, no auth required
const downloadCSV = (rows, headers, filename) => {
  const escape = (v) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// ===========================================================
// DATA NORMALISATION LAYER — clean corrupted values client-side
// ===========================================================
const COUNTY_CORRECTIONS = {
  "DORK": "CORK", "LERRY": "DERRY", "DUBLING": "DUBLIN", "LOUHT": "LOUTH",
  "LOUTHN": "LOUTH", "DUBLI 15": "DUBLIN 15", "P85HF62": null, // eircode, not a county
  "OFFALY/LAOIS": "OFFALY", "KILDAR": "KILDARE", "GALWA": "GALWAY", "MEAHT": "MEATH",
  "WEXFROD": "WEXFORD", "DONEGALL": "DONEGAL", "KILKENNEY": "KILKENNY",
  "TIPPERAY": "TIPPERARY", "WATERORD": "WATERFORD", "ROSCOMMON.": "ROSCOMMON",
};
const VALID_COUNTIES = [
  "ANTRIM","ARMAGH","CARLOW","CAVAN","CLARE","CORK","DERRY","DONEGAL","DOWN",
  "DUBLIN","FERMANAGH","GALWAY","KERRY","KILDARE","KILKENNY","LAOIS","LEITRIM",
  "LIMERICK","LONGFORD","LOUTH","MAYO","MEATH","MONAGHAN","OFFALY","ROSCOMMON",
  "SLIGO","TIPPERARY","TYRONE","WATERFORD","WESTMEATH","WEXFORD","WICKLOW",
];
// Dublin postal districts (DUBLIN 1 – DUBLIN 24, DUBLIN 6W)
for (let i = 1; i <= 24; i++) VALID_COUNTIES.push(`DUBLIN ${i}`);
VALID_COUNTIES.push("DUBLIN 6W");

function normaliseCounty(raw) {
  const c = clean(raw);
  if (!c) return null;
  const upper = c.toUpperCase().trim().replace(/\s+/g, " ");
  // Apply known corrections first
  if (COUNTY_CORRECTIONS[upper] !== undefined) return COUNTY_CORRECTIONS[upper];
  // Already valid
  if (VALID_COUNTIES.includes(upper)) return upper;
  // Fuzzy: strip trailing punctuation, extra chars
  const stripped = upper.replace(/[^A-Z0-9 ]/g, "").trim();
  if (VALID_COUNTIES.includes(stripped)) return stripped;
  // Levenshtein-lite: find closest match for short edits (1-2 chars)
  for (const valid of VALID_COUNTIES) {
    if (Math.abs(stripped.length - valid.length) <= 2) {
      let diff = 0;
      const longer = stripped.length >= valid.length ? stripped : valid;
      const shorter = stripped.length < valid.length ? stripped : valid;
      for (let i = 0; i < longer.length; i++) { if (longer[i] !== shorter[i]) diff++; }
      if (diff <= 2 && shorter.length >= 4) return valid;
    }
  }
  return upper; // return as-is if no match found
}

function normaliseText(raw) {
  if (!raw || typeof raw !== "string") return raw;
  return raw
    .replace(/[\u2018\u2019\u201A\uFF07]/g, "'")  // smart single quotes → straight
    .replace(/[\u201C\u201D\u201E\uFF02]/g, '"')   // smart double quotes → straight
    .replace(/[\u2013\u2014]/g, "-")                 // en/em dash → hyphen
    .replace(/\u00A0/g, " ")                         // non-breaking space → space
    .replace(/\u00E2\u0080\u0099/g, "'")             // UTF-8 mojibake for '
    .replace(/\u00E2\u0080\u009C/g, '"')             // UTF-8 mojibake for "
    .replace(/\u00E2\u0080\u009D/g, '"')             // UTF-8 mojibake for "
    .replace(/\ufffd/g, "€");                        // replacement char → euro sign
}

// Apply normalisation to an org object in-place (idempotent)
function normaliseOrg(org) {
  if (!org || org._normalised) return org;
  if (org.county) org.county = normaliseCounty(org.county);
  if (org.name) org.name = normaliseText(org.name);
  if (org.also_known_as) org.also_known_as = normaliseText(org.also_known_as);
  org._normalised = true;
  return org;
}

const funderData = Array.isArray(DATA?.funders) ? DATA.funders : [];
const siteStats = DATA?.stats || {};
const COLORS = ["#059669","#0d9488","#0891b2","#2563eb","#7c3aed","#db2777","#ea580c","#ca8a04","#65a30d","#475569","#dc2626","#4f46e5","#0e7490","#b91c1c"];
// Slug-based funder routing for shareable URLs (e.g. #follow/hse)
const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
const funderSlugs = funderData.map((f, i) => ({ slug: toSlug(f.name), index: i, name: f.name }));
const findFunderBySlug = (slug) => funderSlugs.find(f => f.slug === slug || f.slug.startsWith(slug));
const getFunderSlug = (index) => funderSlugs[index]?.slug || String(index);

// ===========================================================
// AI RISK SCORE — multi-year algorithmic financial health assessment
// ===========================================================
function computeRiskScore(org) {
  if (!org?.financials || org.financials.length === 0) return null;
  const latest = org.financials[0];
  const years = org.financials.length;
  let score = 65; // Base score — neutral starting point
  const factors = [];

  // Helper: compute year-over-year changes for a metric across all years
  const yoyChanges = (metric) => {
    const vals = org.financials.map(f => f[metric]).filter(v => v != null && v > 0);
    if (vals.length < 2) return [];
    // financials[0] is latest, so changes[0] = latest vs previous
    return vals.slice(0, -1).map((v, i) => (v - vals[i + 1]) / vals[i + 1]);
  };

  // Helper: standard deviation
  const stdDev = (arr) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  };

  // ── 1. DATA DEPTH — more years = more confidence ──
  if (years >= 5) { score += 10; factors.push({ label: `${years} years of filings — strong data depth`, impact: "positive" }); }
  else if (years >= 3) { score += 5; factors.push({ label: `${years} years of filings — adequate data`, impact: "positive" }); }
  else if (years === 2) { factors.push({ label: "2 years of data — limited trend analysis", impact: "neutral" }); }
  else { score -= 10; factors.push({ label: "Only 1 year of data — risk score is indicative only", impact: "negative" }); }

  // ── 2. EXPENDITURE RATIO (latest year) ──
  if (latest.gross_income > 0 && latest.gross_expenditure > 0) {
    const ratio = latest.gross_expenditure / latest.gross_income;
    if (ratio > 1.2) { score -= 15; factors.push({ label: `Spending exceeds income by ${Math.round((ratio - 1) * 100)}%`, impact: "negative" }); }
    else if (ratio > 1.0) { score -= 8; factors.push({ label: "Slight deficit — spending marginally exceeds income", impact: "negative" }); }
    else if (ratio >= 0.75) { score += 8; factors.push({ label: "Healthy spending ratio", impact: "positive" }); }
    else if (ratio < 0.5) { score -= 3; factors.push({ label: "Very low spending ratio — possible reserves hoarding", impact: "neutral" }); }
    else { score += 5; factors.push({ label: "Balanced budget", impact: "positive" }); }
  }

  // ── 3. MULTI-YEAR INCOME TREND ──
  const incomeChanges = yoyChanges("gross_income");
  if (incomeChanges.length >= 2) {
    const avgChange = incomeChanges.reduce((s, v) => s + v, 0) / incomeChanges.length;
    const consecutiveDeclines = incomeChanges.filter(c => c < -0.02).length;
    const volatility = stdDev(incomeChanges);

    // Average trend direction
    if (avgChange > 0.08) { score += 10; factors.push({ label: `Income growing avg ${Math.round(avgChange * 100)}% per year over ${incomeChanges.length + 1} years`, impact: "positive" }); }
    else if (avgChange > 0.02) { score += 5; factors.push({ label: `Steady income growth (avg +${Math.round(avgChange * 100)}%/yr)`, impact: "positive" }); }
    else if (avgChange < -0.1) { score -= 15; factors.push({ label: `Significant income decline (avg ${Math.round(avgChange * 100)}%/yr over ${incomeChanges.length + 1} years)`, impact: "negative" }); }
    else if (avgChange < -0.03) { score -= 8; factors.push({ label: `Income declining (avg ${Math.round(avgChange * 100)}%/yr)`, impact: "negative" }); }

    // Consecutive declines are a red flag
    if (consecutiveDeclines >= 3) { score -= 12; factors.push({ label: `${consecutiveDeclines} consecutive years of income decline`, impact: "negative" }); }
    else if (consecutiveDeclines === 2) { score -= 5; factors.push({ label: "2 consecutive years of income decline", impact: "neutral" }); }

    // Income volatility — high year-to-year swings suggest instability
    if (volatility > 0.3) { score -= 8; factors.push({ label: "High income volatility — unpredictable revenue", impact: "negative" }); }
    else if (volatility > 0.15) { score -= 3; factors.push({ label: "Moderate income volatility", impact: "neutral" }); }
    else if (volatility < 0.08 && incomeChanges.length >= 3) { score += 3; factors.push({ label: "Stable, predictable income", impact: "positive" }); }
  } else if (incomeChanges.length === 1) {
    // Only 2 years — simple comparison
    const change = incomeChanges[0];
    if (change > 0.1) { score += 5; factors.push({ label: "Income growing year-over-year", impact: "positive" }); }
    else if (change < -0.15) { score -= 10; factors.push({ label: `Income dropped ${Math.round(Math.abs(change) * 100)}% year-over-year`, impact: "negative" }); }
    else if (change < -0.05) { score -= 3; factors.push({ label: "Slight income decline", impact: "neutral" }); }
  }

  // ── 4. EXPENDITURE TREND — is spending outpacing income? ──
  const expendChanges = yoyChanges("gross_expenditure");
  if (expendChanges.length >= 2 && incomeChanges.length >= 2) {
    const avgIncGrowth = incomeChanges.reduce((s, v) => s + v, 0) / incomeChanges.length;
    const avgExpGrowth = expendChanges.reduce((s, v) => s + v, 0) / expendChanges.length;
    if (avgExpGrowth > avgIncGrowth + 0.05) {
      score -= 8;
      factors.push({ label: "Expenditure growing faster than income over time", impact: "negative" });
    } else if (avgIncGrowth > avgExpGrowth + 0.05) {
      score += 5;
      factors.push({ label: "Income outpacing expenditure growth", impact: "positive" });
    }
  }

  // ── 5. RESERVE TREND — are assets growing or shrinking? ──
  const assetChanges = yoyChanges("total_assets");
  if (assetChanges.length >= 2) {
    const avgAssetChange = assetChanges.reduce((s, v) => s + v, 0) / assetChanges.length;
    if (avgAssetChange < -0.1) { score -= 8; factors.push({ label: "Reserves declining over multiple years", impact: "negative" }); }
    else if (avgAssetChange > 0.05) { score += 5; factors.push({ label: "Growing reserves over time", impact: "positive" }); }
  }
  // Latest reserve coverage
  if (latest.total_assets > 0 && latest.gross_expenditure > 0) {
    const coverage = latest.total_assets / latest.gross_expenditure;
    if (coverage > 1.0) { score += 5; factors.push({ label: "Strong reserves (>1 year of expenditure)", impact: "positive" }); }
    else if (coverage > 0.25) { score += 2; factors.push({ label: "Adequate reserves", impact: "positive" }); }
    else { score -= 5; factors.push({ label: "Low reserve coverage (<3 months)", impact: "neutral" }); }
  }

  // ── 6. STATE FUNDING DEPENDENCY ──
  if (org.grants && org.grants.length > 0 && latest.gross_income > 0) {
    const grantTotal = org.grants.reduce((s, g) => s + (g.amount || 0), 0);
    const dependency = grantTotal / latest.gross_income;
    if (dependency > 0.9) { score -= 3; factors.push({ label: "Very high state funding dependency (>90%)", impact: "neutral" }); }
    else if (dependency > 0.7) { factors.push({ label: "High state funding dependency", impact: "neutral" }); }
    else if (dependency > 0) { score += 3; factors.push({ label: "Diversified income sources", impact: "positive" }); }
  }

  // ── 7. GOVERNANCE ──
  if (org.boardMembers && org.boardMembers.length >= 5) { score += 5; factors.push({ label: `${org.boardMembers.length} board members on record`, impact: "positive" }); }
  else if (org.boardMembers && org.boardMembers.length >= 3) { score += 3; factors.push({ label: `${org.boardMembers.length} board members`, impact: "positive" }); }
  else if (org.boardMembers && org.boardMembers.length > 0) { factors.push({ label: "Small board size", impact: "neutral" }); }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? "low" : score >= 50 ? "moderate" : "elevated";
  const color = score >= 75 ? "emerald" : score >= 50 ? "amber" : "red";
  const confidence = years >= 5 ? "high" : years >= 3 ? "moderate" : "low";
  return { score, level, color, factors, confidence, yearsAnalysed: years };
}

// ===========================================================
// WATCHLIST (localStorage-backed, migrates to Supabase later)
// ===========================================================
function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ob_watchlist") || "[]"); } catch { return []; }
  });
  const toggle = (orgId, orgName) => {
    setWatchlist(prev => {
      const exists = prev.some(w => w.id === orgId);
      const next = exists ? prev.filter(w => w.id !== orgId) : [...prev, { id: orgId, name: orgName, added: new Date().toISOString() }];
      localStorage.setItem("ob_watchlist", JSON.stringify(next));
      return next;
    });
  };
  const isWatched = (orgId) => watchlist.some(w => w.id === orgId);
  return { watchlist, toggle, isWatched };
}

// ===========================================================
// AUTH CONTEXT
// ===========================================================
const AuthContext = createContext();
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("ob_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [showPricing, setShowPricing] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");

  // Trial: check if user is within 30-day Professional trial
  const trialDaysLeft = user?.trialStart ? Math.max(0, 30 - Math.floor((Date.now() - new Date(user.trialStart).getTime()) / 86400000)) : 0;
  const isTrialActive = trialDaysLeft > 0;
  const tier = user?.tier || (isTrialActive ? "professional" : "free");
  const isPro = tier === "pro" || tier === "professional" || tier === "enterprise";
  const logout = () => { setUser(null); localStorage.removeItem("ob_user"); };
  const requirePro = (feature) => { if (!isPro) { setUpgradePrompt(feature); setShowPricing(true); return false; } return true; };

  const ADMIN_EMAILS = ["mark@staydiasports.com", "team@openbenefacts.com"];
  const handleSubmit = (e) => {
    e.preventDefault();
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase().trim());
    const newUser = {
      email,
      name: name || email.split("@")[0],
      tier: isAdmin ? "enterprise" : "free",
      isAdmin,
      trialStart: authMode === "signup" ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };
    setUser(newUser);
    localStorage.setItem("ob_user", JSON.stringify(newUser));
    setShowAuth(false);
    setEmail(""); setPass(""); setName("");
    if (authMode === "signup") setShowOnboarding(true);
  };

  return (
    <AuthContext.Provider value={{ user, tier, isPro, isTrialActive, trialDaysLeft, logout, showAuth, setShowAuth, authMode, setAuthMode, showPricing, setShowPricing, requirePro, upgradePrompt, setUpgradePrompt }}>
      {children}
      {/* Onboarding modal after signup */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowOnboarding(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="font-wordmark text-[32px] text-[#1B3A4B] mb-4 text-center">OpenBenefacts</div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome to OpenBenefacts!</h2>
              <p className="text-gray-500 mt-2">Your 30-day Professional trial is now active. Here's how to get the most out of it:</p>
            </div>
            <div className="space-y-3 mb-6">
              {[
                { icon: Search, title: "Search & explore", desc: "Browse 36,803+ organisations by name, sector, or county" },
                { icon: BarChart3, title: "View full financials", desc: "Access multi-year trends, income breakdowns, and risk scores" },
                { icon: Bookmark, title: "Build your watchlist", desc: "Save organisations you're tracking and monitor changes" },
                { icon: Landmark, title: "Trace funding flows", desc: "See which government bodies fund which nonprofits" },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0"><step.icon className="w-4 h-4 text-emerald-600" /></div>
                  <div><div className="text-sm font-semibold text-gray-900">{step.title}</div><div className="text-xs text-gray-500">{step.desc}</div></div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowOnboarding(false)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">Start exploring</button>
            <p className="text-center text-xs text-gray-400 mt-3">Your Professional trial lasts 30 days. No credit card required.</p>
          </div>
        </div>
      )}
      {showAuth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAuth(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="text-gray-500 mb-6">{authMode === "login" ? "Sign in to your dashboard" : "Join OpenBenefacts for free"}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode !== "login" && <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />}
              <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
              <input type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
              <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2">
                {authMode === "login" ? <><LogIn className="w-4 h-4" /> Sign In</> : <><UserPlus className="w-4 h-4" /> Sign Up Free</>}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-4">
              {authMode === "login" ? "No account? " : "Already have one? "}
              <button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")} className="text-emerald-600 font-medium hover:underline">{authMode === "login" ? "Sign up" : "Sign in"}</button>
            </p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

// ===========================================================
// SHARED COMPONENTS
// ===========================================================
function ErrorState({ message, onRetry }) {
  return (<div className="text-center py-16"><AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" /><h3 className="text-lg font-semibold text-gray-700 mb-2">Something went wrong</h3><p className="text-gray-500 mb-4">{message}</p>{onRetry && <button onClick={onRetry} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Try Again</button>}</div>);
}
function EmptyState({ icon: Icon, title, sub }) {
  return (<div className="text-center py-16">{Icon && <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />}<h3 className="text-lg font-semibold text-gray-600 mb-1">{title}</h3>{sub && <p className="text-sm text-gray-400">{sub}</p>}</div>);
}
function Spinner() {
  return <div className="text-center py-16"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" /><p className="text-gray-400 mt-4">Loading...</p></div>;
}

// ===========================================================
// NAVBAR
// ===========================================================
function Navbar({ page, setPage }) {
  const { user, setShowAuth, setAuthMode, logout, isTrialActive, trialDaysLeft } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const nav = (p) => { setPage(p); setMobileOpen(false); };
  const links = [["home","Dashboard"],["orgs","Organisations"],["funders","Funders"],["councils","Council Finances"],["trackers/emergency-accommodation","Housing Tracker"],["knowledge","Knowledge Base"],["pricing","Pricing"],["api","API"],["about","About"]];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="w-full px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center cursor-pointer flex-shrink-0" onClick={() => nav("home")}>
            <div className="leading-none">
              <span className="font-wordmark text-[28px] text-emerald-700">Open</span>
              <span className="font-wordmark text-[28px] text-[#1a1a2e]">Benefacts</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-0.5">
            {links.map(([key, label]) => (
              <button key={key} onClick={() => nav(key)} className={`px-3 py-1.5 text-sm font-medium transition-colors ${page === key ? "text-[#1B3A4B] border-b-2 border-[#1B3A4B]" : "text-gray-500 hover:text-[#1B3A4B]"}`}>{label}</button>
            ))}
            {user ? (
              <div className="relative ml-4" ref={avatarRef}>
                <button onClick={() => setAvatarOpen(!avatarOpen)} className="w-8 h-8 rounded-full bg-[#1B3A4B] text-white font-semibold text-xs flex items-center justify-center hover:bg-[#0f2b3a]">
                  {(user.name || user.email)[0].toUpperCase()}
                </button>
                {avatarOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="font-medium text-gray-900 text-sm">{user.name || user.email}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      {isTrialActive ? (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Professional Trial · {trialDaysLeft} days left</span>
                      ) : (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full capitalize">{user.tier}</span>
                      )}
                    </div>
                    {!isTrialActive && <button onClick={() => { setAvatarOpen(false); nav("pricing"); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Crown className="w-4 h-4" /> Upgrade</button>}
                    <button onClick={() => { logout(); setAvatarOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><LogOut className="w-4 h-4" /> Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-4">
                <button onClick={() => { setShowAuth(true); setAuthMode("login"); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-[#1B3A4B] font-medium">Login</button>
                <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-4 py-1.5 bg-[#1B3A4B] text-white text-sm rounded font-medium hover:bg-[#0f2b3a] transition-colors">Sign up</button>
              </div>
            )}
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-600">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {links.map(([key, label]) => (<button key={key} onClick={() => nav(key)} className={`block w-full text-left px-3 py-2 rounded-lg text-sm ${page === key ? "bg-gray-100 text-[#1B3A4B] font-semibold" : "text-gray-600"}`}>{label}</button>))}
          {user && <button onClick={() => { logout(); setMobileOpen(false); }} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-600">Sign Out</button>}
        </div>
      )}
    </nav>
  );
}

// ===========================================================
// HOME PAGE
// ===========================================================
function HomePage({ setPage, setInitialSearch, setInitialSector, watchlist }) {
  const [stats, setStats] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [searchTab, setSearchTab] = useState("simple");

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    fetchSectorCounts().then(d => setSectors((d || []).slice(0, 8))).catch(() => {});
  }, []);

  const featured = useMemo(() => {
    const topOrgs = siteStats.topRecipients || [];
    return topOrgs.length > 0 ? topOrgs[Math.floor(Math.random() * Math.min(5, topOrgs.length))] : null;
  }, []);

  // Use data.js stats as fallback
  const orgCount = stats?.total_orgs || siteStats.totalOrgs || 36803;
  const financialCount = stats?.with_financials || siteStats.withFinancials || 12011;
  const fundingLinks = stats?.total_funding_relationships || siteStats.totalFundingRelationships || 9981;

  const topFunders = useMemo(() => [...funderData].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 6), []);
  const totalFunding = funderData.reduce((s, f) => s + (f.total || 0), 0);
  const totalRecipients = funderData.reduce((s, f) => s + (f.recipients || 0), 0);

  const [heroSearch, setHeroSearch] = useState("");
  const doSearch = (q) => { setInitialSearch(q || heroSearch); setPage("orgs"); };
  const chips = ["Barnardos", "HSE", "Focus Ireland", "Rehab Group"];

  const sectorIcons = { "Education, Research": GraduationCap, "Health": Heart, "Social Services": Users, "Arts, Culture, Heritage": Award, "Arts, Culture, Media": Award, "Recreation, Sports": Zap, "Local Development, Housing": Building2, "Religion": Star, "International": Globe, "Environment": Globe, "Advocacy": Shield, "Philanthropy": Sparkles };

  return (
    <div className="bg-white">
      {/* Hero — full-width with geometric background */}
      <div className="relative w-full overflow-hidden" style={{ background: "#1B3A4B" }}>
        <div className="absolute inset-0">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 600">
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2d5f73" /><stop offset="100%" stopColor="#1B3A4B" /></linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3a7d8c" /><stop offset="100%" stopColor="#1B3A4B" /></linearGradient>
              <linearGradient id="g3" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#234e5c" /><stop offset="100%" stopColor="#152d3a" /></linearGradient>
            </defs>
            <polygon points="0,0 200,0 150,600 0,600" fill="url(#g1)" opacity="0.6" />
            <polygon points="200,0 400,0 320,600 150,600" fill="url(#g2)" opacity="0.4" />
            <polygon points="400,0 550,0 500,600 320,600" fill="url(#g3)" opacity="0.5" />
            <polygon points="550,0 750,0 680,600 500,600" fill="url(#g1)" opacity="0.3" />
            <polygon points="750,0 900,0 870,600 680,600" fill="url(#g2)" opacity="0.5" />
            <polygon points="900,0 1050,0 1020,600 870,600" fill="url(#g3)" opacity="0.4" />
            <polygon points="1050,0 1200,0 1200,600 1020,600" fill="url(#g1)" opacity="0.6" />
            <line x1="150" y1="0" x2="150" y2="600" stroke="white" strokeWidth="1" opacity="0.08" transform="rotate(2 150 300)" />
            <line x1="320" y1="0" x2="320" y2="600" stroke="white" strokeWidth="1" opacity="0.06" transform="rotate(1.5 320 300)" />
            <line x1="500" y1="0" x2="500" y2="600" stroke="white" strokeWidth="1.5" opacity="0.1" transform="rotate(1 500 300)" />
            <line x1="680" y1="0" x2="680" y2="600" stroke="white" strokeWidth="1" opacity="0.07" transform="rotate(-1 680 300)" />
            <line x1="870" y1="0" x2="870" y2="600" stroke="white" strokeWidth="1" opacity="0.08" transform="rotate(-1.5 870 300)" />
            <line x1="1020" y1="0" x2="1020" y2="600" stroke="white" strokeWidth="1" opacity="0.06" transform="rotate(-2 1020 300)" />
            <rect x="0" y="180" width="1200" height="1" fill="white" opacity="0.04" />
            <rect x="0" y="350" width="1200" height="1" fill="white" opacity="0.03" />
          </svg>
        </div>

        <div className="relative z-10 w-full px-6 lg:px-10 py-20 lg:py-28 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight max-w-3xl mx-auto">
            Nonprofit transparency data you can trust
          </h1>
          <p className="text-base sm:text-lg text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
            Fresh, auditable information direct from official Irish sources — {orgCount.toLocaleString()} organisations, {financialCount.toLocaleString()} financial records. Free and open to everyone.
          </p>

          {/* Simple Search / Advanced Search tabs */}
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-center gap-1 mb-4">
              <button onClick={() => setSearchTab("simple")}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${searchTab === "simple" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}>
                Simple Search
              </button>
              <button onClick={() => setSearchTab("advanced")}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${searchTab === "advanced" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}>
                Advanced Search
              </button>
            </div>

            {searchTab === "simple" ? (
              <form onSubmit={e => { e.preventDefault(); doSearch(); }} className="mb-6">
                <div className="flex items-center bg-white rounded-lg shadow-xl overflow-hidden">
                  <div className="flex-1 flex items-center">
                    <Search className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
                    <input type="text" placeholder={`Search ${orgCount.toLocaleString()} Organisations`} value={heroSearch} onChange={e => setHeroSearch(e.target.value)} className="flex-1 px-3 py-4 text-base text-gray-900 placeholder:text-gray-400 outline-none border-0" />
                  </div>
                  <button type="submit" className="px-8 py-4 bg-[#c0392b] text-white font-semibold hover:bg-[#a93226] transition-colors flex-shrink-0">
                    <Search className="w-5 h-5" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="mb-6">
                <p className="text-white/70 text-sm mb-4">Filter by location, sector, organisation type, income band, and regulatory status.</p>
                <button onClick={() => setPage("orgs")} className="px-8 py-3.5 bg-white text-[#1B3A4B] font-semibold rounded-lg hover:bg-white/90 transition-colors shadow-xl">
                  Open Advanced Search
                </button>
              </div>
            )}

            {searchTab === "simple" && (
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {chips.map(c => <button key={c} onClick={() => doSearch(c)} className="px-4 py-1.5 bg-white/10 border border-white/20 rounded text-sm text-white/90 hover:bg-white/20 transition-colors">{c}</button>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-6 lg:px-10 py-8">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
        {[
          { label: "Organisations", value: orgCount.toLocaleString(), sub: "Charities, AHBs, schools, clubs", icon: Building2 },
          { label: "Financial Records", value: financialCount.toLocaleString(), sub: "Income, expenditure, assets", icon: FileText },
          { label: "Funding Links", value: fundingLinks.toLocaleString(), sub: "State → nonprofit relationships", icon: Zap },
          { label: "State Funders", value: funderData.length || 14, sub: `${totalRecipients.toLocaleString()} orgs funded`, icon: Landmark },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#1B3A4B]/10 p-5">
            <s.icon className="w-7 h-7 text-[#1B3A4B] mb-2" />
            <div className="font-wordmark text-3xl text-[#1a1a2e]">{s.value}</div>
            <div className="text-sm font-semibold text-[#1B3A4B]">{s.label}</div>
            <div className="text-xs text-[#1B3A4B]/60 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* What OpenBenefacts Offers — services grid */}
      <div className="mb-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-4 text-[11px] font-bold tracking-[0.15em] uppercase text-[#1B3A4B]">
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
            What we offer
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
          </div>
          <h2 className="font-wordmark text-4xl sm:text-5xl text-[#1a1a2e] mb-4 leading-[1]">Everything you need to follow Irish nonprofit money.</h2>
          <p className="text-lg text-[#1B3A4B]/70">Free tools for the public. Professional tools for journalists, funders, researchers, and nonprofits who need to go deeper.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Search, title: "Organisation Search", desc: `Search ${orgCount.toLocaleString()} Irish charities, housing bodies, schools, and sports clubs by name, sector, county, or income.`, cta: "Start searching", page: "orgs", tag: "Free" },
            { icon: FileText, title: "Financial Records", desc: `${financialCount.toLocaleString()} filed accounts with income, expenditure, assets, reserves, and year-on-year trends for every organisation.`, cta: "Browse financials", page: "orgs", tag: "Free" },
            { icon: Layers, title: "Follow the Money", desc: "Interactive Sankey diagrams showing exactly where every euro of state funding lands — from government department to recipient organisation.", cta: "See the flows", page: "money", tag: "Free" },
            { icon: Shield, title: "Due Diligence Reports", desc: "Printable PDF reports with AI-generated risk scores, governance red flags, board analysis, and three-year financial trends.", cta: "Run a report", page: "orgs", tag: "Pro" },
            { icon: Landmark, title: "Funder Intelligence", desc: `Profiles for ${funderData.length || 14} Irish state funders — HSE, Pobal, Tusla, Arts Council and more — with full recipient lists and grant histories.`, cta: "Browse funders", page: "funders", tag: "Free" },
            { icon: Database, title: "API & Bulk Data", desc: "Programmatic access to every organisation, financial record, and funding relationship. CSV exports and JSON endpoints for developers and researchers.", cta: "View the API", page: "api", tag: "Pro" },
            { icon: Home, title: "Housing Tracker", desc: "Live LA-by-LA breakdown of emergency accommodation usage and estimated spend across all 31 Irish local authorities. Data from DHLGH monthly reports.", cta: "View tracker", page: "trackers/emergency-accommodation", tag: "Free" },
          ].map((svc, i) => (
            <button key={i} onClick={() => setPage(svc.page)} className="group text-left bg-white rounded-2xl border border-[#1B3A4B]/10 p-7 hover:border-[#1B3A4B] hover:shadow-xl hover:-translate-y-1 transition-all">
              <div className="flex items-start justify-between mb-5">
                <div className="w-12 h-12 bg-[#4A9B8E] rounded-xl flex items-center justify-center group-hover:bg-[#1B3A4B] transition-colors">
                  <svc.icon className="w-6 h-6 text-[#1B3A4B] group-hover:text-[#4A9B8E] transition-colors" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${svc.tag === "Pro" ? "bg-[#1B3A4B] text-[#4A9B8E]" : "bg-[#1B3A4B]/10 text-[#1B3A4B]"}`}>{svc.tag}</span>
              </div>
              <h3 className="font-wordmark text-2xl text-[#1a1a2e] mb-3 leading-tight">{svc.title}</h3>
              <p className="text-sm text-[#1B3A4B]/70 leading-relaxed mb-5">{svc.desc}</p>
              <div className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1B3A4B] group-hover:gap-3 transition-all">
                {svc.cta} <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Who uses OpenBenefacts — audience ribbon */}
      <div className="bg-white rounded-3xl border border-[#1B3A4B]/10 p-8 sm:p-12 mb-16">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 mb-4 text-[11px] font-bold tracking-[0.15em] uppercase text-[#1B3A4B]">
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
            Who uses it
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
          </div>
          <h2 className="font-wordmark text-3xl sm:text-4xl text-[#1a1a2e] leading-[1]">Built for everyone who cares where the money goes.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: FileText, title: "Journalists", desc: "Investigate state spending, find stories in the data, and source financial facts with citation-ready URLs." },
            { icon: Heart, title: "Nonprofits", desc: "Benchmark against peers, find new funders, and claim your listing to keep your public profile accurate." },
            { icon: Briefcase, title: "Funders & grantmakers", desc: "Due diligence on grantees, portfolio analytics, and context on existing state funding before you commit." },
            { icon: GraduationCap, title: "Researchers", desc: "Academic access to bulk data, funding flows, and historical records for policy and civil society research." },
          ].map((a, i) => (
            <div key={i} className="text-center">
              <div className="w-14 h-14 bg-[#1B3A4B] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <a.icon className="w-7 h-7 text-[#4A9B8E]" />
              </div>
              <h3 className="font-wordmark text-xl text-[#1a1a2e] mb-2">{a.title}</h3>
              <p className="text-sm text-[#1B3A4B]/70 leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works — 3-step process */}
      <div className="mb-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-4 text-[11px] font-bold tracking-[0.15em] uppercase text-[#1B3A4B]">
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
            How it works
            <span className="w-8 h-px bg-[#1B3A4B]"></span>
          </div>
          <h2 className="font-wordmark text-3xl sm:text-4xl text-[#1a1a2e] leading-[1]">From question to answer in three steps.</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { n: "01", title: "Search", desc: "Start with a name, sector, county, or keyword. Narrow by income band, governing form, or year." },
            { n: "02", title: "Explore", desc: "Open any organisation for the full financial history, governance data, state-funding trail, and risk flags." },
            { n: "03", title: "Export or cite", desc: "Download a due diligence PDF, grab a shareable URL, pull data through the API, or embed a live widget." },
          ].map((s, i) => (
            <div key={i} className="bg-[#FFFFFF] rounded-2xl p-7 border border-[#1B3A4B]/10">
              <div className="font-wordmark text-5xl text-[#4A9B8E] mb-3 leading-none">{s.n}</div>
              <h3 className="font-wordmark text-2xl text-[#1a1a2e] mb-2">{s.title}</h3>
              <p className="text-sm text-[#1B3A4B]/70 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The Story — DOGE for Ireland positioning */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 sm:p-8 mb-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 items-start">
            <div className="flex-1">
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">Why this exists</p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-3 leading-tight">Ireland needed its own DOGE.<br/>It already had one. The government killed it.</h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">Benefacts tracked every euro flowing from the state to nonprofits — who got what, from whom, and whether the money was well spent. In 2022, government funding was pulled and Benefacts shut down. For four years, €14 billion per year flowed with no independent oversight.</p>
              <p className="text-white text-sm font-medium">OpenBenefacts picks up where they left off — open, independent, and free to search.</p>
            </div>
            <div className="sm:w-64 flex-shrink-0 space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-3xl font-extrabold text-emerald-400">€14B</div>
                <div className="text-xs text-gray-400 mt-1">flows from government to nonprofits every year</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-3xl font-extrabold text-red-400">4 years</div>
                <div className="text-xs text-gray-400 mt-1">with no independent tracking after Benefacts closed</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-3xl font-extrabold text-white">{orgCount.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">organisations now tracked on OpenBenefacts</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={() => setPage("funders")} className="px-5 py-2.5 bg-emerald-500 text-white text-sm rounded-xl font-semibold hover:bg-emerald-400 transition-colors">Follow the money</button>
            <button onClick={() => setPage("about")} className="px-5 py-2.5 bg-white/10 text-white text-sm rounded-xl font-semibold hover:bg-white/20 transition-colors border border-white/20">Read the full story</button>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-6 mb-10">
        {sectors.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Sector Distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={sectors.slice(0, 8).map((s, i) => ({ name: (typeof s === "string" ? s : s.sector) || s, value: typeof s === "string" ? 1 : (s.org_count || 1), fill: COLORS[i % COLORS.length] }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${(name || "").split(",")[0].trim().substring(0, 18)} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {sectors.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {siteStats.topRecipients && siteStats.topRecipients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Largest Organisations</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={siteStats.topRecipients.slice(0, 6).map(r => ({ name: cleanName(r.name).substring(0, 24), income: r.totalIncome }))} layout="vertical" margin={{ left: 5, right: 20 }}>
                <XAxis type="number" tickFormatter={v => v >= 1e9 ? `€${(v/1e9).toFixed(0)}B` : v >= 1e6 ? `€${(v/1e6).toFixed(0)}M` : `€${v}`} fontSize={10} />
                <YAxis type="category" dataKey="name" width={120} fontSize={10} />
                <Tooltip formatter={v => fmt(v)} />
                <Bar dataKey="income" fill="#059669" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Featured Org */}
      {featured && (
        <div onClick={() => setPage(`org:${featured.id}`)} className="bg-white rounded-2xl border border-gray-100 p-6 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-emerald-200 hover:shadow-md transition-all">
          <div>
            <div className="text-xs font-medium text-emerald-600 mb-1">Featured Organisation</div>
            <h3 className="text-lg font-bold text-gray-900">{cleanName(featured.name)}</h3>
            <p className="text-sm text-gray-500">{featured.rcn ? `RCN ${featured.rcn}` : ""}</p>
          </div>
          <div className="flex items-center gap-6">
            <div><div className="text-xs text-gray-400">Income</div><div className="text-lg font-bold text-gray-900">{fmt(featured.totalIncome)}</div></div>
            <div><div className="text-xs text-gray-400">State Funding</div><div className="text-lg font-bold text-emerald-600">{fmt(featured.stateIncome)}</div></div>
            <div><div className="text-xs text-gray-400">State %</div><div className="text-lg font-bold text-blue-600">{featured.statePct?.toFixed(1)}%</div></div>
          </div>
        </div>
      )}

      {/* Watchlist */}
      {watchlist.watchlist.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Watchlist</h2>
            <span className="text-sm text-gray-400">{watchlist.watchlist.length} organization{watchlist.watchlist.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {watchlist.watchlist.slice(0, 6).map(w => (
              <div key={w.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center justify-between">
                <button onClick={() => setPage(`org:${w.id}`)} className="text-left flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">{cleanName(w.name)}</h3>
                  <div className="text-xs text-gray-400 mt-0.5">Added {new Date(w.added).toLocaleDateString()}</div>
                </button>
                <button onClick={() => watchlist.toggle(w.id, w.name)} className="p-1 ml-2 text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State Funders Preview */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">State Funders</h2>
          <button onClick={() => setPage("funders")} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">View all</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topFunders.map((f, i) => {
            const funderIdx = funderData.indexOf(f);
            return (
              <div key={i} onClick={() => setPage(`follow/${getFunderSlug(funderIdx >= 0 ? funderIdx : i)}`)} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{f.name}</h3>
                  <Layers className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 flex-shrink-0 transition-colors" />
                </div>
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="font-bold text-gray-900">{fmt(f.total)}</span>
                  <span className="text-gray-400">{(f.recipients || 0).toLocaleString()} recipients</span>
                  <span className="text-gray-400">{(f.programmes?.length || 0)} programmes</span>
                </div>
                <div className="text-xs font-medium text-emerald-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  View funding flow <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Browse by Sector */}
      {sectors.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Browse by Sector</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sectors.map((s, i) => {
              const sectorName = typeof s === "string" ? s : s.sector;
              const orgCount = typeof s === "string" ? 0 : s.org_count;
              const Icon = sectorIcons[sectorName] || Briefcase;
              return (
                <button key={i} onClick={() => { setInitialSearch(""); setInitialSector(sectorName); setPage("orgs"); }} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:border-emerald-200 hover:shadow-md transition-all group">
                  <Icon className="w-6 h-6 text-emerald-600 mb-2" />
                  <div className="font-medium text-gray-900 text-sm">{sectorName}</div>
                  <div className="text-xs text-gray-400">{orgCount?.toLocaleString()} organisations</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="bg-[#1B3A4B] rounded-3xl p-8 sm:p-12 text-center text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#4A9B8E]/20 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <p className="text-[#4A9B8E] text-xs font-bold uppercase tracking-[0.2em] mb-4">The money trail is back</p>
          <h2 className="font-wordmark text-3xl sm:text-5xl text-white mb-4 leading-[1]">€14 billion deserves oversight.</h2>
          <p className="text-white/80 max-w-2xl mx-auto mb-8 text-lg">Benefacts is gone. OpenBenefacts is here — with full financials, AI risk scores, funder mapping, and due diligence reports.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => setPage("pricing")} className="px-8 py-4 bg-[#4A9B8E] text-[#1B3A4B] rounded-full font-bold hover:bg-white transition-colors">Start free trial</button>
            <button onClick={() => setPage("orgs")} className="px-8 py-4 bg-white/10 text-white rounded-full font-semibold hover:bg-white/20 transition-colors border border-white/30">Browse {orgCount.toLocaleString()} organisations</button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ===========================================================
// ORGANIZATIONS PAGE — Advanced search with Benefacts-style filter sidebar
// ===========================================================

// Reusable accordion filter section
function FilterSection({ title, icon: Icon, open, onToggle, count, children }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          <span className="text-sm font-medium text-gray-700">{title}</span>
          {count > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{count}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// Checkbox list with optional "show more" and search
function CheckboxFilter({ items, selected, onToggle, maxVisible = 8, showCounts = true }) {
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState("");
  const filtered = filterText ? items.filter(i => i.label.toLowerCase().includes(filterText.toLowerCase())) : items;
  const visible = expanded ? filtered : filtered.slice(0, maxVisible);
  const hasMore = filtered.length > maxVisible;

  return (
    <div>
      {items.length > maxVisible && (
        <input type="text" placeholder="Filter..." value={filterText} onChange={e => setFilterText(e.target.value)}
          className="w-full px-2 py-1 mb-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-emerald-400 outline-none" />
      )}
      <div className="space-y-0.5 max-h-56 overflow-y-auto">
        {visible.map(item => (
          <label key={item.value} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer group">
            <input type="checkbox" checked={selected.includes(item.value)} onChange={() => onToggle(item.value)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-xs text-gray-600 flex-1 truncate group-hover:text-gray-900">{item.label}</span>
            {showCounts && item.count != null && <span className="text-xs text-gray-400">{item.count.toLocaleString()}</span>}
          </label>
        ))}
      </div>
      {hasMore && !filterText && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-emerald-600 hover:underline mt-1 px-1">
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

// The 26 Republic of Ireland counties (canonical order — alphabetical)
const IRISH_COUNTIES = [
  "ANTRIM","ARMAGH","CARLOW","CAVAN","CLARE","CORK","DERRY","DONEGAL","DOWN",
  "DUBLIN","FERMANAGH","GALWAY","KERRY","KILDARE","KILKENNY","LAOIS","LEITRIM",
  "LIMERICK","LONGFORD","LOUTH","MAYO","MEATH","MONAGHAN","OFFALY","ROSCOMMON",
  "SLIGO","TIPPERARY","TYRONE","WATERFORD","WESTMEATH","WEXFORD","WICKLOW",
];

const INCOME_BANDS = [
  { label: "Less than €10K", value: "0-10k", min: 0, max: 10000 },
  { label: "€10K – €50K", value: "10k-50k", min: 10000, max: 50000 },
  { label: "€50K – €100K", value: "50k-100k", min: 50000, max: 100000 },
  { label: "€100K – €500K", value: "100k-500k", min: 100000, max: 500000 },
  { label: "€500K – €1M", value: "500k-1m", min: 500000, max: 1000000 },
  { label: "€1M – €5M", value: "1m-5m", min: 1000000, max: 5000000 },
  { label: "€5M – €10M", value: "5m-10m", min: 5000000, max: 10000000 },
  { label: "€10M – €50M", value: "10m-50m", min: 10000000, max: 50000000 },
  { label: "Over €50M", value: "50m+", min: 50000000, max: null },
];

function OrgsPage({ setPage, initialSearch, setInitialSearch, initialSector, setInitialSector, watchlist }) {
  const { tier, requirePro } = useAuth();
  const isProfessional = tier === "professional" || tier === "enterprise";
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState(initialSearch || "");
  const [sortBy, setSortBy] = useState("income");
  const [showFilters, setShowFilters] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const pageSize = 30;
  const timer = useRef(null);

  // Multi-select filter state
  const [selSectors, setSelSectors] = useState([]);
  const [selSubsectors, setSelSubsectors] = useState([]);
  const [selCounties, setSelCounties] = useState([]);
  const [selGovForms, setSelGovForms] = useState([]);
  const [selIncomeBand, setSelIncomeBand] = useState("");
  const [hasCharityNum, setHasCharityNum] = useState(null);
  const [hasCroNum, setHasCroNum] = useState(null);
  const [hasChyNum, setHasChyNum] = useState(null);
  const [hasFunding, setHasFunding] = useState(null);

  // Reference data for filter panels
  const [sectorList, setSectorList] = useState([]);
  const [subsectorList, setSubsectorList] = useState([]);
  const [countyList, setCountyList] = useState([]);
  const [govFormList, setGovFormList] = useState([]);

  // Accordion open state
  const [openSections, setOpenSections] = useState({ county: false, sector: true, type: false, income: false, regulatory: false });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Load reference data
  useEffect(() => {
    fetchSectorCounts().then(d => {
      setSectorList((d || []).map(s => ({ label: s.sector, value: s.sector, count: s.org_count })));
    }).catch(() => {});
    fetchCountyCounts().then(d => {
      const raw = (d || []).map(c => ({ ...c, county: normaliseCounty(c.county) })).filter(c => c.county);
      const merged = {};
      raw.forEach(c => { merged[c.county] = (merged[c.county] || 0) + (c.org_count || 1); });
      // Use canonical county list, supplemented with any extras from DB
      const canonical = IRISH_COUNTIES.map(c => ({ label: c, value: c, count: merged[c] || 0 })).filter(c => c.count > 0);
      const extras = Object.entries(merged).filter(([c]) => !IRISH_COUNTIES.includes(c)).map(([c, count]) => ({ label: c, value: c, count }));
      setCountyList([...canonical, ...extras]);
    }).catch(() => {});
    fetchGovFormCounts().then(d => {
      setGovFormList((d || []).map(g => ({ label: g.form, value: g.form, count: g.count })));
    }).catch(() => {});
  }, []);

  // Load subsectors when sector selection changes
  useEffect(() => {
    if (selSectors.length === 1) {
      fetchSubsectorCounts(selSectors[0]).then(d => {
        setSubsectorList((d || []).map(s => ({ label: s.subsector, value: s.subsector, count: s.count })));
      }).catch(() => {});
    } else {
      setSubsectorList([]);
      setSelSubsectors([]);
    }
  }, [selSectors]);

  // Handle initial values from hero search
  useEffect(() => {
    if (initialSearch) { setSearch(initialSearch); setInitialSearch(""); }
  }, [initialSearch]);
  useEffect(() => {
    if (initialSector) { setSelSectors([initialSector]); setInitialSector(""); setShowFilters(true); }
  }, [initialSector]);

  const isFirstLoad = useRef(true);

  // Count active filters
  const activeFilterCount = selSectors.length + selSubsectors.length + selCounties.length + selGovForms.length
    + (selIncomeBand ? 1 : 0) + (hasCharityNum !== null ? 1 : 0) + (hasCroNum !== null ? 1 : 0) + (hasChyNum !== null ? 1 : 0) + (hasFunding !== null ? 1 : 0);

  const toggleArrayValue = (arr, setArr, value) => {
    setArr(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    setPageNum(1);
  };

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const sortMap = { income: "gross_income", employees: "employees", stateFunding: "total_grant_amount", name: "name" };
      const band = INCOME_BANDS.find(r => r.value === selIncomeBand);
      const result = await fetchOrganisationsAdvanced({
        page: pageNum,
        pageSize,
        search: search.trim(),
        sectors: selSectors,
        subsectors: selSubsectors,
        counties: selCounties,
        govForms: selGovForms,
        minIncome: band?.min ?? null,
        maxIncome: band?.max ?? null,
        hasCharityNumber: hasCharityNum,
        hasCroNumber: hasCroNum,
        hasChyNumber: hasChyNum,
        hasFunding,
        sortBy: sortMap[sortBy] || "gross_income",
        sortDir: sortBy === "name" ? "asc" : "desc",
      });
      setOrgs((result?.orgs || []).map(normaliseOrg));
      setTotal(result?.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
    if (!isFirstLoad.current) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    isFirstLoad.current = false;
  }, [search, pageNum, selSectors, selSubsectors, selCounties, selGovForms, selIncomeBand, hasCharityNum, hasCroNum, hasChyNum, hasFunding, sortBy]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleSearch = (v) => {
    setSearch(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPageNum(1);
      if (v.trim().length >= 2) {
        searchOrganisations(v.trim(), 8).then(r => setSuggestions((r || []).map(normaliseOrg))).catch(() => {});
      } else {
        setSuggestions([]);
      }
    }, 300);
  };

  const clearAllFilters = () => {
    setSelSectors([]); setSelSubsectors([]); setSelCounties([]); setSelGovForms([]);
    setSelIncomeBand(""); setHasCharityNum(null); setHasCroNum(null); setHasChyNum(null); setHasFunding(null);
    setPageNum(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  // Active filter pills
  const filterPills = [
    ...selSectors.map(s => ({ label: s, clear: () => setSelSectors(p => p.filter(v => v !== s)) })),
    ...selSubsectors.map(s => ({ label: s, clear: () => setSelSubsectors(p => p.filter(v => v !== s)) })),
    ...selCounties.map(c => ({ label: c, clear: () => setSelCounties(p => p.filter(v => v !== c)) })),
    ...selGovForms.map(g => ({ label: g, clear: () => setSelGovForms(p => p.filter(v => v !== g)) })),
    ...(selIncomeBand ? [{ label: INCOME_BANDS.find(b => b.value === selIncomeBand)?.label || selIncomeBand, clear: () => setSelIncomeBand("") }] : []),
    ...(hasCharityNum !== null ? [{ label: hasCharityNum ? "Has Charity Number" : "No Charity Number", clear: () => setHasCharityNum(null) }] : []),
    ...(hasCroNum !== null ? [{ label: hasCroNum ? "Has CRO Number" : "No CRO Number", clear: () => setHasCroNum(null) }] : []),
    ...(hasChyNum !== null ? [{ label: "Has Revenue CHY", clear: () => setHasChyNum(null) }] : []),
    ...(hasFunding !== null ? [{ label: "Has State Funding", clear: () => setHasFunding(null) }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Advanced Search</h1>
          <p className="text-gray-500">Search {total.toLocaleString()} Irish nonprofits with real government data</p>
        </div>
        <div className="flex items-center gap-3">
          {isProfessional ? (
            <button onClick={() => {
              const headers = ["Name","Sector","Subsector","County","Type","Charity Number","CRO Number","Gross Income","Gross Expenditure","Employees"];
              const csvRows = [headers.join(",")];
              orgs.forEach(o => {
                csvRows.push([
                  `"${(o.name || "").replace(/"/g, '""')}"`,
                  `"${o.sector || ""}"`,
                  `"${o.subsector || ""}"`,
                  `"${o.county || ""}"`,
                  `"${o.governing_form || ""}"`,
                  o.charity_number || "",
                  o.cro_number || "",
                  o.gross_income || "",
                  o.gross_expenditure || "",
                  o.employees || "",
                ].join(","));
              });
              const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `openbenefacts-export-${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
              <Database className="w-3.5 h-3.5" /> Export CSV
            </button>
          ) : (
            <button onClick={() => requirePro("CSV Export")} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 text-sm rounded-lg hover:bg-gray-200">
              <Lock className="w-3.5 h-3.5" /> Export
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by name, charity number, or CRO number..." value={search} onChange={e => handleSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
          {suggestions.length > 0 && search.trim().length >= 2 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => { setPage(`org:${s.id}`); setSuggestions([]); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="font-medium text-sm text-gray-900">{cleanName(s.name)}</div>
                  <div className="text-xs text-gray-400">{[s.sector, s.county].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-3 rounded-xl border font-medium text-sm flex items-center gap-2 whitespace-nowrap ${showFilters ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <Filter className="w-4 h-4" /> {showFilters ? "Hide Filters" : "Show Filters"} {activeFilterCount > 0 && <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Active filter pills */}
      {filterPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {filterPills.map((pill, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              {pill.label}
              <button onClick={() => { pill.clear(); setPageNum(1); }} className="hover:text-emerald-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-emerald-600 px-2 py-1">Clear all</button>
        </div>
      )}

      {/* Main layout: sidebar + results */}
      <div className={`flex gap-6 ${showFilters ? "" : ""}`}>
        {/* Filter sidebar */}
        {showFilters && (
          <div className="w-72 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
              <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter Results</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-emerald-600 hover:underline">Reset</button>
                )}
              </div>

              {/* Location */}
              <FilterSection title="Location" icon={MapPin} open={openSections.county} onToggle={() => toggleSection("county")} count={selCounties.length}>
                <CheckboxFilter items={countyList} selected={selCounties} onToggle={v => toggleArrayValue(selCounties, setSelCounties, v)} maxVisible={10} />
              </FilterSection>

              {/* Sector / Classification */}
              <FilterSection title="Sector" icon={Layers} open={openSections.sector} onToggle={() => toggleSection("sector")} count={selSectors.length + selSubsectors.length}>
                <CheckboxFilter items={sectorList} selected={selSectors} onToggle={v => toggleArrayValue(selSectors, setSelSectors, v)} maxVisible={10} />
                {subsectorList.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="text-xs font-medium text-gray-400 mb-1 px-1">Subsectors</div>
                    <CheckboxFilter items={subsectorList} selected={selSubsectors} onToggle={v => toggleArrayValue(selSubsectors, setSelSubsectors, v)} maxVisible={8} />
                  </div>
                )}
              </FilterSection>

              {/* Organisation Type */}
              <FilterSection title="Organisation Type" icon={Building2} open={openSections.type} onToggle={() => toggleSection("type")} count={selGovForms.length}>
                <CheckboxFilter items={govFormList} selected={selGovForms} onToggle={v => toggleArrayValue(selGovForms, setSelGovForms, v)} maxVisible={8} />
              </FilterSection>

              {/* Income Band */}
              <FilterSection title="Income Band" icon={DollarSign} open={openSections.income} onToggle={() => toggleSection("income")} count={selIncomeBand ? 1 : 0}>
                <div className="space-y-0.5">
                  {INCOME_BANDS.map(band => (
                    <label key={band.value} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="radio" name="incomeBand" checked={selIncomeBand === band.value} onChange={() => { setSelIncomeBand(selIncomeBand === band.value ? "" : band.value); setPageNum(1); }}
                        className="w-3.5 h-3.5 border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-xs text-gray-600">{band.label}</span>
                    </label>
                  ))}
                  {selIncomeBand && (
                    <button onClick={() => { setSelIncomeBand(""); setPageNum(1); }} className="text-xs text-emerald-600 hover:underline px-1 mt-1">Clear</button>
                  )}
                </div>
              </FilterSection>

              {/* Regulatory Status */}
              <FilterSection title="Regulatory Status" icon={Shield} open={openSections.regulatory} onToggle={() => toggleSection("regulatory")}
                count={(hasCharityNum !== null ? 1 : 0) + (hasCroNum !== null ? 1 : 0) + (hasChyNum !== null ? 1 : 0) + (hasFunding !== null ? 1 : 0)}>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={hasCharityNum === true} onChange={() => { setHasCharityNum(hasCharityNum === true ? null : true); setPageNum(1); }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-gray-600">Registered Charity (CRA)</span>
                  </label>
                  <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={hasCroNum === true} onChange={() => { setHasCroNum(hasCroNum === true ? null : true); setPageNum(1); }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-gray-600">CRO Registered Company</span>
                  </label>
                  <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={hasChyNum === true} onChange={() => { setHasChyNum(hasChyNum === true ? null : true); setPageNum(1); }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-gray-600">Tax Relief (Revenue CHY)</span>
                  </label>
                  <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={hasFunding === true} onChange={() => { setHasFunding(hasFunding === true ? null : true); setPageNum(1); }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-gray-600">Received State Funding</span>
                  </label>
                </div>
              </FilterSection>
            </div>
          </div>
        )}

        {/* No separate mobile filter panel — on smaller screens, the sidebar is hidden and users use the search bar */}

        {/* Results column */}
        <div className="flex-1 min-w-0">
          {/* Sort + result count bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap gap-1.5">
              {[["income","Income ↓"],["employees","Employees ↓"],["stateFunding","State Funding ↓"],["name","Name A-Z"]].map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${sortBy === key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{label}</button>
              ))}
            </div>
            <span className="text-sm text-gray-400">{total.toLocaleString()} results</span>
          </div>

          {/* Results */}
          {loading ? <Spinner /> : orgs.length === 0 ? <EmptyState icon={Building2} title="No organisations found" sub="Try adjusting your search or filters" /> : (
            <>
              <div className="space-y-2">
                {orgs.map((org, i) => (
                  <div key={org.id || i} className="w-full bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-emerald-100 transition-all flex items-center justify-between">
                    <button onClick={() => setPage(`org:${org.id}`)} className="flex-1 min-w-0 text-left">
                      <h3 className="font-semibold text-gray-900 truncate">{cleanName(org.name)}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{[clean(org.sector), clean(org.subsector), clean(org.county), clean(org.governing_form)].filter(Boolean).join(" · ") || "Registered nonprofit"}</p>
                    </button>
                    <div className="text-right flex-shrink-0 ml-4 flex items-center gap-4">
                      {org.gross_income > 0 && <div><div className="text-sm font-semibold text-gray-900">{fmt(org.gross_income)}</div><div className="text-xs text-gray-400">Income</div></div>}
                      {org.total_grant_amount > 0 && <div><div className="text-sm font-semibold text-emerald-600">{fmt(org.total_grant_amount)}</div><div className="text-xs text-gray-400">State funding</div></div>}
                      <button onClick={(e) => { e.stopPropagation(); watchlist.toggle(org.id, org.name); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title={watchlist.isWatched(org.id) ? "Remove from watchlist" : "Add to watchlist"}>
                        <Bookmark className={`w-4 h-4 ${watchlist.isWatched(org.id) ? "fill-emerald-500 text-emerald-500" : "text-gray-300"}`} />
                      </button>
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button onClick={() => setPageNum(1)} disabled={pageNum === 1} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">First</button>
                  <button onClick={() => setPageNum(Math.max(1, pageNum - 1))} disabled={pageNum === 1} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                  <span className="text-sm text-gray-500">Page {pageNum} of {totalPages}</span>
                  <button onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))} disabled={pageNum === totalPages} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
                  <button onClick={() => setPageNum(totalPages)} disabled={pageNum === totalPages} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">Last</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// ORG PROFILE (shows 1 year financials FREE per audit)
// ===========================================================
function OrgProfilePage({ orgId, setPage, watchlist, embed = false }) {
  const { isPro, requirePro, tier } = useAuth();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [expandedDirector, setExpandedDirector] = useState(null);
  const [directorBoards, setDirectorBoards] = useState({});
  const [benchmark, setBenchmark] = useState(null);
  const [copied, setCopied] = useState(null); // "link" | "cite" | "embed"
  const [showAllFunding, setShowAllFunding] = useState(false);
  // White-label branding for reports
  const [showBranding, setShowBranding] = useState(null); // "pdf" or "dd"
  const [brandName, setBrandName] = useState(() => { try { return localStorage.getItem("ob_brand_name") || ""; } catch { return ""; } });
  const saveBrand = (v) => { setBrandName(v); try { localStorage.setItem("ob_brand_name", v); } catch {} };
  const pendingReportRef = useRef(null); // "pdf" or "dd" — set when branding dialog intercepts
  const pdfBtnRef = useRef(null);
  const ddBtnRef = useRef(null);

  // Reliable report opener: Blob URL avoids document.write() issues and popup-blocker edge cases
  const openReportWindow = (html) => {
    // Inject a floating "Save as PDF" button + auto-hide on print (hidden in @media print)
    const printBar = `<div id="print-bar" style="position:fixed;top:0;left:0;right:0;background:#059669;color:white;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:9999;font-family:-apple-system,sans-serif;font-size:14px">
      <span style="font-weight:600">OpenBenefacts Report</span>
      <div style="display:flex;align-items:center;gap:10px">
        <button onclick="document.getElementById('print-bar').style.display='none';window.print();setTimeout(()=>document.getElementById('print-bar').style.display='flex',500)" style="background:white;color:#059669;border:none;padding:8px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px">Save as PDF</button>
        <button onclick="window.close()" title="Close report" style="background:rgba(255,255,255,0.15);color:white;border:none;width:34px;height:34px;border-radius:6px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">&times;</button>
      </div>
    </div><div style="height:50px"></div>`;
    const styledHtml = html.replace('<body>', '<body>' + printBar).replace('</style>', '@media print{#print-bar{display:none!important}body{padding-top:0!important}}</style>');
    const blob = new Blob([styledHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      // Fallback: create a download link if popup was blocked
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
    // Clean up blob URL — if the window opened, let the window handle its own lifecycle;
    // only revoke after a long delay so the user has time to read/print the report
    setTimeout(() => URL.revokeObjectURL(url), 600000); // 10 minutes
  };

  useEffect(() => {
    setLoading(true);
    fetchOrganisation(orgId).then(d => {
      normaliseOrg(d);
      setOrg(d);
      setLoading(false);
      if (d?.sector) fetchSectorBenchmark(d.sector).then(setBenchmark).catch(() => {});
    }).catch(() => setLoading(false));
  }, [orgId]);

  const handleExpandDirector = async (directorId) => {
    if (expandedDirector === directorId) { setExpandedDirector(null); return; }
    setExpandedDirector(directorId);
    if (!directorBoards[directorId]) {
      try {
        const boards = await fetchDirectorBoards(directorId);
        setDirectorBoards(prev => ({ ...prev, [directorId]: boards.filter(b => b.org_id !== orgId) }));
      } catch (e) { console.error(e); }
    }
  };

  if (loading) return <Spinner />;
  if (!org) return <ErrorState message="Organisation not found" />;

  // Embed mode: compact org snapshot for embedding in articles
  if (embed) {
    const latest = org.financials?.[0];
    const risk = computeRiskScore(org);
    const orgUrl = `${window.location.origin}/org/${org.id}`;
    return (
      <div className="p-5 bg-white min-h-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-wordmark text-[18px] text-[#1B3A4B]">OpenBenefacts</span>
          <span className="text-xs text-gray-400">· Nonprofit Transparency</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{cleanName(org.name)}</h2>
        <p className="text-xs text-gray-500 mb-3">{[clean(org.county), clean(org.sector)].filter(Boolean).join(" · ")}{clean(org.charity_number) ? ` · RCN ${org.charity_number}` : ""}</p>
        {risk && (
          <div className={`px-3 py-2 rounded-lg mb-3 text-sm font-medium ${risk.color === "emerald" ? "bg-emerald-50 text-emerald-700" : risk.color === "amber" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
            Risk Score: {risk.score}/100 — {risk.level} risk <span className="text-xs font-normal opacity-70">({risk.yearsAnalysed}yr data, {risk.confidence} confidence)</span>
          </div>
        )}
        {latest && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {latest.gross_income != null && <div className="bg-gray-50 rounded-lg p-2"><div className="text-[10px] text-gray-400 uppercase">Income</div><div className="text-sm font-bold text-gray-900">{fmt(latest.gross_income)}</div></div>}
            {latest.gross_expenditure != null && <div className="bg-gray-50 rounded-lg p-2"><div className="text-[10px] text-gray-400 uppercase">Expenditure</div><div className="text-sm font-bold text-gray-900">{fmt(latest.gross_expenditure)}</div></div>}
            {latest.total_assets > 0 && <div className="bg-gray-50 rounded-lg p-2"><div className="text-[10px] text-gray-400 uppercase">Assets</div><div className="text-sm font-bold text-gray-900">{fmt(latest.total_assets)}</div></div>}
            {latest.employees > 0 && <div className="bg-gray-50 rounded-lg p-2"><div className="text-[10px] text-gray-400 uppercase">Employees</div><div className="text-sm font-bold text-gray-900">{latest.employees.toLocaleString()}</div></div>}
          </div>
        )}
        <p className="text-[10px] text-gray-400 text-center">Data: Charities Regulator, CRO, Revenue · <a href={orgUrl} target="_blank" rel="noopener" className="text-emerald-600 hover:underline">View full profile on OpenBenefacts</a></p>
      </div>
    );
  }

  const fields = [
    { label: "Sector", value: clean(org.sector), sub: clean(org.subsector) },
    { label: "County", value: clean(org.county) },
    { label: "Type", value: clean(org.governing_form) },
    { label: "Charity Number", value: clean(org.charity_number) },
    { label: "CRO Number", value: clean(org.cro_number) },
    { label: "Revenue CHY", value: clean(org.revenue_chy) },
    { label: "Also Known As", value: clean(org.also_known_as) ? cleanName(org.also_known_as) : null },
    { label: "Address", value: clean(org.address) },
    { label: "Eircode", value: clean(org.eircode) },
    { label: "Date Incorporated", value: org.date_incorporated },
  ].filter(f => f.value);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => setPage("orgs")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ArrowLeft className="w-4 h-4" /> Back to directory</button>

      <div className="bg-white rounded-2xl border border-[#1B3A4B]/10 overflow-hidden">
        <div className="bg-[#1B3A4B] px-6 py-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#4A9B8E]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <h1 className="font-wordmark text-3xl sm:text-4xl text-white leading-[1.05]">{cleanName(org.name)}</h1>
              <p className="text-[#4A9B8E] mt-2 font-semibold">{[clean(org.county), clean(org.sector)].filter(Boolean).join(" · ")}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {clean(org.charity_number) && <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-full font-medium">RCN {org.charity_number}</span>}
                {clean(org.cro_number) && <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-full font-medium">CRO {org.cro_number}</span>}
                {clean(org.governing_form) && <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-full font-medium">{org.governing_form}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPro && (
                <button ref={pdfBtnRef} onClick={() => {
                  if ((tier === "professional" || tier === "enterprise") && !brandName) { pendingReportRef.current = "pdf"; setShowBranding("pdf"); return; }
                  const risk = computeRiskScore(org);
                  const latest = org.financials?.[0];
                  const pdfHtml = `<!DOCTYPE html><html><head><title>${org.name} — OpenBenefacts Profile</title><style>
                    body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#111}
                    h1{font-size:24px;margin-bottom:4px} .sub{color:#666;font-size:14px;margin-bottom:20px}
                    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
                    .card{background:#f9fafb;padding:12px;border-radius:8px} .card .label{font-size:11px;color:#999;text-transform:uppercase}
                    .card .val{font-size:18px;font-weight:700;margin-top:2px} h2{font-size:16px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-top:32px;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px}
                    table{width:100%;border-collapse:collapse;font-size:13px} td,th{text-align:left;padding:8px;border-bottom:1px solid #f0f0f0}
                    .footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999}
                    .badge{display:inline-block;background:#ecfdf5;color:#059669;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
                    @media print{body{padding:20px}}
                  </style></head><body>
                    <h1>${org.name}</h1>
                    <div class="sub">${[clean(org.county),clean(org.sector),clean(org.charity_number) ? "RCN "+org.charity_number : ""].filter(Boolean).join(" · ")}</div>
                    ${risk ? `<div style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"};padding:12px;border-radius:8px;margin-bottom:20px"><strong>AI Risk Score: ${risk.score}/100</strong> — <span class="badge" style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"}">${risk.level} risk</span> <span style="font-size:11px;color:#666;margin-left:8px">${risk.yearsAnalysed} year${risk.yearsAnalysed!==1?"s":""} analysed · ${risk.confidence} confidence</span></div>` : ""}
                    ${latest ? `<h2>Latest Financials (${latest.year || "Most Recent"})</h2><div class="grid">
                      ${latest.gross_income!=null ? `<div class="card"><div class="label">Gross Income</div><div class="val">${fmt(latest.gross_income)}</div></div>` : ""}
                      ${latest.gross_expenditure!=null ? `<div class="card"><div class="label">Gross Expenditure</div><div class="val">${fmt(latest.gross_expenditure)}</div></div>` : ""}
                      ${latest.total_assets!=null ? `<div class="card"><div class="label">Total Assets</div><div class="val">${fmt(latest.total_assets)}</div></div>` : ""}
                      ${latest.employees>0 ? `<div class="card"><div class="label">Employees</div><div class="val">${latest.employees.toLocaleString()}</div></div>` : ""}
                    </div>` : ""}
                    ${org.grants?.length > 0 ? `<h2>State Funding</h2><table><tr><th>Funder</th><th>Programme</th><th>Year</th><th style="text-align:right">Amount</th></tr>${org.grants.slice(0,20).map(g => `<tr><td>${g.funders?.name||g.funder_name||"Government"}</td><td>${g.programme||"—"}</td><td>${g.year||"—"}</td><td style="text-align:right">${g.amount>0?fmt(g.amount):"—"}</td></tr>`).join("")}</table>` : ""}
                    ${org.boardMembers?.length > 0 ? `<h2>Board Members</h2><table><tr><th>Name</th><th>Role</th><th>Since</th></tr>${org.boardMembers.map(bm => `<tr><td>${bm.directors?.name||"—"}</td><td>${bm.role||"Trustee"}</td><td>${bm.start_date?.slice(0,4)||"—"}</td></tr>`).join("")}</table>` : ""}
                    <h2>Organisation Details</h2><table>${fields.map(f => `<tr><td style="color:#999;width:160px">${f.label}</td><td>${f.value}${f.sub?" — "+f.sub:""}</td></tr>`).join("")}</table>
                    ${(clean(org.charity_number) || clean(org.cro_number)) ? `<h2>Source Documents</h2><table>
                      ${clean(org.charity_number) ? `<tr><td style="color:#999;width:160px">Charities Regulator</td><td><a href="https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities/charity-detail?regid=${org.charity_number}" style="color:#059669">Annual reports &amp; filings — RCN ${org.charity_number}</a></td></tr>` : ""}
                      ${clean(org.cro_number) ? `<tr><td style="color:#999;width:160px">CRO (CORE)</td><td><a href="https://core.cro.ie/search?q=${org.cro_number}&type=companies" style="color:#059669">Constitution &amp; annual returns — ${org.cro_number}</a></td></tr>` : ""}
                      ${clean(org.revenue_chy) ? `<tr><td style="color:#999;width:160px">Revenue Commissioners</td><td><a href="https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/resident-charities.aspx" style="color:#059669">Tax-exempt charity register — CHY ${org.revenue_chy}</a></td></tr>` : ""}
                    </table>` : ""}
                    <div class="footer">${brandName ? `<p style="font-size:13px;font-weight:600;color:#333;margin-bottom:4px">Prepared by ${brandName}</p>` : ""}Generated by OpenBenefacts · openbenefacts.vercel.app · ${new Date().toLocaleDateString()}</div>
                  </body></html>`;
                  openReportWindow(pdfHtml);
                }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/20 text-white hover:bg-white/30 transition-colors">
                  <FileText className="w-4 h-4" /> PDF
                </button>
              )}
              {(tier === "professional" || tier === "enterprise") && (
                <button ref={ddBtnRef} onClick={() => {
                  if (!brandName) { pendingReportRef.current = "dd"; setShowBranding("dd"); return; }
                  const risk = computeRiskScore(org);
                  const latest = org.financials?.[0];
                  const grantTotal = org.grants ? org.grants.reduce((s, g) => s + (g.amount || 0), 0) : 0;
                  const statePct = latest?.gross_income > 0 ? Math.round((grantTotal / latest.gross_income) * 100) : 0;
                  // Pre-compute YoY table HTML to avoid nested template literals
                  let yoyHtml = "";
                  if (org.financials?.length > 1) {
                    const rows = org.financials.map(function(f, idx) {
                      const prev = org.financials[idx + 1];
                      const incChg = prev?.gross_income > 0 && f.gross_income != null ? ((f.gross_income - prev.gross_income) / prev.gross_income * 100).toFixed(1) : null;
                      const style = idx === 0 ? ' style="font-weight:600;background:#f0fdf4"' : '';
                      const chgColor = incChg > 0 ? '#059669' : incChg < 0 ? '#dc2626' : '#666';
                      const chgText = incChg !== null ? (incChg > 0 ? '+' : '') + incChg + '%' : '—';
                      return '<tr' + style + '><td>' + (f.year||"—") + '</td><td style="text-align:right">' + fmt(f.gross_income) + '</td><td style="text-align:right">' + fmt(f.gross_expenditure) + '</td><td style="text-align:right">' + (f.total_assets > 0 ? fmt(f.total_assets) : "—") + '</td><td style="text-align:right;color:' + chgColor + '">' + chgText + '</td></tr>';
                    });
                    yoyHtml = '<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px">Year-over-Year Financial History</h3><table><tr><th>Year</th><th style="text-align:right">Income</th><th style="text-align:right">Expenditure</th><th style="text-align:right">Assets</th><th style="text-align:right">Income \u0394</th></tr>' + rows.join("") + '</table>';
                  }
                  // Compute 5-year summary for DD report
                  const fiveYearFinancials = (org.financials || []).slice(0, 5);
                  const fiveYearFirst = fiveYearFinancials[fiveYearFinancials.length - 1];
                  const fiveYearLast = fiveYearFinancials[0];
                  const fiveYrCagr = fiveYearFirst?.gross_income > 0 && fiveYearLast?.gross_income > 0 && fiveYearFinancials.length >= 3 ? ((Math.pow(fiveYearLast.gross_income / fiveYearFirst.gross_income, 1 / (fiveYearFinancials.length - 1)) - 1) * 100).toFixed(1) : null;
                  const surplusCount = fiveYearFinancials.filter(f => f.gross_income > 0 && f.gross_expenditure > 0 && f.gross_income >= f.gross_expenditure).length;
                  const deficitCount = fiveYearFinancials.filter(f => f.gross_income > 0 && f.gross_expenditure > 0 && f.gross_expenditure > f.gross_income).length;

                  // Governance risk flags
                  const govFlags = [];
                  const boardCount = org.boardMembers?.length || 0;
                  if (boardCount < 5 && boardCount > 0) govFlags.push({ flag: "Below recommended minimum of 5 board members (" + boardCount + " on record)", severity: "warn" });
                  if (boardCount === 0) govFlags.push({ flag: "No board member data available", severity: "fail" });
                  if (boardCount >= 5) govFlags.push({ flag: boardCount + " board members — meets Charities Governance Code minimum", severity: "pass" });
                  // Tenure check
                  const tenures = (org.boardMembers || []).filter(bm => bm.start_date).map(bm => new Date().getFullYear() - parseInt(bm.start_date.slice(0, 4)));
                  if (tenures.length > 0) {
                    const longServing = tenures.filter(t => t > 9).length;
                    if (longServing > tenures.length / 2) govFlags.push({ flag: longServing + " of " + tenures.length + " directors serving 10+ years — potential board renewal concern", severity: "warn" });
                    else govFlags.push({ flag: "Board tenure diversity: average " + (tenures.reduce((a,b) => a+b, 0) / tenures.length).toFixed(1) + " years", severity: "pass" });
                  }
                  // Cross-directorship count (from already-fetched data)
                  const crossDirCount = Object.values(directorBoards).reduce((s, boards) => s + boards.length, 0);
                  if (crossDirCount > 0) govFlags.push({ flag: crossDirCount + " cross-directorship(s) identified across board members", severity: boardCount > 0 && crossDirCount > boardCount * 2 ? "warn" : "pass" });

                  // Sector benchmarking HTML
                  let benchHtml = "";
                  if (benchmark && latest?.gross_income > 0) {
                    const incomeRatio = benchmark.medianIncome > 0 ? (latest.gross_income / benchmark.medianIncome) : 0;
                    const incomePctile = incomeRatio > 3 ? "Top 5%" : incomeRatio > 1.5 ? "Top 25%" : incomeRatio > 0.8 ? "Middle 50%" : "Bottom 25%";
                    const spendRatio = latest.gross_income > 0 ? ((latest.gross_expenditure / latest.gross_income) * 100).toFixed(0) : "—";
                    const sectorSpendRatio = benchmark.avgIncome > 0 ? ((benchmark.avgExpenditure / benchmark.avgIncome) * 100).toFixed(0) : "—";
                    benchHtml = '<div class="grid3"><div class="card" style="text-align:center"><div class="label">Income vs Sector Median</div><div class="val" style="color:' + (incomeRatio >= 1 ? "#059669" : "#d97706") + '">' + (incomeRatio >= 10 ? "10x+" : incomeRatio.toFixed(1) + "x") + '</div><div style="font-size:10px;color:#999">' + incomePctile + '</div><div style="font-size:10px;color:#bbb">Median: ' + fmt(benchmark.medianIncome) + '</div></div>' +
                      '<div class="card" style="text-align:center"><div class="label">Spending Efficiency</div><div class="val">' + spendRatio + '%</div><div style="font-size:10px;color:#999">of income spent</div><div style="font-size:10px;color:#bbb">Sector avg: ' + sectorSpendRatio + '%</div></div>' +
                      '<div class="card" style="text-align:center"><div class="label">Sector Rank</div><div class="val">' + incomePctile + '</div><div style="font-size:10px;color:#999">by income</div><div style="font-size:10px;color:#bbb">' + benchmark.orgCount.toLocaleString() + ' orgs in sector</div></div></div>';
                  }

                  const ddHtml = `<!DOCTYPE html><html><head><title>Due Diligence Report — ${org.name}</title><style>
                    body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#111;font-size:13px}
                    .cover{text-align:center;padding:80px 0;border-bottom:3px solid #059669;margin-bottom:40px}
                    .cover h1{font-size:28px;margin-bottom:8px} .cover .sub{font-size:16px;color:#666}
                    .cover .badge{display:inline-block;background:#ecfdf5;color:#059669;padding:4px 12px;border-radius:6px;font-size:14px;font-weight:600;margin-top:16px}
                    h2{font-size:16px;color:#059669;text-transform:uppercase;letter-spacing:1px;margin-top:36px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #ecfdf5}
                    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
                    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
                    .card{background:#f9fafb;padding:12px;border-radius:8px} .card .label{font-size:11px;color:#999;text-transform:uppercase}
                    .card .val{font-size:18px;font-weight:700;margin-top:2px}
                    table{width:100%;border-collapse:collapse} td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px}
                    .risk-box{padding:16px;border-radius:8px;margin-bottom:20px}
                    .factor{display:flex;align-items:center;gap:6px;font-size:12px;margin:4px 0}
                    .dot{width:6px;height:6px;border-radius:50%;display:inline-block}
                    .flag{display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0}
                    .footer{margin-top:40px;padding-top:16px;border-top:2px solid #059669;font-size:10px;color:#999;text-align:center}
                    .section{page-break-inside:avoid} .confidential{color:#dc2626;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
                    .summary-bar{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}
                    .summary-pill{font-size:11px;padding:4px 10px;border-radius:12px;font-weight:600}
                    @media print{body{padding:20px}.cover{padding:40px 0}}
                  </style></head><body>
                    <div class="cover">
                      ${brandName ? `<div style="font-size:14px;font-weight:700;color:#059669;letter-spacing:1px;text-transform:uppercase;margin-bottom:24px">${brandName}</div>` : ""}
                      <div class="confidential">Confidential — Due Diligence Report</div>
                      <h1>${cleanName(org.name)}</h1>
                      <div class="sub">${[clean(org.county), clean(org.sector)].filter(Boolean).join(" · ")}</div>
                      ${clean(org.charity_number) ? `<div class="sub" style="margin-top:8px">RCN ${org.charity_number}${clean(org.cro_number) ? ` · CRO ${org.cro_number}` : ""}</div>` : ""}
                      <div class="badge">Generated ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}</div>
                    </div>

                    <h2>1. Executive Summary</h2>
                    <div class="section">
                      <p>${org.name} is a${/^[aeiou]/i.test(org.sector || "") ? "n" : ""} ${(org.sector || "nonprofit").toLowerCase()} organisation based in ${clean(org.county) || "Ireland"}. ${latest ? `In its most recent filing (${latest.year || "latest"}), it reported gross income of ${fmt(latest.gross_income)} and expenditure of ${fmt(latest.gross_expenditure)}.` : "No financial data is currently on file."} ${org.grants?.length > 0 ? `The organisation has ${org.grants.length} government funding records totalling ${fmt(grantTotal)} (${statePct}% of income).` : ""}</p>
                      ${fiveYearFinancials.length >= 2 ? `<div class="summary-bar">
                        <span class="summary-pill" style="background:#ecfdf5;color:#059669">${fiveYearFinancials.length}-year data</span>
                        ${fiveYrCagr ? `<span class="summary-pill" style="background:${parseFloat(fiveYrCagr) >= 0 ? "#ecfdf5;color:#059669" : "#fef2f2;color:#dc2626"}">${parseFloat(fiveYrCagr) >= 0 ? "+" : ""}${fiveYrCagr}% CAGR</span>` : ""}
                        <span class="summary-pill" style="background:${deficitCount === 0 ? "#ecfdf5;color:#059669" : "#fffbeb;color:#d97706"}">Surplus ${surplusCount}/${surplusCount + deficitCount} years</span>
                        ${risk ? `<span class="summary-pill" style="background:${risk.color==="emerald"?"#ecfdf5;color:#059669":risk.color==="amber"?"#fffbeb;color:#d97706":"#fef2f2;color:#dc2626"}">${risk.level} risk (${risk.score}/100)</span>` : ""}
                      </div>` : ""}
                    </div>

                    ${risk ? `<h2>2. Risk Assessment</h2>
                    <div class="section">
                      <div class="risk-box" style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"}">
                        <strong style="font-size:16px">Overall Risk Score: ${risk.score}/100 — ${risk.level.charAt(0).toUpperCase()+risk.level.slice(1)} Risk</strong>
                        <div style="font-size:12px;color:#666;margin-top:4px">${risk.yearsAnalysed} year${risk.yearsAnalysed!==1?"s":""} of data analysed · ${risk.confidence} confidence score</div>
                        <div style="margin-top:12px">${risk.factors.map(f => `<div class="factor"><span class="dot" style="background:${f.impact==="positive"?"#059669":f.impact==="negative"?"#dc2626":"#9ca3af"}"></span> ${f.label}</div>`).join("")}</div>
                      </div>
                    </div>` : ""}

                    ${latest ? `<h2>3. Five-Year Financial Summary</h2>
                    <div class="section">
                      <div class="grid">
                        ${latest.gross_income!=null ? `<div class="card"><div class="label">Gross Income (${latest.year || "Latest"})</div><div class="val">${fmt(latest.gross_income)}</div></div>` : ""}
                        ${latest.gross_expenditure!=null ? `<div class="card"><div class="label">Gross Expenditure</div><div class="val">${fmt(latest.gross_expenditure)}</div></div>` : ""}
                        ${latest.total_assets > 0 ? `<div class="card"><div class="label">Total Assets</div><div class="val">${fmt(latest.total_assets)}</div></div>` : ""}
                        ${latest.employees>0 ? `<div class="card"><div class="label">Employees</div><div class="val">${latest.employees}</div></div>` : ""}
                      </div>
                      <div class="grid3">
                        <div class="card"><div class="label">State Funding</div><div class="val">${statePct}%</div></div>
                        <div class="card"><div class="label">Spending Ratio</div><div class="val">${latest.gross_income>0?((latest.gross_expenditure/latest.gross_income)*100).toFixed(0):"—"}%</div></div>
                        <div class="card"><div class="label">Filing Years</div><div class="val">${org.financials?.length || 0}</div></div>
                      </div>
                      ${yoyHtml}
                    </div>` : ""}

                    ${benchHtml ? `<h2>${latest ? "4" : "3"}. Sector Benchmarking</h2>
                    <div class="section">
                      <p style="font-size:12px;color:#666;margin-bottom:12px">Compared to ${benchmark.orgCount.toLocaleString()} organisations in the ${benchmark.sectorName} sector.</p>
                      ${benchHtml}
                    </div>` : ""}

                    ${org.grants?.length > 0 ? `<h2>${(latest ? 4 : 3) + (benchHtml ? 1 : 0) + 1}. Government Funding History</h2>
                    <div class="section">
                      <table><tr><th>Funder</th><th>Programme</th><th>Year</th><th style="text-align:right">Amount</th></tr>${org.grants.map(g=>`<tr><td>${g.funders?.name||g.funder_name||"Government"}</td><td>${g.programme||"—"}</td><td>${g.year||"—"}</td><td style="text-align:right">${g.amount>0?fmt(g.amount):"—"}</td></tr>`).join("")}</table>
                    </div>` : ""}

                    ${(() => {
                      // Dynamic section numbering
                      let secNum = latest ? 4 : 3;
                      if (benchHtml) secNum++;
                      if (org.grants?.length > 0) secNum++;
                      const govSecNum = secNum; secNum++;
                      const grSecNum = secNum; secNum++;
                      const detSecNum = secNum; secNum++;
                      const srcSecNum = secNum;

                      // Governance section with risk flags
                      let govHtml = "";
                      if (org.boardMembers?.length > 0 || govFlags.length > 0) {
                        const flagsHtml = govFlags.map(gf => {
                          const icon = gf.severity === "pass" ? "&#10003;" : gf.severity === "warn" ? "&#9888;" : "&#10007;";
                          const color = gf.severity === "pass" ? "#059669" : gf.severity === "warn" ? "#d97706" : "#dc2626";
                          return '<div class="flag"><span style="color:' + color + ';font-size:14px;width:16px;text-align:center">' + icon + '</span> ' + gf.flag + '</div>';
                        }).join("");

                        const boardTable = org.boardMembers?.length > 0 ?
                          '<table><tr><th>Name</th><th>Role</th><th>Since</th><th>Tenure</th></tr>' +
                          org.boardMembers.map(function(bm) {
                            const since = bm.start_date?.slice(0, 4) || "—";
                            const tenure = bm.start_date ? (new Date().getFullYear() - parseInt(bm.start_date.slice(0, 4))) + " yrs" : "—";
                            return '<tr><td>' + (bm.directors?.name || "—") + '</td><td>' + (bm.role || "Trustee") + '</td><td>' + since + '</td><td>' + tenure + '</td></tr>';
                          }).join("") + '</table>' : "";

                        govHtml = '<h2>' + govSecNum + '. Governance & Risk Flags</h2><div class="section">' +
                          '<p>' + (org.boardMembers?.length || 0) + ' board member(s) on record.</p>' +
                          '<div style="background:#f9fafb;padding:12px;border-radius:8px;margin:12px 0">' + flagsHtml + '</div>' +
                          boardTable + '</div>';
                      }

                      // Grant Readiness Assessment
                      const checks = [];
                      const pass = (label) => checks.push({ label, status: "pass" });
                      const warn = (label) => checks.push({ label, status: "warn" });
                      const fail = (label) => checks.push({ label, status: "fail" });

                      const filingYears = org.financials?.length || 0;
                      if (filingYears >= 3) pass("Filing history: " + filingYears + " years of annual returns on record");
                      else if (filingYears >= 1) warn("Filing history: Only " + filingYears + " year(s) of returns — limited track record");
                      else fail("Filing history: No annual returns on file");

                      const boardSize = org.boardMembers?.length || 0;
                      if (boardSize >= 5) pass("Board governance: " + boardSize + " board members — meets Charities Governance Code minimum");
                      else if (boardSize >= 3) warn("Board governance: " + boardSize + " board members — below recommended minimum of 5");
                      else if (boardSize > 0) fail("Board governance: Only " + boardSize + " board member(s) — governance risk");
                      else warn("Board governance: No board data available");

                      if (latest && latest.gross_income > 0 && latest.gross_expenditure > 0) {
                        const ratio = latest.gross_expenditure / latest.gross_income;
                        if (ratio <= 1.0 && ratio >= 0.6) pass("Spending ratio: " + (ratio * 100).toFixed(0) + "% — balanced budget");
                        else if (ratio > 1.0 && ratio <= 1.15) warn("Spending ratio: " + (ratio * 100).toFixed(0) + "% — slight deficit");
                        else if (ratio > 1.15) fail("Spending ratio: " + (ratio * 100).toFixed(0) + "% — significant deficit");
                        else warn("Spending ratio: " + (ratio * 100).toFixed(0) + "% — unusually low");
                      } else { warn("Spending ratio: Insufficient data"); }

                      if (latest && latest.total_assets > 0 && latest.gross_expenditure > 0) {
                        const coverage = latest.total_assets / latest.gross_expenditure;
                        if (coverage >= 0.25) pass("Reserves: " + coverage.toFixed(1) + "x annual expenditure — adequate reserve coverage");
                        else warn("Reserves: " + coverage.toFixed(1) + "x annual expenditure — low reserve coverage");
                      } else { warn("Reserves: No asset data available"); }

                      if (statePct <= 50) pass("Income diversification: " + statePct + "% state-funded — diversified income base");
                      else if (statePct <= 80) warn("Income diversification: " + statePct + "% state-funded — moderate dependency");
                      else if (statePct > 80) fail("Income diversification: " + statePct + "% state-funded — high dependency risk");

                      if (org.financials?.length >= 3) {
                        const incomes = org.financials.map(f => f.gross_income).filter(v => v > 0);
                        if (incomes.length >= 3) {
                          const changes = incomes.slice(0, -1).map((v, i) => (v - incomes[i + 1]) / incomes[i + 1]);
                          const declines = changes.filter(c => c < -0.1).length;
                          if (declines === 0) pass("Income stability: No significant income declines in " + incomes.length + " years");
                          else if (declines === 1) warn("Income stability: 1 significant decline (&gt;10%) in " + incomes.length + " years");
                          else fail("Income stability: " + declines + " significant declines in " + incomes.length + " years");
                        }
                      }

                      if (clean(org.charity_number)) pass("Registered charity: RCN " + org.charity_number);
                      else fail("Not on the Register of Charities");

                      const passed = checks.filter(c => c.status === "pass").length;
                      const warned = checks.filter(c => c.status === "warn").length;
                      const failed = checks.filter(c => c.status === "fail").length;
                      const readiness = failed === 0 && warned <= 1 ? "Ready" : failed === 0 ? "Conditional" : "Review Required";
                      const readinessColor = readiness === "Ready" ? "#059669" : readiness === "Conditional" ? "#d97706" : "#dc2626";
                      const readinessBg = readiness === "Ready" ? "#ecfdf5" : readiness === "Conditional" ? "#fffbeb" : "#fef2f2";

                      const checksHtml = checks.map(c => {
                        const icon = c.status === "pass" ? "&#10003;" : c.status === "warn" ? "&#9888;" : "&#10007;";
                        const color = c.status === "pass" ? "#059669" : c.status === "warn" ? "#d97706" : "#dc2626";
                        return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0"><span style="color:' + color + ';font-size:14px;width:16px;text-align:center">' + icon + '</span> ' + c.label + '</div>';
                      }).join("");

                      return govHtml +
                        '<h2>' + grSecNum + '. Grant Readiness Assessment</h2>' +
                        '<div class="section">' +
                        '<div style="background:' + readinessBg + ';padding:14px;border-radius:8px;margin-bottom:12px">' +
                        '<strong style="color:' + readinessColor + ';font-size:15px">' + readiness + '</strong>' +
                        '<span style="font-size:12px;color:#666;margin-left:8px">' + passed + ' passed · ' + warned + ' warnings · ' + failed + ' flags</span></div>' +
                        checksHtml +
                        '<p style="font-size:11px;color:#999;margin-top:12px;font-style:italic">This assessment is automated and based on publicly available regulatory data. It does not replace professional judgement.</p>' +
                        '</div>' +
                        '<h2>' + detSecNum + '. Organisation Details</h2>' +
                        '<div class="section"><table>' + fields.map(f => '<tr><td style="color:#999;width:160px">' + f.label + '</td><td>' + f.value + (f.sub ? " — " + f.sub : "") + '</td></tr>').join("") + '</table></div>' +
                        ((clean(org.charity_number) || clean(org.cro_number)) ?
                          '<h2>' + srcSecNum + '. Source Documents</h2>' +
                          '<div class="section"><p>The following primary regulatory sources can be used to verify the data in this report:</p><table>' +
                          (clean(org.charity_number) ? '<tr><td style="color:#999;width:180px">Charities Regulator</td><td><a href="https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities/charity-detail?regid=' + org.charity_number + '" style="color:#059669">Annual reports, governance code &amp; financial filings — RCN ' + org.charity_number + '</a></td></tr>' : "") +
                          (clean(org.cro_number) ? '<tr><td style="color:#999;width:180px">Companies Registration Office</td><td><a href="https://core.cro.ie/search?q=' + org.cro_number + '&type=companies" style="color:#059669">Constitution, annual returns &amp; directors — CRO ' + org.cro_number + '</a></td></tr>' : "") +
                          (clean(org.revenue_chy) ? '<tr><td style="color:#999;width:180px">Revenue Commissioners</td><td><a href="https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/resident-charities.aspx" style="color:#059669">Tax-exempt charity status register — CHY ' + org.revenue_chy + '</a></td></tr>' : "") +
                          '<tr><td style="color:#999;width:180px">Open Data Portal</td><td><a href="https://data.gov.ie/dataset/register-of-charities-in-ireland" style="color:#059669">Bulk data download — data.gov.ie</a></td></tr></table></div>'
                        : "");
                    })()}

                    <div class="footer">
                      ${brandName ? `<p style="font-size:13px;font-weight:600;color:#333;margin-bottom:4px">Prepared by ${brandName}</p>` : ""}
                      <p><strong>OpenBenefacts Due Diligence Report</strong></p>
                      <p>Generated on ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })} · openbenefacts.vercel.app</p>
                      <p style="margin-top:8px">This report is generated from publicly available data and does not constitute financial or legal advice. Users should verify all information independently.</p>
                    </div>
                  </body></html>`;
                  openReportWindow(ddHtml);
                }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white text-emerald-700 hover:bg-emerald-50 transition-colors">
                  <Shield className="w-4 h-4" /> Due Diligence
                </button>
              )}
              <button onClick={() => watchlist.toggle(org.id, org.name)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${watchlist.isWatched(org.id) ? "bg-white text-emerald-700" : "bg-white/20 text-white hover:bg-white/30"}`}>
                <Bookmark className={`w-4 h-4 ${watchlist.isWatched(org.id) ? "fill-emerald-600" : ""}`} />
                {watchlist.isWatched(org.id) ? "Watching" : "Watch"}
              </button>
            </div>
          </div>
        </div>

        {/* Share / Cite / Embed bar */}
        {(() => {
          const orgUrl = `${window.location.origin}/org/${org.id}`;
          const orgEmbed = `<iframe src="${orgUrl}?embed=true" width="100%" height="420" frameborder="0" style="border:1px solid #e5e7eb;border-radius:12px"></iframe>`;
          const citation = `"${cleanName(org.name)}," OpenBenefacts, accessed ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}, ${orgUrl}`;
          return (
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
              <button onClick={() => { navigator.clipboard.writeText(orgUrl); setCopied("link"); setTimeout(() => setCopied(null), 2000); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                {copied === "link" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                {copied === "link" ? "Copied!" : "Share link"}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(citation); setCopied("cite"); setTimeout(() => setCopied(null), 2000); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                {copied === "cite" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <FileText className="w-3.5 h-3.5" />}
                {copied === "cite" ? "Citation copied!" : "Cite this"}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(orgEmbed); setCopied("embed"); setTimeout(() => setCopied(null), 2000); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                {copied === "embed" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Code className="w-3.5 h-3.5" />}
                {copied === "embed" ? "Embed code copied!" : "Embed"}
              </button>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="border-b border-[#1B3A4B]/10">
          <div className="flex gap-0">
            {["overview","governance","financials","details"].map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-6 py-3.5 text-sm font-semibold capitalize border-b-2 transition-colors ${tab === t ? "border-[#1B3A4B] text-[#1B3A4B]" : "border-transparent text-[#1B3A4B]/50 hover:text-[#1B3A4B]"}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === "overview" && (
            <div>
              {/* At-a-glance summary — always shows something useful */}
              {(() => {
                const latest = org.financials?.[0];
                const grantTotal = org.grants ? org.grants.reduce((s, g) => s + (g.amount || 0), 0) : 0;
                const boardCount = org.boardMembers?.length || 0;
                const filingCount = org.financials?.length || 0;
                const entity = classifyEntity(org);
                const statements = [];
                // Prefer the classified entity label when we have one; fall back to sector
                if (entity.label && entity.type !== "unknown") {
                  const article = /^[aeiou]/i.test(entity.label) ? "an" : "a";
                  statements.push(`${article} ${entity.label.toLowerCase()}`);
                } else if (clean(org.sector)) {
                  statements.push(`a ${String(org.sector).toLowerCase()} organisation`);
                }
                if (clean(org.county)) statements.push(`based in ${org.county}`);
                if (clean(org.governing_form)) statements.push(`constituted as ${String(org.governing_form).toLowerCase()}`);
                if (clean(org.date_incorporated)) statements.push(`incorporated ${String(org.date_incorporated).slice(0, 4)}`);
                const summarySentence = statements.length ? `${cleanName(org.name)} is ${statements.join(", ")}.` : `${cleanName(org.name)} is listed in the Irish nonprofit sector.`;
                return (
                  <div className="bg-[#FFFFFF] border border-[#1B3A4B]/10 rounded-xl p-5 mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#1B3A4B]">At a glance</div>
                      {entity.type !== "unknown" && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#4A9B8E]/30 text-[#1B3A4B] px-2 py-1 rounded-full">{entity.label}</span>
                      )}
                    </div>
                    <p className={`text-[15px] text-[#1a1a2e] leading-relaxed ${entity.description ? "mb-2" : "mb-4"}`}>{summarySentence}</p>
                    {entity.description && <p className="text-[12px] text-[#1B3A4B]/65 leading-relaxed mb-4">{entity.description}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="font-wordmark text-2xl text-[#1B3A4B] leading-none">{filingCount}</div>
                        <div className="text-[11px] text-[#1B3A4B]/60 mt-1 font-medium uppercase tracking-wider">Filings on record</div>
                      </div>
                      <div>
                        <div className="font-wordmark text-2xl text-[#1B3A4B] leading-none">{boardCount}</div>
                        <div className="text-[11px] text-[#1B3A4B]/60 mt-1 font-medium uppercase tracking-wider">Board members</div>
                      </div>
                      <div>
                        <div className="font-wordmark text-2xl text-[#1B3A4B] leading-none">{latest?.gross_income > 0 ? fmt(latest.gross_income) : "—"}</div>
                        <div className="text-[11px] text-[#1B3A4B]/60 mt-1 font-medium uppercase tracking-wider">Latest income</div>
                      </div>
                      <div>
                        <div className="font-wordmark text-2xl text-[#1B3A4B] leading-none">{grantTotal > 0 ? fmt(grantTotal) : "—"}</div>
                        <div className="text-[11px] text-[#1B3A4B]/60 mt-1 font-medium uppercase tracking-wider">State funding tracked</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <h3 className="text-xs font-bold text-[#1B3A4B] uppercase tracking-[0.15em] mb-4">Organisation Info</h3>
              {fields.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {fields.slice(0, 6).map((f, i) => (
                    <div key={i} className="p-3 rounded-lg bg-[#FFFFFF] border border-[#1B3A4B]/5">
                      <div className="text-[10px] text-[#1B3A4B]/60 font-bold uppercase tracking-wider">{f.label}</div>
                      <div className="text-sm text-[#1a1a2e] mt-1 font-medium">{f.value}{f.sub ? ` — ${f.sub}` : ""}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#FFFFFF] border border-[#1B3A4B]/10 text-sm text-[#1B3A4B]/70">
                  We don't have structured identifiers for this organisation yet. Check the source links below or help us improve the listing.
                </div>
              )}

              {/* Official source links — tailored to entity type */}
              {(() => {
                const entity = classifyEntity(org);
                const sources = getEntitySources(org, entity);
                return (
                  <div className="mt-6 p-5 rounded-xl border border-[#1B3A4B]/10 bg-white">
                    <div className="flex items-center gap-2 mb-3">
                      <ExternalLink className="w-4 h-4 text-[#1B3A4B]" />
                      <h3 className="text-xs font-bold text-[#1B3A4B] uppercase tracking-[0.15em]">Verify with the source</h3>
                    </div>
                    <p className="text-xs text-[#1B3A4B]/60 mb-4">OpenBenefacts mirrors public regulator data. For the canonical record, go to the source.</p>
                    <div className="space-y-2">
                      {sources.map((src, i) => (
                        <a key={i} href={src.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg bg-[#FFFFFF] hover:bg-[#4A9B8E]/20 border border-[#1B3A4B]/10 hover:border-[#1B3A4B]/30 transition-colors group">
                          <div>
                            <div className="text-sm font-semibold text-[#1a1a2e]">{src.label}</div>
                            <div className="text-xs text-[#1B3A4B]/60">{src.note}</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-[#1B3A4B] group-hover:translate-x-1 transition-transform" />
                        </a>
                      ))}
                      <button onClick={() => setPage("claim")} className="w-full flex items-center justify-between p-3 rounded-lg bg-[#1B3A4B]/5 hover:bg-[#1B3A4B]/10 border border-dashed border-[#1B3A4B]/30 transition-colors group text-left">
                        <div>
                          <div className="text-sm font-semibold text-[#1B3A4B]">Something missing? Claim or correct this listing</div>
                          <div className="text-xs text-[#1B3A4B]/60">Verified orgs can add descriptions, contact details, and upload reports</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#1B3A4B] group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* AI Risk Score */}
              {(() => {
                const risk = computeRiskScore(org);
                if (!risk) return null;
                const colorMap = { emerald: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500", border: "border-emerald-200" }, amber: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", border: "border-amber-200" }, red: { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", border: "border-red-200" } };
                const c = colorMap[risk.color];
                return isPro ? (
                  <div className={`mt-6 p-4 rounded-xl border ${c.border} ${c.bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Risk Assessment</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${c.text}`}>{risk.score}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text} capitalize`}>{risk.level} risk</span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full mb-3">
                      <div className={`h-2 rounded-full ${c.bar} transition-all`} style={{ width: `${risk.score}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mb-3 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {risk.yearsAnalysed} year{risk.yearsAnalysed !== 1 ? "s" : ""} analysed</span>
                      <span className={`px-1.5 py-0.5 rounded ${risk.confidence === "high" ? "bg-emerald-100 text-emerald-700" : risk.confidence === "moderate" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
                        {risk.confidence} confidence
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {risk.factors.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${f.impact === "positive" ? "bg-emerald-500" : f.impact === "negative" ? "bg-red-500" : "bg-gray-400"}`} />
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 p-4 rounded-xl border border-gray-200 bg-gray-50 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-500 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Risk Assessment</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-300">{risk.score}</span>
                        <Lock className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Upgrade to Pro to see the full risk breakdown and contributing factors.</p>
                  </div>
                );
              })()}

              {/* Funding received — detailed breakdown with clickable funders */}
              {org.grants && org.grants.length > 0 && (
                <div className="mt-6" id="funding-detail-section">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Where the Money Comes From</h3>
                    <div className="text-sm font-bold text-emerald-600">{fmt(org.grants.reduce((s, g) => s + (g.amount || 0), 0))} total tracked</div>
                  </div>

                  {/* Funder summary cards — clickable to see all their grants */}
                  {(() => {
                    const funderMap = {};
                    org.grants.forEach(g => {
                      const fName = g.funders?.name || g.funder_name || "Government";
                      if (!funderMap[fName]) funderMap[fName] = { name: fName, total: 0, count: 0, years: new Set(), programmes: new Set() };
                      funderMap[fName].total += g.amount || 0;
                      funderMap[fName].count++;
                      if (g.year) funderMap[fName].years.add(g.year);
                      if (g.programme) funderMap[fName].programmes.add(g.programme);
                    });
                    const funderList = Object.values(funderMap).sort((a, b) => b.total - a.total);
                    const grantTotal = org.grants.reduce((s, g) => s + (g.amount || 0), 0);

                    return (
                      <div className="space-y-2 mb-4">
                        {funderList.map(f => {
                          const pctShare = grantTotal > 0 ? (f.total / grantTotal * 100) : 0;
                          const yearRange = f.years.size > 0 ? `${Math.min(...f.years)}–${Math.max(...f.years)}` : "";
                          return (
                            <button key={f.name} onClick={() => setPage(`funder:${f.name}`)}
                              className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-emerald-300 hover:shadow-md transition-all group">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{f.name}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-500 flex-shrink-0" />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                    <span>{f.count} grant{f.count !== 1 ? "s" : ""}</span>
                                    {yearRange && <span>{yearRange}</span>}
                                    {f.programmes.size > 0 && <span>{f.programmes.size} programme{f.programmes.size !== 1 ? "s" : ""}</span>}
                                  </div>
                                  {f.programmes.size > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {[...f.programmes].slice(0, 3).map(p => (
                                        <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 truncate max-w-[180px]">{p}</span>
                                      ))}
                                      {f.programmes.size > 3 && <span className="text-[10px] text-gray-400">+{f.programmes.size - 3} more</span>}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="text-sm font-bold text-emerald-600">{fmt(f.total)}</div>
                                  <div className="text-[10px] text-gray-400">{pctShare.toFixed(0)}% of total</div>
                                  <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, pctShare)}%` }} /></div>
                                </div>
                              </div>
                              <p className="text-[10px] text-emerald-600/70 mt-2 group-hover:text-emerald-700">Click to see all organisations this funder supports →</p>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Individual grant records table */}
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Individual Grant Records</h4>
                      <span className="text-[10px] text-gray-400">{org.grants.length} records</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                            <th className="px-4 py-2 font-semibold">Funder</th>
                            <th className="px-4 py-2 font-semibold">Programme</th>
                            <th className="px-4 py-2 font-semibold text-center">Year</th>
                            <th className="px-4 py-2 font-semibold text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {org.grants.slice(0, showAllFunding ? 999 : 10).map((g, i) => {
                            const fName = g.funders?.name || g.funder_name || "Government";
                            return (
                              <tr key={i} className="border-t border-gray-100 hover:bg-emerald-50/50 transition-colors cursor-pointer" onClick={() => setPage(`funder:${fName}`)}>
                                <td className="px-4 py-2.5">
                                  <span className="font-medium text-emerald-700 hover:underline">{fName.length > 40 ? fName.substring(0, 38) + "…" : fName}</span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-500 text-xs">{g.programme || "—"}</td>
                                <td className="px-4 py-2.5 text-center text-gray-500">{g.year || "—"}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{g.amount > 0 ? fmt(g.amount) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {org.grants.length > 10 && !showAllFunding && (
                      <button onClick={() => setShowAllFunding(true)} className="w-full text-center text-xs text-emerald-600 hover:text-emerald-800 font-medium py-3 border-t border-gray-200">
                        Show all {org.grants.length} funding records ↓
                      </button>
                    )}
                    {showAllFunding && org.grants.length > 10 && (
                      <button onClick={() => setShowAllFunding(false)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium py-3 border-t border-gray-200">
                        Show fewer ↑
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "governance" && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Board Members & Trustees</h3>
              {org.boardMembers && org.boardMembers.length > 0 ? (
                <div className="space-y-4">
                  {/* ===== REMUNERATION SUMMARY (if any paid members) ===== */}
                  {(() => {
                    const paidMembers = org.boardMembers.filter(bm => bm.is_paid);
                    const unpaidMembers = org.boardMembers.filter(bm => bm.is_paid === false);
                    const totalFees = org.boardMembers.reduce((s, bm) => s + (Number(bm.annual_fee) || 0), 0);
                    const hasFeeData = paidMembers.length > 0 || totalFees > 0;
                    if (!hasFeeData) return null;
                    return (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-5 mb-2">
                        <h4 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Board Remuneration</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-white/70 rounded-lg p-3 text-center"><div className="text-[10px] text-amber-700/60 font-medium uppercase">Total Board Fees</div><div className="text-lg font-bold text-amber-900">{fmt(totalFees)}</div><div className="text-[10px] text-amber-700/50">per annum</div></div>
                          <div className="bg-white/70 rounded-lg p-3 text-center"><div className="text-[10px] text-amber-700/60 font-medium uppercase">Paid Members</div><div className="text-lg font-bold text-amber-900">{paidMembers.length}</div><div className="text-[10px] text-amber-700/50">of {org.boardMembers.length} total</div></div>
                          <div className="bg-white/70 rounded-lg p-3 text-center"><div className="text-[10px] text-amber-700/60 font-medium uppercase">Unpaid / Voluntary</div><div className="text-lg font-bold text-emerald-700">{unpaidMembers.length}</div><div className="text-[10px] text-amber-700/50">{org.boardMembers.length > 0 ? Math.round(unpaidMembers.length / org.boardMembers.length * 100) : 0}% voluntary</div></div>
                          {paidMembers.length > 0 && <div className="bg-white/70 rounded-lg p-3 text-center"><div className="text-[10px] text-amber-700/60 font-medium uppercase">Avg Fee</div><div className="text-lg font-bold text-amber-900">{fmt(Math.round(totalFees / paidMembers.length))}</div><div className="text-[10px] text-amber-700/50">per paid member</div></div>}
                        </div>
                        <p className="text-[10px] text-amber-700/50 mt-3">Source: State Bodies Database / Annual Reports. Fees set by the Minister under the One Person One Salary (OPOS) policy.</p>
                      </div>
                    );
                  })()}

                  {/* ===== BOARD MEMBER LIST ===== */}
                  {(() => {
                    // Check if ANY member on this board has remuneration data
                    const orgHasFeeData = org.boardMembers.some(bm => bm.annual_fee > 0 || bm.is_paid === true || (bm.source && bm.source.startsWith('state_board_')));
                    // Sort: paid members first (by fee desc), then voluntary/unknown
                    const sorted = [...org.boardMembers].sort((a, b) => {
                      if (a.is_paid && !b.is_paid) return -1;
                      if (!a.is_paid && b.is_paid) return 1;
                      return (Number(b.annual_fee) || 0) - (Number(a.annual_fee) || 0);
                    });
                    return (<div className="space-y-2">
                  {sorted.map((bm, i) => {
                    const director = bm.directors;
                    if (!director) return null;
                    const isExpanded = expandedDirector === director.id;
                    const otherBoards = directorBoards[director.id] || [];
                    const hasFee = bm.annual_fee > 0;
                    const memberHasData = bm.source && bm.source.startsWith('state_board_') || hasFee || bm.is_paid === true;
                    return (
                      <div key={i} className="rounded-lg border border-gray-100 overflow-hidden">
                        <button onClick={() => handleExpandDirector(director.id)} className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${hasFee ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{director.name.charAt(0)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                                {director.name}
                                {orgHasFeeData && bm.is_paid === true && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">PAID</span>}
                                {orgHasFeeData && memberHasData && !bm.is_paid && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">VOLUNTARY</span>}
                              </div>
                              <div className="text-xs text-gray-400">{bm.role || "Trustee"}{bm.start_date ? ` · Since ${bm.start_date.slice(0, 4)}` : ""}{bm.remuneration_note ? ` · ${bm.remuneration_note}` : ""}</div>
                            </div>
                          </div>
                          {hasFee ? (
                            <div className="text-right flex-shrink-0 mr-2">
                              <div className="text-sm font-bold text-amber-700">{fmt(bm.annual_fee)}</div>
                              <div className="text-[9px] text-amber-600/60">per year</div>
                            </div>
                          ) : orgHasFeeData && memberHasData && !bm.is_paid ? (
                            <div className="text-right flex-shrink-0 mr-2">
                              <div className="text-sm font-bold text-emerald-600">€0</div>
                              <div className="text-[9px] text-emerald-600/60">no fee</div>
                            </div>
                          ) : null}
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-gray-50">
                            {otherBoards.length > 0 ? (
                              <div>
                                <p className="text-xs text-gray-500 font-medium mt-2 mb-2">Also serves on {otherBoards.length} other board{otherBoards.length > 1 ? "s" : ""}:</p>
                                <div className="space-y-1">
                                  {otherBoards.map((ob, j) => (
                                    <button key={j} onClick={() => setPage(`org:${ob.org_id}`)} className="w-full text-left flex items-center justify-between p-2 rounded bg-gray-50 hover:bg-emerald-50 transition-colors">
                                      <div>
                                        <div className="text-sm text-gray-900">{cleanName(ob.organisations?.name) || "Unknown"}</div>
                                        <div className="text-xs text-gray-400">{ob.role || "Trustee"}{ob.organisations?.sector ? ` · ${ob.organisations.sector}` : ""}</div>
                                      </div>
                                      <ChevronRight className="w-3 h-3 text-gray-300" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 mt-2">No other board positions found in the register.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>);
                  })()}
                  <p className="text-xs text-gray-400 mt-3">Source: Charities Regulator & State Bodies Database. Click a name to see cross-directorships.</p>

                  {/* Board Network Graph — visual cross-directorship map */}
                  {(() => {
                    // Build network: center node = this org, director nodes radiate out, connected org nodes on outer ring
                    const directors = org.boardMembers.filter(bm => bm.directors).map(bm => ({
                      id: bm.directors.id,
                      name: bm.directors.name,
                      role: bm.role || "Trustee",
                      otherBoards: directorBoards[bm.directors.id] || [],
                    }));
                    const hasConnections = directors.some(d => d.otherBoards.length > 0);
                    if (directors.length === 0) return null;

                    // SVG layout: center org, directors in inner ring, connected orgs in outer ring
                    const svgW = 700, svgH = 500;
                    const cx = svgW / 2, cy = svgH / 2;
                    const innerR = 130, outerR = 220;

                    // Director positions (inner ring)
                    const dirPositions = directors.map((d, i) => {
                      const angle = (2 * Math.PI * i / directors.length) - Math.PI / 2;
                      return { ...d, x: cx + innerR * Math.cos(angle), y: cy + innerR * Math.sin(angle) };
                    });

                    // Connected orgs (outer ring) — deduplicate
                    const connectedOrgs = {};
                    dirPositions.forEach(d => {
                      d.otherBoards.forEach(ob => {
                        const oid = ob.org_id || ob.organisations?.id;
                        if (!oid) return;
                        if (!connectedOrgs[oid]) connectedOrgs[oid] = { id: oid, name: cleanName(ob.organisations?.name) || "Unknown", sector: ob.organisations?.sector || "", directors: [] };
                        connectedOrgs[oid].directors.push(d.id);
                      });
                    });
                    const outerNodes = Object.values(connectedOrgs).slice(0, 16);
                    const outerPositions = outerNodes.map((o, i) => {
                      const angle = (2 * Math.PI * i / Math.max(outerNodes.length, 1)) - Math.PI / 2;
                      return { ...o, x: cx + outerR * Math.cos(angle), y: cy + outerR * Math.sin(angle) };
                    });

                    return (
                      <div className="mt-6 bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2"><Users className="w-4 h-4" /> Board Network Graph</h4>
                        <p className="text-[11px] text-gray-400 mb-3">{directors.length} directors{hasConnections ? ` · ${outerNodes.length} connected organisations via cross-directorships` : " · No cross-directorships detected yet — click names above to load"}</p>
                        <div className="overflow-x-auto">
                          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxWidth: svgW, minHeight: 400 }}>
                            {/* Connections: directors → connected orgs */}
                            {outerPositions.map((op, oi) =>
                              op.directors.map(did => {
                                const dp = dirPositions.find(d => d.id === did);
                                if (!dp) return null;
                                return <line key={`conn-${oi}-${did}`} x1={dp.x} y1={dp.y} x2={op.x} y2={op.y} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />;
                              })
                            )}
                            {/* Connections: center → directors */}
                            {dirPositions.map((dp, i) => (
                              <line key={`cdir-${i}`} x1={cx} y1={cy} x2={dp.x} y2={dp.y} stroke="#059669" strokeWidth="2" opacity="0.3" />
                            ))}

                            {/* Connected org nodes (outer) */}
                            {outerPositions.map((op, i) => (
                              <g key={`outer-${i}`} style={{ cursor: "pointer" }} onClick={() => setPage(`org:${op.id}`)}>
                                <circle cx={op.x} cy={op.y} r={16} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" />
                                <text x={op.x} y={op.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#6b7280" fontSize="8" fontWeight="600">{op.name.charAt(0)}</text>
                                <text x={op.x} y={op.y + 28} textAnchor="middle" fill="#6b7280" fontSize="8" fontWeight="500">
                                  {op.name.length > 18 ? op.name.substring(0, 16) + "…" : op.name}
                                </text>
                              </g>
                            ))}

                            {/* Director nodes (inner ring) */}
                            {dirPositions.map((dp, i) => (
                              <g key={`dir-${i}`}>
                                <circle cx={dp.x} cy={dp.y} r={20} fill="#ecfdf5" stroke="#059669" strokeWidth="2" />
                                <text x={dp.x} y={dp.y - 2} textAnchor="middle" dominantBaseline="middle" fill="#059669" fontSize="10" fontWeight="700">{dp.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</text>
                                <text x={dp.x} y={dp.y + 10} textAnchor="middle" fill="#059669" fontSize="7">{dp.otherBoards.length > 0 ? `+${dp.otherBoards.length}` : ""}</text>
                              </g>
                            ))}

                            {/* Center node: this org */}
                            <circle cx={cx} cy={cy} r={32} fill="#059669" stroke="#047857" strokeWidth="2" />
                            <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">
                              {cleanName(org.name).length > 14 ? cleanName(org.name).substring(0, 12) + "…" : cleanName(org.name)}
                            </text>
                            <text x={cx} y={cy + 8} textAnchor="middle" fill="#a7f3d0" fontSize="8">{directors.length} directors</text>

                            {/* Legend */}
                            <g transform={`translate(12, ${svgH - 50})`}>
                              <circle cx={8} cy={0} r={6} fill="#059669" /><text x={20} y={4} fill="#666" fontSize="9">This organisation</text>
                              <circle cx={8} cy={18} r={6} fill="#ecfdf5" stroke="#059669" strokeWidth="1.5" /><text x={20} y={22} fill="#666" fontSize="9">Board member</text>
                              <circle cx={140} cy={0} r={6} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" /><text x={152} y={4} fill="#666" fontSize="9">Connected via shared director</text>
                            </g>
                          </svg>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                (() => {
                  const entity = classifyEntity(org);
                  const sources = getEntitySources(org, entity).slice(0, 3);
                  const contextBlurb = {
                    local_authority: "Local authorities don't have boards in the charity sense — elected councillors and senior executive staff are the governance layer, documented in annual reports and gov.ie records.",
                    department: "Government departments are governed by a Minister and Management Board. Details sit with gov.ie and the Oireachtas, not the charity regulator.",
                    state_body: "State agencies publish their board composition in their annual reports on gov.ie or their own site — not in the charity register.",
                    etb: "ETB boards of management are appointed under the Education and Training Boards Act. Members are listed in the ETB's own annual report.",
                    higher_ed: "Universities and ITs publish their governing authority membership on the institution's website and in annual reports filed with the HEA.",
                    school: "School boards of management are appointed under the Education Act. Membership is published by the school itself or its patron body.",
                    ahb: "AHB boards of directors file with AHBRA and the CRO. We haven't ingested this one yet — use the sources below.",
                    sports_club: "Sports clubs publish committee lists in AGM minutes or on their own site. Some larger clubs also file with the Charities Regulator.",
                    religious: "Religious bodies often publish trustees through their denomination or diocese rather than a central regulator.",
                    charity: "This charity is registered but we haven't ingested its board records yet. The Charities Regulator holds the authoritative list.",
                    company: "This entity is on the CRO but not the charity register. Director records live on CORE.",
                    unknown: "We haven't classified this organisation yet. Try the sources below or help us improve the listing.",
                  }[entity.type] || "";
                  return (
                    <div className="bg-[#FFFFFF] border border-[#1B3A4B]/10 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-[#4A9B8E] rounded-xl flex items-center justify-center flex-shrink-0">
                          <Users className="w-6 h-6 text-[#1B3A4B]" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-wordmark text-xl text-[#1a1a2e]">No board data on file yet</h4>
                            {entity.type !== "unknown" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#4A9B8E]/30 text-[#1B3A4B] px-2 py-1 rounded-full">{entity.label}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#1B3A4B]/70 mb-4 leading-relaxed">{contextBlurb}</p>
                          <div className="flex flex-wrap gap-2">
                            {sources.map((src, i) => (
                              <a key={i} href={src.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#1B3A4B]/20 text-[#1B3A4B] text-xs font-semibold rounded-lg hover:bg-[#4A9B8E]/20 hover:border-[#1B3A4B] transition-colors">{src.label} <ExternalLink className="w-3 h-3" /></a>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {tab === "financials" && (
            <div>
              {/* Data source + filing lag notice */}
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <div>
                  <p className="text-xs text-blue-700 font-medium">About this data</p>
                  <p className="text-xs text-blue-600 mt-0.5">Financial figures are sourced directly from <strong>Charities Regulator</strong> and <strong>CRO</strong> annual return filings. Organisations typically file 9–12 months after their financial year ends, so the most recent year shown here is usually one year behind the current date. 2025 accounts will appear once filed later this year.</p>
                </div>
              </div>
              {org.financials && org.financials.length > 0 ? (() => {
                const cur = org.financials[0];
                const prev = org.financials.length >= 2 ? org.financials[1] : null;
                const sorted = [...org.financials].reverse();
                const currentCalendarYear = new Date().getFullYear();
                const filingLag = cur.year && cur.year < currentCalendarYear - 1;
                const yoyBadge = (curVal, prevVal) => {
                  if (!prev || curVal == null || prevVal == null || prevVal === 0) return null;
                  const pct = ((curVal - prevVal) / Math.abs(prevVal)) * 100;
                  if (Math.abs(pct) < 0.5) return <span className="text-[10px] text-gray-400 ml-1">unchanged</span>;
                  const up = pct > 0;
                  return <span className={`text-[10px] ml-1 font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs {prev.year || "prior"}</span>;
                };
                const surplus = (cur.gross_income || 0) - (cur.gross_expenditure || 0);
                const spendRatio = cur.gross_income > 0 ? ((cur.gross_expenditure || 0) / cur.gross_income * 100).toFixed(0) : 0;
                const hasIncomeBreakdown = (cur.government_income > 0 || cur.donations_income > 0 || cur.trading_income > 0 || cur.other_income > 0);
                const hasBalanceSheet = (cur.total_assets > 0 || cur.total_liabilities > 0 || cur.net_assets != null);
                return (
                <div className="space-y-6">
                  {/* Header bar */}
                  <div className="bg-[#4A9B8E]/25 border border-[#1B3A4B]/15 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#1B3A4B] font-bold">Latest Annual Return ({cur.year || "Most Recent"})</p>
                      {filingLag && <p className="text-[10px] text-amber-600 mt-0.5">⚠ This organisation's filing may be overdue — newer data may not yet be available</p>}
                    </div>
                    {org.financials.length > 1 && <span className="text-xs text-[#1B3A4B]/70 font-semibold">{org.financials.length} years on file</span>}
                  </div>

                  {/* ===== KEY METRICS GRID ===== */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {cur.gross_income != null && <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Income</div><div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(cur.gross_income)}</div><div>{yoyBadge(cur.gross_income, prev?.gross_income)}</div></div>}
                    {cur.gross_expenditure != null && <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Expenditure</div><div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(cur.gross_expenditure)}</div><div>{yoyBadge(cur.gross_expenditure, prev?.gross_expenditure)}</div></div>}
                    <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Surplus / Deficit</div><div className={`text-lg font-bold mt-0.5 ${surplus >= 0 ? "text-emerald-600" : "text-red-500"}`}>{surplus >= 0 ? "+" : ""}{fmt(surplus)}</div><div className="text-[10px] text-gray-400">Spend ratio: {spendRatio}%</div></div>
                    {cur.total_assets != null && cur.total_assets > 0 && <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Assets</div><div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(cur.total_assets)}</div><div>{yoyBadge(cur.total_assets, prev?.total_assets)}</div></div>}
                    {cur.net_assets != null && cur.net_assets !== 0 && <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Net Assets</div><div className={`text-lg font-bold mt-0.5 ${cur.net_assets >= 0 ? "text-gray-900" : "text-red-500"}`}>{fmt(cur.net_assets)}</div><div>{yoyBadge(cur.net_assets, prev?.net_assets)}</div></div>}
                    {cur.employees > 0 && <div className="p-3 bg-gray-50 rounded-xl"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Employees</div><div className="text-lg font-bold text-gray-900 mt-0.5">{cur.employees.toLocaleString()}</div>{cur.volunteers > 0 && <div className="text-[10px] text-gray-400">+ {cur.volunteers.toLocaleString()} volunteers</div>}{!cur.volunteers && <div>{yoyBadge(cur.employees, prev?.employees)}</div>}</div>}
                  </div>

                  {/* ===== INCOME BREAKDOWN (if data exists) ===== */}
                  {hasIncomeBreakdown && (() => {
                    const sources = [
                      { name: "Government", value: cur.government_income || 0, fill: "#059669" },
                      { name: "Donations", value: cur.donations_income || 0, fill: "#7c3aed" },
                      { name: "Trading", value: cur.trading_income || 0, fill: "#2563eb" },
                      { name: "Public", value: cur.public_income || 0, fill: "#0891b2" },
                      { name: "Other", value: cur.other_income || 0, fill: "#ca8a04" },
                    ].filter(s => s.value > 0);
                    const totalInc = sources.reduce((s, d) => s + d.value, 0);
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Income Breakdown ({cur.year})</h4>
                        <div className="flex flex-col sm:flex-row items-start gap-6">
                          <div className="w-40 h-40 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={sources} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                  {sources.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                </Pie>
                                <Tooltip formatter={v => fmt(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2 w-full">
                            {sources.map(s => {
                              const pctOfTotal = totalInc > 0 ? (s.value / totalInc * 100) : 0;
                              const isGovernment = s.name === "Government";
                              const hasGrants = org.grants && org.grants.length > 0;
                              return (
                                <div key={s.name} className={isGovernment && hasGrants ? "cursor-pointer group/src" : ""} onClick={isGovernment && hasGrants ? () => { setTab("overview"); setTimeout(() => { const el = document.getElementById("funding-detail-section"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100); } : undefined}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                                      <span className={`text-sm font-medium ${isGovernment && hasGrants ? "text-emerald-700 group-hover/src:underline" : "text-gray-700"}`}>{s.name}</span>
                                      {isGovernment && hasGrants && <span className="text-[10px] text-emerald-500 font-medium">→ see details</span>}
                                    </div>
                                    <span className="text-sm font-bold text-gray-900">{fmt(s.value)} <span className="text-[10px] font-normal text-gray-400">({pctOfTotal.toFixed(0)}%)</span></span>
                                  </div>
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full"><div className="h-full rounded-full transition-all" style={{ width: `${pctOfTotal}%`, background: s.fill }} /></div>
                                  {!isGovernment && <p className="text-[10px] text-gray-400 mt-0.5">Source: annual charity filing ({cur.year})</p>}
                                </div>
                              );
                            })}
                            {cur.state_funding_pct > 0 && <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-200">State funding dependency: <strong className={cur.state_funding_pct > 70 ? "text-red-500" : cur.state_funding_pct > 40 ? "text-amber-600" : "text-emerald-600"}>{cur.state_funding_pct.toFixed(0)}%</strong> of total income</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== FALLBACK: Simple State vs Other (when no breakdown data) ===== */}
                  {!hasIncomeBreakdown && org.financials[0] && cur.gross_income > 0 && (() => {
                    const totalIncome = cur.gross_income;
                    const grantTotal = org.grants ? org.grants.filter(g => g.year === cur.year || !g.year).reduce((s, g) => s + (g.amount || 0), 0) : 0;
                    const statePct = Math.min(100, Math.round((grantTotal / totalIncome) * 100));
                    const otherPct = 100 - statePct;
                    if (grantTotal === 0) return null;
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Income Sources ({cur.year || "Latest"})</h4>
                        <div className="flex items-center gap-8">
                          <div className="w-32 h-32 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={[{ name: "State", value: statePct, fill: "#059669" }, { name: "Other", value: otherPct, fill: "#6366f1" }]} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                                  <Cell fill="#059669" /><Cell fill="#6366f1" />
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-3 flex-1">
                            <div className="cursor-pointer group/sf" onClick={() => { setTab("overview"); setTimeout(() => { const el = document.getElementById("funding-detail-section"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100); }}>
                              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded bg-emerald-600" /><span className="text-sm font-medium text-emerald-700 group-hover/sf:underline">State Funding</span><span className="text-[10px] text-emerald-500 font-medium">→ see details</span><span className="text-sm font-bold text-gray-900 ml-auto">{statePct}%</span></div>
                              <div className="w-full h-2 bg-gray-200 rounded-full"><div className="h-2 bg-emerald-600 rounded-full" style={{ width: `${statePct}%` }} /></div>
                              <p className="text-xs text-gray-400 mt-0.5">{fmt(grantTotal)} from {org.grants?.length || 0} grants — click to see full breakdown</p>
                            </div>
                            <div><div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded bg-indigo-500" /><span className="text-sm font-medium text-gray-700">Other Income</span><span className="text-sm font-bold text-gray-900 ml-auto">{otherPct}%</span></div><div className="w-full h-2 bg-gray-200 rounded-full"><div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${otherPct}%` }} /></div><p className="text-xs text-gray-400 mt-0.5">Source: annual charity filing</p></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== BALANCE SHEET ===== */}
                  {hasBalanceSheet && (() => {
                    const assets = cur.total_assets || 0;
                    const liabilities = cur.total_liabilities || 0;
                    const netAssets = cur.net_assets || (assets - liabilities);
                    const solvencyRatio = assets > 0 ? ((netAssets / assets) * 100).toFixed(0) : 0;
                    const leverageRatio = netAssets > 0 ? (liabilities / netAssets).toFixed(2) : "N/A";
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Balance Sheet ({cur.year})</h4>
                        {/* Stacked bar: assets vs liabilities */}
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Assets</span><span>Liabilities</span></div>
                          <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden flex">
                            {assets > 0 && <div className="h-full bg-emerald-500 transition-all flex items-center justify-center" style={{ width: `${Math.max(5, assets / (assets + liabilities) * 100)}%` }}><span className="text-[9px] font-bold text-white">{fmt(assets)}</span></div>}
                            {liabilities > 0 && <div className="h-full bg-red-400 transition-all flex items-center justify-center" style={{ width: `${Math.max(5, liabilities / (assets + liabilities) * 100)}%` }}><span className="text-[9px] font-bold text-white">{fmt(liabilities)}</span></div>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 bg-white rounded-lg text-center"><div className="text-[10px] text-gray-400">Total Assets</div><div className="text-lg font-bold text-emerald-600">{fmt(assets)}</div></div>
                          <div className="p-3 bg-white rounded-lg text-center"><div className="text-[10px] text-gray-400">Total Liabilities</div><div className="text-lg font-bold text-red-500">{fmt(liabilities)}</div></div>
                          <div className="p-3 bg-white rounded-lg text-center"><div className="text-[10px] text-gray-400">Net Assets</div><div className={`text-lg font-bold ${netAssets >= 0 ? "text-gray-900" : "text-red-600"}`}>{fmt(netAssets)}</div></div>
                          <div className="p-3 bg-white rounded-lg text-center"><div className="text-[10px] text-gray-400">Solvency Ratio</div><div className={`text-lg font-bold ${solvencyRatio > 50 ? "text-emerald-600" : solvencyRatio > 20 ? "text-amber-600" : "text-red-500"}`}>{solvencyRatio}%</div><div className="text-[9px] text-gray-400">{solvencyRatio > 50 ? "Strong" : solvencyRatio > 20 ? "Adequate" : "Weak"}</div></div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== FINANCIAL HEALTH RATIOS ===== */}
                  {cur.gross_income > 0 && (() => {
                    const income = cur.gross_income;
                    const expend = cur.gross_expenditure || 0;
                    const assets = cur.total_assets || 0;
                    const liabilities = cur.total_liabilities || 0;
                    const netAssets = cur.net_assets || (assets - liabilities);
                    const reserveMonths = expend > 0 ? (netAssets / (expend / 12)) : 0;
                    const surplusMargin = income > 0 ? ((income - expend) / income * 100) : 0;
                    const costCoverageRatio = expend > 0 ? (income / expend) : 0;
                    const govDependency = cur.government_income > 0 && income > 0 ? (cur.government_income / income * 100) : (cur.state_funding_pct || 0);
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Financial Health Indicators</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="p-3 bg-white rounded-lg">
                            <div className="text-[10px] text-gray-400 mb-1">Surplus Margin</div>
                            <div className={`text-xl font-bold ${surplusMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{surplusMargin >= 0 ? "+" : ""}{surplusMargin.toFixed(1)}%</div>
                            <div className="text-[9px] text-gray-400">{surplusMargin > 5 ? "Healthy surplus" : surplusMargin > 0 ? "Marginal surplus" : surplusMargin > -5 ? "Small deficit" : "Significant deficit"}</div>
                          </div>
                          <div className="p-3 bg-white rounded-lg">
                            <div className="text-[10px] text-gray-400 mb-1">Cost Coverage</div>
                            <div className={`text-xl font-bold ${costCoverageRatio >= 1 ? "text-emerald-600" : "text-red-500"}`}>{costCoverageRatio.toFixed(2)}x</div>
                            <div className="text-[9px] text-gray-400">Income covers {costCoverageRatio >= 1 ? "all" : `${(costCoverageRatio * 100).toFixed(0)}% of`} costs</div>
                          </div>
                          {netAssets !== 0 && expend > 0 && <div className="p-3 bg-white rounded-lg">
                            <div className="text-[10px] text-gray-400 mb-1">Reserve Months</div>
                            <div className={`text-xl font-bold ${reserveMonths >= 3 ? "text-emerald-600" : reserveMonths >= 1 ? "text-amber-600" : "text-red-500"}`}>{reserveMonths.toFixed(1)}</div>
                            <div className="text-[9px] text-gray-400">{reserveMonths >= 6 ? "Strong reserves" : reserveMonths >= 3 ? "Adequate" : reserveMonths >= 1 ? "Low reserves" : "Critical"}</div>
                          </div>}
                          {govDependency > 0 && <div className="p-3 bg-white rounded-lg">
                            <div className="text-[10px] text-gray-400 mb-1">State Dependency</div>
                            <div className={`text-xl font-bold ${govDependency > 70 ? "text-red-500" : govDependency > 40 ? "text-amber-600" : "text-emerald-600"}`}>{govDependency.toFixed(0)}%</div>
                            <div className="text-[9px] text-gray-400">{govDependency > 70 ? "High dependency" : govDependency > 40 ? "Moderate" : "Diversified"}</div>
                          </div>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== MULTI-YEAR TREND CHART ===== */}
                  {org.financials.length > 1 && (() => {
                    const trendData = sorted.map(f => ({
                      year: f.year || "—",
                      Income: f.gross_income || 0,
                      Expenditure: f.gross_expenditure || 0,
                      Surplus: Math.max(0, (f.gross_income || 0) - (f.gross_expenditure || 0)),
                      Deficit: Math.max(0, (f.gross_expenditure || 0) - (f.gross_income || 0)),
                      Assets: f.total_assets || 0,
                    }));
                    const first = sorted[0]?.gross_income;
                    const last = sorted[sorted.length - 1]?.gross_income;
                    const nYears = sorted.length - 1;
                    let cagrLabel = null;
                    if (first > 0 && last > 0 && nYears >= 2) {
                      const cagr = (Math.pow(last / first, 1 / nYears) - 1) * 100;
                      cagrLabel = `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}% CAGR`;
                    }
                    const hasAssets = trendData.some(d => d.Assets > 0);
                    const surplusYears = sorted.filter(f => (f.gross_income || 0) >= (f.gross_expenditure || 0) && f.gross_income > 0).length;
                    const deficitYears = sorted.filter(f => (f.gross_expenditure || 0) > (f.gross_income || 0) && f.gross_income > 0).length;
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-700">Financial Trends ({trendData.length} years)</h4>
                          <div className="flex gap-2">{cagrLabel && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${last >= first ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{cagrLabel}</span>}{surplusYears + deficitYears > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Surplus {surplusYears}/{surplusYears + deficitYears} yrs</span>}</div>
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={trendData}>
                            <defs>
                              <linearGradient id="surpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.2}/><stop offset="95%" stopColor="#059669" stopOpacity={0}/></linearGradient>
                              <linearGradient id="defGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.2}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient>
                            </defs>
                            <XAxis dataKey="year" fontSize={11} />
                            <YAxis tickFormatter={v => v >= 1e6 ? `€${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `€${(v/1e3).toFixed(0)}K` : `€${v}`} fontSize={10} />
                            <Tooltip formatter={v => fmt(v)} />
                            <Area type="monotone" dataKey="Surplus" fill="url(#surpGrad)" stroke="none" />
                            <Area type="monotone" dataKey="Deficit" fill="url(#defGrad)" stroke="none" />
                            <Line type="monotone" dataKey="Income" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: "#059669" }} />
                            <Line type="monotone" dataKey="Expenditure" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 3, fill: "#0891b2" }} />
                            {hasAssets && <Line type="monotone" dataKey="Assets" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 2, fill: "#7c3aed" }} />}
                          </AreaChart>
                        </ResponsiveContainer>
                        <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-emerald-600" /> Income</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-cyan-600" /> Expenditure</div>
                          {hasAssets && <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-1 rounded" style={{borderTop: "2px dashed #7c3aed"}} /> Assets</div>}
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-emerald-200" /> Surplus</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-red-200" /> Deficit</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== INCOME BREAKDOWN OVER TIME (stacked bars) ===== */}
                  {org.financials.length > 1 && sorted.some(f => f.government_income > 0 || f.donations_income > 0) && (() => {
                    const stackData = sorted.map(f => ({
                      year: f.year || "—",
                      Government: f.government_income || 0,
                      Donations: f.donations_income || 0,
                      Trading: f.trading_income || 0,
                      Public: f.public_income || 0,
                      Other: f.other_income || 0,
                    }));
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Income Sources Over Time</h4>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={stackData}>
                            <XAxis dataKey="year" fontSize={11} />
                            <YAxis tickFormatter={v => v >= 1e6 ? `€${(v/1e6).toFixed(0)}M` : `€${(v/1e3).toFixed(0)}K`} fontSize={10} />
                            <Tooltip formatter={v => fmt(v)} />
                            <Legend />
                            <Bar dataKey="Government" stackId="a" fill="#059669" />
                            <Bar dataKey="Donations" stackId="a" fill="#7c3aed" />
                            <Bar dataKey="Trading" stackId="a" fill="#2563eb" />
                            <Bar dataKey="Public" stackId="a" fill="#0891b2" />
                            <Bar dataKey="Other" stackId="a" fill="#ca8a04" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* ===== YEAR-BY-YEAR TABLE ===== */}
                  {org.financials.length > 1 && (() => {
                    const yoyPct = (curV, prevV) => {
                      if (curV == null || prevV == null || prevV === 0) return null;
                      return ((curV - prevV) / Math.abs(prevV)) * 100;
                    };
                    const yoyCell = (pct) => {
                      if (pct == null) return <td className="py-2 px-1 text-right text-[10px] text-gray-300">—</td>;
                      const up = pct >= 0;
                      return <td className={`py-2 px-1 text-right text-[10px] font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>{up ? "+" : ""}{pct.toFixed(0)}%</td>;
                    };
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Year-by-Year Comparison</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-gray-400 border-b border-gray-200">
                              <th className="text-left py-2 pr-2">Year</th><th className="text-right py-2 px-2">Income</th><th className="text-right py-2 px-1 text-[10px]">YoY</th><th className="text-right py-2 px-2">Expenditure</th><th className="text-right py-2 px-1 text-[10px]">YoY</th><th className="text-right py-2 px-2">Surplus</th><th className="text-right py-2 px-2">Assets</th><th className="text-right py-2 px-2">Net Assets</th><th className="text-right py-2 pl-2">Staff</th>
                            </tr></thead>
                            <tbody>
                              {org.financials.map((f, i) => {
                                const pv = org.financials[i + 1];
                                const surp = (f.gross_income || 0) - (f.gross_expenditure || 0);
                                return (
                                <tr key={i} className={`border-b border-gray-100 ${i === 0 ? "font-semibold" : ""}`}>
                                  <td className="py-2 pr-2 text-gray-700">{f.year || "—"}</td>
                                  <td className="py-2 px-2 text-right text-gray-900">{f.gross_income != null ? fmt(f.gross_income) : "—"}</td>
                                  {yoyCell(pv ? yoyPct(f.gross_income, pv.gross_income) : null)}
                                  <td className="py-2 px-2 text-right text-gray-900">{f.gross_expenditure != null ? fmt(f.gross_expenditure) : "—"}</td>
                                  {yoyCell(pv ? yoyPct(f.gross_expenditure, pv.gross_expenditure) : null)}
                                  <td className={`py-2 px-2 text-right ${surp >= 0 ? "text-emerald-600" : "text-red-500"}`}>{f.gross_income > 0 ? fmt(surp) : "—"}</td>
                                  <td className="py-2 px-2 text-right text-gray-900">{f.total_assets > 0 ? fmt(f.total_assets) : "—"}</td>
                                  <td className="py-2 px-2 text-right text-gray-900">{f.net_assets != null && f.net_assets !== 0 ? fmt(f.net_assets) : "—"}</td>
                                  <td className="py-2 pl-2 text-right text-gray-600">{f.employees > 0 ? f.employees.toLocaleString() : "—"}{f.volunteers > 0 ? ` + ${f.volunteers}v` : ""}</td>
                                </tr>);
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== SECTOR BENCHMARKING ===== */}
                  <div className="relative">
                    {!isPro && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                        <Lock className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="font-semibold text-gray-700">Sector benchmarking & ranking</p>
                        <p className="text-sm text-gray-500 mb-3">See how this org compares — available on Pro</p>
                        <button onClick={() => requirePro("Sector Benchmarking")} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">Upgrade to Pro — €29/mo</button>
                      </div>
                    )}
                    {benchmark && cur.gross_income > 0 && (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Sector Benchmarking</h4>
                        <p className="text-xs text-gray-400 mb-4">Compared to {benchmark.orgCount.toLocaleString()} organisations in {benchmark.sectorName}</p>
                        {(() => {
                          const income = cur.gross_income;
                          const expend = cur.gross_expenditure || 0;
                          const incomeRatio = benchmark.medianIncome > 0 ? income / benchmark.medianIncome : 0;
                          const incomePctile = incomeRatio > 3 ? "top 5%" : incomeRatio > 1.5 ? "above median" : incomeRatio > 0.8 ? "near median" : "below median";
                          const spendRatio = income > 0 ? ((expend / income) * 100).toFixed(0) : 0;
                          const sectorSpendRatio = benchmark.avgIncome > 0 ? ((benchmark.avgExpenditure / benchmark.avgIncome) * 100).toFixed(0) : 0;
                          return (
                            <div className="grid sm:grid-cols-3 gap-4">
                              <div className="text-center p-3 bg-white rounded-lg"><div className="text-xs text-gray-400 mb-1">Income vs Sector Median</div><div className={`text-lg font-bold ${incomeRatio >= 1 ? "text-emerald-600" : "text-amber-600"}`}>{incomeRatio >= 10 ? "10x+" : `${incomeRatio.toFixed(1)}x`}</div><div className="text-xs text-gray-500 capitalize">{incomePctile}</div><div className="text-[10px] text-gray-400 mt-1">Median: {fmt(benchmark.medianIncome)}</div></div>
                              <div className="text-center p-3 bg-white rounded-lg"><div className="text-xs text-gray-400 mb-1">Spending Efficiency</div><div className="text-lg font-bold text-gray-900">{spendRatio}%</div><div className="text-xs text-gray-500">of income spent</div><div className="text-[10px] text-gray-400 mt-1">Sector avg: {sectorSpendRatio}%</div></div>
                              <div className="text-center p-3 bg-white rounded-lg"><div className="text-xs text-gray-400 mb-1">Sector Rank</div><div className="text-lg font-bold text-gray-900">{incomePctile === "top 5%" ? "Top 5%" : incomePctile === "above median" ? "Top 25%" : incomePctile === "near median" ? "Middle 50%" : "Bottom 25%"}</div><div className="text-xs text-gray-500">by income</div><div className="text-[10px] text-gray-400 mt-1">{benchmark.orgCount} orgs in sector</div></div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>);
              })() : (
                (() => {
                  const entity = classifyEntity(org);
                  const sources = getEntitySources(org, entity).slice(0, 3);
                  const contextBlurb = {
                    local_authority: "Local authority finances aren't on the charity register. Annual financial statements are audited by the Local Government Audit Service and published on the council's own site and gov.ie.",
                    department: "Government departments publish appropriation accounts through the C&AG and annual reports on gov.ie — not in any charity or company register.",
                    state_body: "State agencies publish audited accounts through the C&AG and their parent department. We link to those below.",
                    etb: "ETB annual financial statements are audited by the C&AG and published by ETBI and the Department of Education.",
                    higher_ed: "Universities and ITs file audited statements with the HEA and the C&AG. Published annual reports are usually on the institution's own site.",
                    school: "School finances are reported through the FSSU (for voluntary secondary schools) and the Department of Education. Public detail varies by school.",
                    ahb: "AHB financial statements are filed with AHBRA. We haven't ingested this AHB's returns yet — the regulator has the full record.",
                    sports_club: "Club accounts are usually published in AGM minutes, not a public regulator. Grant recipients are listed on Sport Ireland.",
                    religious: "Religious bodies' accounts are often published through their diocese or denomination. Registered charities also file with the Charities Regulator.",
                    charity: "This charity is registered but we haven't ingested annual return data yet. Check the Charities Regulator for the authoritative record.",
                    company: "This entity is on the CRO. Accounts are filed with CORE but may not include the detailed breakdowns shown for registered charities.",
                    unknown: "We haven't classified this organisation. Audited accounts are often published on its own website or in an annual report.",
                  }[entity.type] || "";
                  return (
                    <div className="bg-[#FFFFFF] border border-[#1B3A4B]/10 rounded-xl p-6 mb-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-[#4A9B8E] rounded-xl flex items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-[#1B3A4B]" /></div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap"><h4 className="font-wordmark text-xl text-[#1a1a2e]">No financial filings on record yet</h4>{entity.type !== "unknown" && <span className="text-[10px] font-bold uppercase tracking-wider bg-[#4A9B8E]/30 text-[#1B3A4B] px-2 py-1 rounded-full">{entity.label}</span>}</div>
                          <p className="text-sm text-[#1B3A4B]/70 mb-4 leading-relaxed">{contextBlurb}</p>
                          <div className="flex flex-wrap gap-2">
                            {sources.map((src, i) => <a key={i} href={src.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#1B3A4B]/20 text-[#1B3A4B] text-xs font-semibold rounded-lg hover:bg-[#4A9B8E]/20 hover:border-[#1B3A4B] transition-colors">{src.label} <ExternalLink className="w-3 h-3" /></a>)}
                            <button onClick={() => setPage("claim")} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1B3A4B] text-white text-xs font-semibold rounded-lg hover:bg-[#0f2b3a] transition-colors">Upload financials</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {tab === "details" && (
            <div>
              <div className="grid sm:grid-cols-2 gap-4">
                {fields.map((f, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-50">
                    <div className="text-xs text-gray-400 font-medium">{f.label}</div>
                    <div className="text-sm text-gray-900 mt-0.5">{f.value}</div>
                  </div>
                ))}
              </div>

              {/* Source Documents — direct links to primary sources */}
              {(clean(org.charity_number) || clean(org.cro_number)) && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Source Documents</h3>
                  <p className="text-xs text-gray-400 mb-4">Verify data against primary regulatory filings. All links open official government registers.</p>
                  <div className="space-y-3">
                    {clean(org.charity_number) && (
                      <a href={`https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities/charity-detail?regid=${org.charity_number}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Shield className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 group-hover:text-emerald-700">Charities Regulator</div>
                          <div className="text-xs text-gray-500">Annual reports, governance code, financial filings · RCN {org.charity_number}</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 flex-shrink-0" />
                      </a>
                    )}
                    {clean(org.cro_number) && (
                      <a href={`https://core.cro.ie/search?q=${org.cro_number}&type=companies`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700">Companies Registration Office (CORE)</div>
                          <div className="text-xs text-gray-500">Constitution, annual returns, directors, company filings · CRO {org.cro_number}</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                      </a>
                    )}
                    {clean(org.revenue_chy) && (
                      <a href={`https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/resident-charities.aspx`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <Landmark className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 group-hover:text-amber-700">Revenue Commissioners</div>
                          <div className="text-xs text-gray-500">Tax-exempt charity status register · CHY {org.revenue_chy}</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-amber-600 flex-shrink-0" />
                      </a>
                    )}
                    {clean(org.charity_number) && (
                      <a href={`https://data.gov.ie/dataset/register-of-charities-in-ireland`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <Database className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 group-hover:text-purple-700">Open Data Portal (data.gov.ie)</div>
                          <div className="text-xs text-gray-500">Bulk data download — full register and annual reports CSV</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-purple-600 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* White-label branding modal */}
      {showBranding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBranding(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Brand your report</h3>
            <p className="text-sm text-gray-500 mb-4">Your company name will appear on the cover and footer of the {showBranding === "dd" ? "due diligence report" : "PDF profile"}.</p>
            <input type="text" placeholder="e.g. McCann FitzGerald LLP" value={brandName} onChange={e => saveBrand(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none mb-4" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => {
                const reportType = pendingReportRef.current;
                setShowBranding(null);
                // After dialog closes, trigger the pending report generation
                if (reportType) {
                  pendingReportRef.current = null;
                  setTimeout(() => {
                    if (reportType === "dd") ddBtnRef.current?.click();
                    else if (reportType === "pdf") pdfBtnRef.current?.click();
                  }, 100);
                }
              }} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">{brandName.trim() ? "Generate report" : "Skip branding"}</button>
              <button onClick={() => { pendingReportRef.current = null; setShowBranding(null); }} className="px-4 py-2.5 text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
            <p className="text-xs text-gray-400 mt-3">Saved locally. You can change this anytime.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================
// FUNDERS PAGE (with drill-down to grant recipients)
// ===========================================================
function FundersPage({ setPage, setInitialSearch }) {
  // Load live funder stats from Supabase, merge with hardcoded data.js for fallback
  const [liveFunders, setLiveFunders] = useState(null);
  useEffect(() => {
    fetchFunders().then(data => { if (data) setLiveFunders(data); }).catch(() => {});
  }, []);

  // Merge: live Supabase data overrides hardcoded totals
  const mergedFunderData = useMemo(() => {
    if (!liveFunders) return funderData;
    const liveMap = {};
    liveFunders.forEach(lf => { liveMap[lf.name] = lf; });
    // Start with hardcoded list, overlay live stats
    const merged = funderData.map(f => {
      const live = liveMap[f.name];
      if (live) {
        return {
          ...f,
          id: live.id,
          total: live.total_funding > 0 ? Number(live.total_funding) : (f.total || 0),
          recipients: live.total_recipients > 0 ? Number(live.total_recipients) : (f.recipients || 0),
          matched_recipients: live.matched_recipients || 0,
          programmes: live.programmes?.length ? live.programmes : (f.programmes || []),
        };
      }
      return f;
    });
    // Add any Supabase funders not in hardcoded list
    liveFunders.forEach(lf => {
      if (!funderData.find(f => f.name === lf.name)) {
        merged.push({
          id: lf.id, name: lf.name, type: lf.type || "Government",
          total: Number(lf.total_funding) || 0,
          recipients: Number(lf.total_recipients) || 0,
          matched_recipients: lf.matched_recipients || 0,
          programmes: lf.programmes || [],
        });
      }
    });
    return merged;
  }, [liveFunders]);

  const sorted = useMemo(() => [...mergedFunderData].sort((a, b) => (b.total || 0) - (a.total || 0)), [mergedFunderData]);
  const totalFunding = mergedFunderData.reduce((s, f) => s + (f.total || 0), 0);
  const totalProgs = mergedFunderData.reduce((s, f) => s + (f.programmes?.length || 0), 0);
  const [search, setSearch] = useState("");
  const [selectedFunder, setSelectedFunder] = useState(null);
  const [selectedProgramme, setSelectedProgramme] = useState(null); // programme filter
  const [funderGrants, setFunderGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(f => f.name.toLowerCase().includes(q));
  }, [sorted, search]);

  // Grants filtered by selected programme (client-side for speed)
  const displayGrants = useMemo(() => {
    if (!selectedProgramme) return funderGrants;
    return funderGrants.filter(g => g.programme === selectedProgramme);
  }, [funderGrants, selectedProgramme]);

  // Unique programmes in the currently loaded grants
  const grantProgrammes = useMemo(() => {
    const progs = [...new Set(funderGrants.map(g => g.programme).filter(Boolean))];
    return progs.sort();
  }, [funderGrants]);

  const loadFunderGrants = async (funder, programme = null) => {
    setSelectedFunder(funder);
    setSelectedProgramme(programme);
    setGrantsLoading(true);
    try {
      if (funder.id) {
        const result = await fetchFunderGrants(funder.id, { pageSize: 200 });
        setFunderGrants(result?.grants || []);
      } else {
        const result = await fetchFunderGrantsByName(funder.name, { pageSize: 200 });
        setFunderGrants(result?.grants || []);
      }
    } catch (e) { console.error(e); setFunderGrants([]); }
    setGrantsLoading(false);
  };

  const handleFunderClick = async (funder) => {
    if (selectedFunder?.name === funder.name && !selectedProgramme) { setSelectedFunder(null); setFunderGrants([]); setSelectedProgramme(null); return; }
    setSelectedProgramme(null);
    await loadFunderGrants(funder);
  };

  const handleProgrammeClick = async (funder, programme) => {
    if (selectedFunder?.name === funder.name && selectedProgramme === programme) {
      setSelectedProgramme(null); return; // Toggle off
    }
    if (selectedFunder?.name !== funder.name) {
      await loadFunderGrants(funder, programme);
    } else {
      setSelectedProgramme(programme);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">State Funders Directory</h1>
        <p className="text-gray-500">{mergedFunderData.length} funders distributing {fmt(totalFunding)} across {totalProgs} programmes</p>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search funders..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
        <button onClick={() => {
          const rows = filtered.map(f => [
            f.name,
            f.type || "",
            f.total || 0,
            f.recipients || 0,
            (f.programmes || []).length,
            (f.programmes || []).join("; "),
          ]);
          downloadCSV(rows, ["Funder","Type","Total Funding","Recipients","Programmes Count","Programmes"], "ireland-state-funders.csv");
        }} className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap">
          <Download className="w-4 h-4" /> Download CSV
        </button>
      </div>

      <div className="space-y-4">
        {filtered.map((f, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm flex-1">{f.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.type === "Government" ? "bg-blue-50 text-blue-700" : f.type === "State Agency" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{f.type}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-xs text-gray-400">Total Funding</div>
                  <div className="text-lg font-bold text-gray-900">{fmt(f.total)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-xs text-gray-400">Recipients</div>
                  <div className="text-lg font-bold text-gray-900">{(f.recipients || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 col-span-2">
                  <div className="text-xs text-gray-400">Programmes <span className="text-gray-300">(click to see recipients)</span></div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(f.programmes || []).slice(0, 6).map((p, j) => (
                      <button key={j} onClick={() => handleProgrammeClick(f, p)} className={`text-[10px] px-2 py-0.5 rounded-full truncate max-w-[180px] transition-colors ${selectedFunder?.name === f.name && selectedProgramme === p ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700"}`}>{p}</button>
                    ))}
                    {(f.programmes || []).length > 6 && <span className="text-[10px] text-gray-400">+{f.programmes.length - 6}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => { const idx = funderData.indexOf(f); setPage(`follow/${getFunderSlug(idx >= 0 ? idx : sorted.indexOf(f))}`); }} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-lg hover:from-emerald-700 hover:to-teal-700 shadow-sm hover:shadow transition-all">
                  <Layers className="w-4 h-4" /> View Funding Flow
                </button>
                <button onClick={() => handleFunderClick(f)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:border-emerald-300 hover:text-emerald-700 transition-colors">
                  {selectedFunder?.name === f.name ? "Hide" : "View"} Recipients <ChevronDown className={`w-3 h-3 transition-transform ${selectedFunder?.name === f.name ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Drill-down: grant recipients */}
            {selectedFunder?.name === f.name && (
              <div className="border-t border-gray-100 bg-gray-50 p-5">
                {grantsLoading ? <Spinner /> : funderGrants.length > 0 ? (
                  <div>
                    {/* Programme filter tabs */}
                    {grantProgrammes.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <button onClick={() => setSelectedProgramme(null)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${!selectedProgramme ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-emerald-50 border border-gray-200"}`}>All programmes ({funderGrants.length})</button>
                        {grantProgrammes.map(p => {
                          const count = funderGrants.filter(g => g.programme === p).length;
                          return <button key={p} onClick={() => setSelectedProgramme(selectedProgramme === p ? null : p)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedProgramme === p ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-emerald-50 border border-gray-200"}`}>{p} ({count})</button>;
                        })}
                      </div>
                    )}
                    {selectedProgramme && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                        <span className="text-xs text-emerald-700 font-medium">Showing recipients of: <strong>{selectedProgramme}</strong> ({displayGrants.length} grants, {fmt(displayGrants.reduce((s, g) => s + (g.amount || 0), 0))} total)</span>
                        <button onClick={() => setSelectedProgramme(null)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Clear filter</button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mb-3">{displayGrants.length} grant records{selectedProgramme ? ` in ${selectedProgramme}` : ""}</p>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {displayGrants.map((g, j) => (
                        <button key={j} onClick={() => g.organisations?.id ? setPage(`org:${g.organisations.id}`) : g.org_id ? setPage(`org:${g.org_id}`) : null} className="w-full text-left flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-sm transition-shadow">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown"}</div>
                            <div className="text-xs text-gray-400">{[g.programme, g.year, g.organisations?.county].filter(Boolean).join(" · ")}</div>
                          </div>
                          {g.amount > 0 && <div className="text-sm font-semibold text-emerald-600 ml-3">{fmt(g.amount)}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">Individual grant data coming soon for this funder. <button onClick={() => { setInitialSearch(f.name.split("/")[0].split("(")[0].trim()); setPage("orgs"); }} className="text-emerald-600 hover:underline">Search funded organisations instead</button></p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={Landmark} title="No funders match" sub="Try a different search" />}
    </div>
  );
}

// ===========================================================
// FOLLOW THE MONEY — Funding Flow Widget (embeddable)
// ===========================================================
const FLOW_COLORS = ["#059669","#0d9488","#0891b2","#2563eb","#7c3aed","#db2777","#ea580c","#ca8a04","#65a30d","#dc2626"];

function FundingFlowWidget({ funder, grants, compact = false, onOrgClick, onProgrammeClick }) {
  const [hover, setHover] = useState(null); // { type: "prog"|"org"|"flow", id, x, y, label, amount }
  if (!funder || !grants || grants.length === 0) return null;

  // Aggregate grants by programme, then by org within each programme
  const byProg = {};
  const byOrg = {};
  grants.forEach(g => {
    const prog = g.programme || "General";
    const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
    const id = g.organisations?.id || g.org_id || name;
    if (!byProg[prog]) byProg[prog] = { name: prog, total: 0, orgs: {} };
    byProg[prog].total += (g.amount || 0);
    if (!byProg[prog].orgs[id]) byProg[prog].orgs[id] = { id, name, total: 0, county: g.organisations?.county || "" };
    byProg[prog].orgs[id].total += (g.amount || 0);
    if (!byOrg[id]) byOrg[id] = { id, name, total: 0, county: g.organisations?.county || "", sector: g.organisations?.sector || "" };
    byOrg[id].total += (g.amount || 0);
  });

  const programmes = Object.values(byProg).sort((a, b) => b.total - a.total).slice(0, 8);
  const topOrgs = Object.values(byOrg).sort((a, b) => b.total - a.total).slice(0, 10);
  const totalFlowing = topOrgs.reduce((s, r) => s + r.total, 0);
  const hasProgrammes = programmes.length > 1 || (programmes.length === 1 && programmes[0].name !== "General");

  // SVG layout — 3 columns: Funder | Programmes | Recipients
  const svgW = compact ? 640 : 900;
  const svgH = compact ? 360 : Math.max(420, (hasProgrammes ? Math.max(programmes.length, topOrgs.length) : topOrgs.length) * 38 + 60);
  const pad = 16;
  const colW = (svgW - pad * 2) / (hasProgrammes ? 5 : 3);
  const funderX = pad;
  const funderW = colW * 0.9;
  const progX = hasProgrammes ? pad + colW * 1.2 : 0;
  const progW = colW * 0.8;
  const orgX = hasProgrammes ? pad + colW * 2.8 : pad + colW * 1.4;

  // Funder box dimensions
  const contentH = svgH - 40;
  const funderH = Math.min(contentH, 120);
  const funderY = (svgH - funderH) / 2;

  // Programme positions
  const progGap = 4;
  const totalProgAmount = programmes.reduce((s, p) => s + p.total, 0);
  let progPositions = [];
  if (hasProgrammes) {
    let yAcc = 20;
    progPositions = programmes.map(p => {
      const h = Math.max(22, (p.total / totalProgAmount) * (contentH - programmes.length * progGap));
      const pos = { ...p, y: yAcc, h };
      yAcc += h + progGap;
      return pos;
    });
  }

  // Org positions
  const orgH = Math.max(20, (contentH - topOrgs.length * 3) / topOrgs.length);
  const maxOrgAmount = topOrgs[0]?.total || 1;

  // Tooltip helper
  const showTip = (e, type, id, label, amount) => {
    const rect = e.currentTarget.closest("svg").getBoundingClientRect();
    setHover({ type, id, x: e.clientX - rect.left, y: e.clientY - rect.top - 10, label, amount });
  };
  const hideTip = () => setHover(null);

  return (
    <div className="w-full overflow-x-auto relative">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxWidth: svgW, minWidth: compact ? 500 : 700 }} onMouseLeave={hideTip}>
        <defs>
          <filter id="sankey-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {programmes.map((_, i) => (
            <linearGradient key={`pg-${i}`} id={`sankey-prog-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.5" />
              <stop offset="100%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.35" />
            </linearGradient>
          ))}
          {topOrgs.map((_, i) => (
            <linearGradient key={`og-${i}`} id={`sankey-org-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.4" />
              <stop offset="100%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.2" />
            </linearGradient>
          ))}
          {/* Highlighted versions for hover */}
          {programmes.map((_, i) => (
            <linearGradient key={`pgh-${i}`} id={`sankey-prog-hi-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.8" />
              <stop offset="100%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.65" />
            </linearGradient>
          ))}
          {topOrgs.map((_, i) => (
            <linearGradient key={`ogh-${i}`} id={`sankey-org-hi-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.7" />
              <stop offset="100%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.5" />
            </linearGradient>
          ))}
        </defs>

        {/* Column headers */}
        <text x={funderX + funderW / 2} y={12} textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600" textDecoration="uppercase">SOURCE</text>
        {hasProgrammes && <text x={progX + progW / 2} y={12} textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600">PROGRAMME</text>}
        <text x={orgX + 60} y={12} textAnchor="start" fill="#9ca3af" fontSize="9" fontWeight="600">RECIPIENTS</text>

        {/* Funder box (left) */}
        <rect x={funderX} y={funderY} width={funderW} height={funderH} rx="10" fill="#059669" className="transition-opacity" opacity={hover && hover.type !== "funder" ? 0.7 : 1} />
        <text x={funderX + funderW / 2} y={funderY + funderH / 2 - 14} textAnchor="middle" fill="white" fontSize={compact ? 9 : 11} fontWeight="700">
          {funder.name.length > 20 ? funder.name.substring(0, 18) + "..." : funder.name}
        </text>
        <text x={funderX + funderW / 2} y={funderY + funderH / 2 + 4} textAnchor="middle" fill="#a7f3d0" fontSize={compact ? 10 : 13} fontWeight="700">
          {fmt(totalFlowing)}
        </text>
        <text x={funderX + funderW / 2} y={funderY + funderH / 2 + 20} textAnchor="middle" fill="#6ee7b7" fontSize={compact ? 7 : 8}>
          {topOrgs.length} top recipients
        </text>

        {/* SANKEY FLOWS */}
        {hasProgrammes ? (
          <>
            {/* Funder → Programme flows */}
            {progPositions.map((p, pi) => {
              const fromY = funderY + (funderH / (programmes.length + 1)) * (pi + 1);
              const toY = p.y + p.h / 2;
              const thickness = Math.max(2, (p.total / totalProgAmount) * 16);
              const cx1 = funderX + funderW + (progX - funderX - funderW) * 0.4;
              const cx2 = funderX + funderW + (progX - funderX - funderW) * 0.6;
              const isHi = hover?.type === "prog" && hover.id === pi;
              return <path key={`fp-${pi}`} d={`M ${funderX + funderW} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${progX} ${toY}`} fill="none" stroke={isHi ? `url(#sankey-prog-hi-${pi})` : `url(#sankey-prog-${pi})`} strokeWidth={isHi ? thickness + 2 : thickness} opacity={hover && !isHi ? 0.3 : 0.7} className="transition-all duration-200" />;
            })}

            {/* Programme boxes */}
            {progPositions.map((p, pi) => {
              const isHi = hover?.type === "prog" && hover.id === pi;
              return (
                <g key={`pb-${pi}`} style={{ cursor: onProgrammeClick ? "pointer" : "default" }} onClick={() => onProgrammeClick && onProgrammeClick(p.name)} onMouseEnter={e => showTip(e, "prog", pi, p.name, p.total)} onMouseLeave={hideTip}>
                  <rect x={progX} y={p.y} width={progW} height={p.h} rx="6" fill={FLOW_COLORS[pi % FLOW_COLORS.length]} opacity={isHi ? 0.3 : 0.15} stroke={FLOW_COLORS[pi % FLOW_COLORS.length]} strokeWidth={isHi ? 2.5 : 1.5} className="transition-all duration-200" />
                  <text x={progX + progW / 2} y={p.y + p.h / 2 - (p.h > 30 ? 5 : 0)} textAnchor="middle" fill="#333" fontSize={compact ? 8 : 9} fontWeight="600" dominantBaseline="middle">
                    {p.name.length > 18 ? p.name.substring(0, 16) + "..." : p.name}
                  </text>
                  {p.h > 30 && <text x={progX + progW / 2} y={p.y + p.h / 2 + 10} textAnchor="middle" fill="#888" fontSize={compact ? 7 : 8} dominantBaseline="middle">{fmt(p.total)}</text>}
                </g>
              );
            })}

            {/* Programme → Org flows */}
            {topOrgs.map((org, oi) => {
              const orgY = 20 + oi * ((contentH) / topOrgs.length);
              const orgMidY = orgY + orgH / 2;
              return programmes.map((prog, pi) => {
                const progOrg = byProg[prog.name]?.orgs[org.id];
                if (!progOrg) return null;
                const pp = progPositions[pi];
                const fromY = pp.y + pp.h / 2;
                const thickness = Math.max(1, (progOrg.total / maxOrgAmount) * 8);
                const cx1 = progX + progW + (orgX - progX - progW) * 0.4;
                const cx2 = progX + progW + (orgX - progX - progW) * 0.6;
                const isHi = (hover?.type === "org" && hover.id === oi) || (hover?.type === "prog" && hover.id === pi);
                return <path key={`po-${pi}-${oi}`} d={`M ${progX + progW} ${fromY} C ${cx1} ${fromY}, ${cx2} ${orgMidY}, ${orgX} ${orgMidY}`} fill="none" stroke={isHi ? `url(#sankey-org-hi-${oi})` : `url(#sankey-org-${oi})`} strokeWidth={isHi ? thickness + 1 : thickness} opacity={hover && !isHi ? 0.2 : 0.6} className="transition-all duration-200" />;
              });
            })}
          </>
        ) : (
          /* Direct Funder → Org flows (no programmes) */
          topOrgs.map((org, oi) => {
            const orgY = 20 + oi * ((contentH) / topOrgs.length);
            const orgMidY = orgY + orgH / 2;
            const fromY = funderY + (funderH / (topOrgs.length + 1)) * (oi + 1);
            const thickness = Math.max(2, (org.total / maxOrgAmount) * 14);
            const cx1 = funderX + funderW + (orgX - funderX - funderW) * 0.4;
            const cx2 = funderX + funderW + (orgX - funderX - funderW) * 0.6;
            const isHi = hover?.type === "org" && hover.id === oi;
            return <path key={`fo-${oi}`} d={`M ${funderX + funderW} ${fromY} C ${cx1} ${fromY}, ${cx2} ${orgMidY}, ${orgX} ${orgMidY}`} fill="none" stroke={isHi ? `url(#sankey-org-hi-${oi})` : `url(#sankey-org-${oi})`} strokeWidth={isHi ? thickness + 2 : thickness} opacity={hover && !isHi ? 0.3 : 0.7} className="transition-all duration-200" />;
          })
        )}

        {/* Recipient org bars + labels (right column) */}
        {topOrgs.map((r, i) => {
          const y = 20 + i * ((contentH) / topOrgs.length);
          const barW = Math.max(30, (r.total / maxOrgAmount) * 100);
          const isHi = hover?.type === "org" && hover.id === i;
          return (
            <g key={r.id} style={{ cursor: onOrgClick ? "pointer" : "default" }} onClick={() => onOrgClick && r.id !== r.name && onOrgClick(r.id)} onMouseEnter={e => showTip(e, "org", i, r.name, r.total)} onMouseLeave={hideTip}>
              <rect x={orgX} y={y} width={barW} height={orgH} rx="4" fill={FLOW_COLORS[i % FLOW_COLORS.length]} opacity={isHi ? 1 : hover ? 0.5 : 0.85} className="transition-all duration-200" />
              <text x={orgX + barW + 6} y={y + orgH / 2 - 3} fill="#111" fontSize={compact ? 8 : 10} fontWeight={isHi ? "800" : "600"} dominantBaseline="middle">
                {r.name.length > (compact ? 20 : 28) ? r.name.substring(0, compact ? 18 : 26) + "..." : r.name}
              </text>
              <text x={orgX + barW + 6} y={y + orgH / 2 + 10} fill="#888" fontSize={compact ? 7 : 8} dominantBaseline="middle">
                {fmt(r.total)}{r.county ? ` · ${r.county}` : ""}
              </text>
            </g>
          );
        })}

        {/* Watermark */}
        <text x={svgW - 6} y={svgH - 6} textAnchor="end" fill="#ccc" fontSize="8" fontWeight="500">openbenefacts.vercel.app</text>
      </svg>

      {/* Floating tooltip */}
      {hover && (
        <div className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-20" style={{ left: Math.min(hover.x, svgW - 180), top: hover.y - 40, maxWidth: 200 }}>
          <div className="font-semibold truncate">{hover.label}</div>
          <div className="text-emerald-300 font-bold">{fmt(hover.amount)}</div>
        </div>
      )}
    </div>
  );
}

// ===========================================================
// FLOW PAGE — shareable "Follow the Money" page
// ===========================================================
function FlowPage({ funderSlug, setPage, embed = false }) {
  // Resolve slug to funder — supports both slug ("hse") and legacy index ("3")
  const resolved = /^\d+$/.test(funderSlug) ? { index: parseInt(funderSlug) } : findFunderBySlug(funderSlug);
  const funderIndex = resolved?.index ?? -1;
  const funder = funderData[funderIndex] || null;
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null); // "link" | "embed" | null
  const [progFilter, setProgFilter] = useState(null); // programme filter for table

  useEffect(() => {
    if (!funder) { setLoading(false); return; }
    setLoading(true);
    const load = async () => {
      try {
        let result;
        if (funder.id) {
          result = await fetchFunderGrants(funder.id, { pageSize: 200 });
        } else {
          result = await fetchFunderGrantsByName(funder.name, { pageSize: 200 });
        }
        setGrants(result?.grants || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [funderIndex]);

  const slug = getFunderSlug(funderIndex);
  const shareUrl = `${window.location.origin}/follow/${slug}`;
  const embedCode = `<iframe src="${shareUrl}?embed=true" width="100%" height="500" frameborder="0" style="border:1px solid #e5e7eb;border-radius:12px"></iframe>`;

  const copyToClip = (text, type) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(type); setTimeout(() => setCopied(null), 2000); });
  };

  if (!funder) return <EmptyState icon={Landmark} title="Funder not found" sub="Select a funder from the directory" />;

  // Embed mode: minimal chrome
  if (embed) {
    return (
      <div className="p-4 bg-white min-h-screen">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-wordmark text-[16px] text-[#1B3A4B]">OpenBenefacts</span>
          <span className="text-xs text-gray-400">· Follow the Money</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{funder.name}</h2>
        <p className="text-xs text-gray-500 mb-4">{fmt(grants.length > 0 ? grants.reduce((s, g) => s + (g.amount || 0), 0) : funder.total)} distributed to {grants.length > 0 ? new Set(grants.map(g => g.recipient_name_raw || g.org_id).filter(Boolean)).size : (funder.recipients || 0)} organisations</p>
        {loading ? <Spinner /> : <FundingFlowWidget funder={funder} grants={grants} compact />}
        <p className="text-[10px] text-gray-400 mt-3 text-center">Data: Charities Regulator, CRO, Government Estimates · <a href={shareUrl} target="_blank" rel="noopener" className="text-emerald-600 hover:underline">View full analysis</a></p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => setPage("funders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ArrowLeft className="w-4 h-4" /> Back to funders</button>

      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-2xl p-6 sm:p-8 mb-8 text-white">
        <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Follow the Money</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">{funder.name}</h1>
        <p className="text-gray-300 text-sm">Distributing <span className="text-emerald-400 font-bold">{fmt(grants.length > 0 ? grants.reduce((s, g) => s + (g.amount || 0), 0) : funder.total)}</span> to <span className="font-bold">{grants.length > 0 ? new Set(grants.map(g => g.recipient_name_raw || g.org_id).filter(Boolean)).size : (funder.recipients || 0)}</span> organisations across <span className="font-bold">{grants.length > 0 ? new Set(grants.map(g => g.programme).filter(Boolean)).size : (funder.programmes?.length || 0)}</span> programmes</p>
      </div>

      {/* Share / Embed / Download bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => copyToClip(shareUrl, "link")} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          {copied === "link" ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
          {copied === "link" ? "Link copied!" : "Share link"}
        </button>
        <button onClick={() => copyToClip(embedCode, "embed")} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          {copied === "embed" ? <Check className="w-4 h-4 text-emerald-500" /> : <Code className="w-4 h-4" />}
          {copied === "embed" ? "Embed code copied!" : "Copy embed code"}
        </button>
        <button onClick={() => {
          if (!grants.length) return;
          const rows = grants.map(g => [
            funder.name,
            g.programme || "",
            cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown",
            g.organisations?.county || "",
            g.organisations?.sector || "",
            g.year || "",
            g.amount || 0,
            g.organisations?.charity_number || "",
          ]);
          downloadCSV(rows, ["Funder","Programme","Recipient","County","Sector","Year","Amount","RCN"], `${slug}-funding-data.csv`);
        }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
          <Download className="w-4 h-4" /> Download CSV
        </button>
      </div>

      {/* Visualization */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding Flow — Where the Money Goes</h2>
        <p className="text-xs text-gray-400 mb-4">Click a programme to filter the recipients table below</p>
        {loading ? <Spinner /> : grants.length > 0 ? (
          <FundingFlowWidget funder={funder} grants={grants} onOrgClick={(id) => setPage(`org:${id}`)} onProgrammeClick={(prog) => setProgFilter(progFilter === prog ? null : prog)} />
        ) : (
          <EmptyState icon={Database} title="Grant data loading" sub="Individual grant records for this funder are being collected" />
        )}
      </div>

      {/* Embed preview */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Code className="w-4 h-4" /> Embed this widget</h3>
        <p className="text-xs text-gray-500 mb-3">Copy the code below to embed this funding flow in any website or article.</p>
        <div className="bg-gray-900 rounded-xl p-4 relative">
          <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">{embedCode}</pre>
          <button onClick={() => copyToClip(embedCode, "embed")} className="absolute top-3 right-3 p-1.5 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
            {copied === "embed" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Social share buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        <span className="text-xs text-gray-400 self-center mr-1">Share:</span>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Follow the money: see where ${funder.name} sends ${fmt(funder.total)} in funding`)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">X / Twitter</a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">LinkedIn</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">Facebook</a>
      </div>

      {/* Full recipient table */}
      {grants.length > 0 && (() => {
        const filteredGrants = progFilter ? grants.filter(g => g.programme === progFilter) : grants;
        const uniqueProgs = [...new Set(grants.map(g => g.programme).filter(Boolean))].sort();
        const byOrg = {};
        filteredGrants.forEach(g => {
          const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
          const id = g.organisations?.id || g.org_id || name;
          if (!byOrg[id]) byOrg[id] = { id, name, total: 0, count: 0, county: g.organisations?.county || "", sector: g.organisations?.sector || "" };
          byOrg[id].total += (g.amount || 0);
          byOrg[id].count++;
        });
        const allRecipients = Object.values(byOrg).sort((a, b) => b.total - a.total);

        return (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              {progFilter ? `Recipients — ${progFilter}` : `All Recipients`} ({allRecipients.length})
            </h2>
            {/* Programme filter pills */}
            {uniqueProgs.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button onClick={() => setProgFilter(null)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${!progFilter ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-emerald-50"}`}>All ({grants.length})</button>
                {uniqueProgs.map(p => {
                  const ct = grants.filter(g => g.programme === p).length;
                  return <button key={p} onClick={() => setProgFilter(progFilter === p ? null : p)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${progFilter === p ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-emerald-50"}`}>{p} ({ct})</button>;
                })}
              </div>
            )}
            {progFilter && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-medium">Filtering by programme: <strong>{progFilter}</strong> — {fmt(filteredGrants.reduce((s, g) => s + (g.amount || 0), 0))} to {allRecipients.length} organisations</span>
                <button onClick={() => setProgFilter(null)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Clear</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left py-2 pr-3">#</th><th className="text-left py-2 pr-3">Organisation</th><th className="text-left py-2 pr-3">Sector</th><th className="text-left py-2 pr-3">County</th><th className="text-right py-2 pr-3">Grants</th><th className="text-right py-2">Total</th>
                </tr></thead>
                <tbody>
                  {allRecipients.slice(0, 50).map((r, i) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => r.id !== r.name && setPage(`org:${r.id}`)}>
                      <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-gray-900">{r.name}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{r.sector || "—"}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{r.county || "—"}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">{r.count}</td>
                      <td className="py-2 text-right font-semibold text-emerald-600">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allRecipients.length > 50 && <p className="text-xs text-gray-400 text-center mt-3">{allRecipients.length - 50} more recipients not shown</p>}
            </div>
          </div>
        );
      })()}

      {/* CTA */}
      <div className="mt-8 bg-emerald-50 rounded-2xl p-6 text-center">
        <p className="text-sm text-emerald-800 font-medium mb-2">Want deeper analysis on these organisations?</p>
        <p className="text-xs text-emerald-600 mb-4">Get AI risk scores, full financial histories, and due diligence reports with a Pro account.</p>
        <button onClick={() => setPage("pricing")} className="px-5 py-2.5 bg-emerald-600 text-white text-sm rounded-xl font-semibold hover:bg-emerald-700">View plans</button>
      </div>
    </div>
  );
}

// ===========================================================
// API DOCUMENTATION PAGE
// ===========================================================
function ApiPage() {
  const { tier, setShowAuth, setAuthMode } = useAuth();
  const hasApi = tier === "professional" || tier === "enterprise";
  const [tryItQuery, setTryItQuery] = useState("barnardos");
  const [tryItResult, setTryItResult] = useState(null);
  const [tryItLoading, setTryItLoading] = useState(false);

  const runTryIt = async () => {
    setTryItLoading(true);
    try {
      const resp = await fetch(`/api/v1/search?q=${encodeURIComponent(tryItQuery)}&limit=3`);
      const data = await resp.json();
      setTryItResult(JSON.stringify(data, null, 2));
    } catch (e) { setTryItResult(`Error: ${e.message}`); }
    setTryItLoading(false);
  };

  const endpoints = [
    { method: "GET", path: "/api/v1/organisations", desc: "List organisations with pagination, search, and filters", params: "page, pageSize, search, sector, county, governingForm, minIncome, maxIncome, sortBy, sortDir", example: `# Free tier — no API key needed
curl "https://openbenefacts.vercel.app/api/v1/organisations?search=barnardos&pageSize=5"

# Authenticated — higher limits
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/organisations?sector=Social+Services&pageSize=50"` },
    { method: "GET", path: "/api/v1/organisations/:id", desc: "Get full organisation profile including financials, grants, and board members", params: "id (UUID)", example: `curl "https://openbenefacts.vercel.app/api/v1/organisations/abc123"` },
    { method: "GET", path: "/api/v1/funders", desc: "List all state funders with total funding and recipient counts", params: "search", example: `curl "https://openbenefacts.vercel.app/api/v1/funders"` },
    { method: "GET", path: "/api/v1/funders/:id/grants", desc: "List individual grants from a specific funder", params: "id, page, pageSize", example: `curl "https://openbenefacts.vercel.app/api/v1/funders/xyz789/grants?pageSize=100"` },
    { method: "GET", path: "/api/v1/search", desc: "Fast autocomplete search across organisation names and registration numbers", params: "q, limit", example: `curl "https://openbenefacts.vercel.app/api/v1/search?q=focus+ireland&limit=5"` },
    { method: "GET", path: "/api/v1/stats", desc: "Platform-wide statistics: total orgs, financials, funding relationships", params: "none", example: `curl "https://openbenefacts.vercel.app/api/v1/stats"` },
  ];

  const tiers = [
    { name: "Free Developer", price: "Free", rateLimit: "5 req/min", pageSize: "25 max", auth: "No key needed", color: "gray" },
    { name: "Pro", price: "€29/mo", rateLimit: "20 req/min", pageSize: "50 max", auth: "API key", color: "blue" },
    { name: "Professional", price: "€149/mo", rateLimit: "50 req/min", pageSize: "100 max", auth: "API key", color: "emerald" },
    { name: "Enterprise", price: "Custom", rateLimit: "200 req/min", pageSize: "100 max", auth: "API key", color: "purple" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Documentation</h1>
          <p className="text-gray-500 mt-1">Programmatic access to Ireland's nonprofit data</p>
        </div>
        {hasApi ? (
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-full">API Active — {tier}</span>
        ) : (
          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-full">Free Tier Active</span>
        )}
      </div>

      {/* Quick start */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-2xl p-6 sm:p-8 mb-8 text-white">
        <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Quick Start</p>
        <h2 className="text-xl font-bold mb-3">Start querying in 30 seconds — no API key required</h2>
        <div className="bg-black/30 rounded-xl p-4 font-mono text-sm mb-4">
          <span className="text-gray-400">$</span> <span className="text-emerald-400">curl</span> <span className="text-yellow-300">"https://openbenefacts.vercel.app/api/v1/search?q=barnardos"</span>
        </div>
        <p className="text-gray-300 text-sm">The free developer tier gives you 5 requests/minute with no authentication. Add an API key to unlock higher limits.</p>
      </div>

      {/* Try it live */}
      <div className="bg-gray-50 rounded-2xl p-6 mb-8">
        <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-600" /> Try It Live</h2>
        <div className="flex gap-2 mb-3">
          <input type="text" value={tryItQuery} onChange={e => setTryItQuery(e.target.value)} placeholder="Search organisations..." className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" onKeyDown={e => e.key === "Enter" && runTryIt()} />
          <button onClick={runTryIt} disabled={tryItLoading} className="px-5 py-2.5 bg-emerald-600 text-white text-sm rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50">{tryItLoading ? "..." : "Search"}</button>
        </div>
        {tryItResult && (
          <div className="bg-gray-900 rounded-xl p-4 max-h-64 overflow-auto">
            <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">{tryItResult}</pre>
          </div>
        )}
      </div>

      {/* API Tiers */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">API Tiers</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tiers.map((t, i) => (
          <div key={i} className={`bg-white rounded-xl border-2 p-4 ${t.color === "emerald" ? "border-emerald-300" : "border-gray-100"}`}>
            <h3 className="font-bold text-gray-900 text-sm">{t.name}</h3>
            <div className="text-lg font-bold text-gray-900 mt-1">{t.price}</div>
            <div className="mt-3 space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-2"><Zap className="w-3 h-3" /> {t.rateLimit}</div>
              <div className="flex items-center gap-2"><Database className="w-3 h-3" /> {t.pageSize}</div>
              <div className="flex items-center gap-2"><Shield className="w-3 h-3" /> {t.auth}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Rate limits */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">Rate Limiting & Headers</h3>
        <p className="text-sm text-blue-700 mb-2">Every response includes rate limit headers: <code className="bg-blue-100 px-1 rounded text-xs">X-RateLimit-Limit</code>, <code className="bg-blue-100 px-1 rounded text-xs">X-RateLimit-Remaining</code>, <code className="bg-blue-100 px-1 rounded text-xs">X-RateLimit-Tier</code>.</p>
        <p className="text-sm text-blue-700">Free tier uses IP-based rate limiting. Authenticated tiers use key-based rate limiting with higher allowances.</p>
      </div>

      {/* Authentication */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Authentication</h2>
      <div className="bg-gray-50 rounded-2xl p-6 mb-8">
        <div className="space-y-3 text-sm text-gray-600">
          <p>The free developer tier requires no authentication — just make requests to the API endpoints directly.</p>
          <p>For higher rate limits, include your API key in the Authorization header:</p>
          <div className="bg-gray-900 rounded-xl p-4">
            <pre className="text-xs text-emerald-400 font-mono">Authorization: Bearer ob_prof_your_api_key_here</pre>
          </div>
          <p className="text-xs text-gray-400">Key prefixes: <code>ob_free_</code> (free), <code>ob_pro_</code> (pro), <code>ob_prof_</code> (professional), <code>ob_ent_</code> (enterprise)</p>
        </div>
      </div>

      {/* Endpoints */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Endpoints</h2>
      <div className="space-y-4">
        {endpoints.map((ep, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-mono font-bold rounded">{ep.method}</span>
                <code className="text-sm font-mono text-gray-900">{ep.path}</code>
              </div>
              <p className="text-sm text-gray-500">{ep.desc}</p>
              {ep.params !== "none" && <p className="text-xs text-gray-400 mt-1">Parameters: <span className="text-gray-600">{ep.params}</span></p>}
            </div>
            <div className="bg-gray-900 p-4">
              <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap overflow-x-auto">{ep.example}</pre>
            </div>
          </div>
        ))}
      </div>

      {/* Response format */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Response Format</h2>
      <div className="bg-gray-900 rounded-xl p-4 mb-8">
        <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">{`{
  "orgs": [
    {
      "id": "abc-123",
      "name": "Barnardos",
      "sector": "Social Services",
      "county": "Dublin",
      "charity_number": "6015",
      "gross_income": 42500000,
      "gross_expenditure": 41800000,
      "total_grant_amount": 28000000
    }
  ],
  "total": 36803,
  "page": 1,
  "pageSize": 50
}`}</pre>
      </div>

      {/* Data sources */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Data Sources</h2>
      <div className="bg-gray-50 rounded-2xl p-6 mb-8">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { name: "Charities Regulator", desc: "Register + annual financial returns", freq: "Monthly" },
            { name: "Revenue Commissioners", desc: "CHY numbers + tax-exempt status", freq: "Monthly" },
            { name: "Companies Registration Office", desc: "CRO numbers + directors", freq: "Quarterly" },
            { name: "HSE Section 38/39", desc: "Health service funding allocations", freq: "Annual" },
            { name: "Arts Council", desc: "Arts & culture funding grants", freq: "Annual" },
            { name: "Sport Ireland", desc: "Sports funding grants", freq: "Annual" },
            { name: "Dept. of Education", desc: "School register + enrolments", freq: "Monthly" },
            { name: "National Lottery", desc: "Good Causes grant allocations", freq: "Monthly" },
          ].map((src, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900">{src.name}</div>
                <div className="text-xs text-gray-400">{src.desc}</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">{src.freq}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Integration examples */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Integration Examples</h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {[
          { name: "Salesforce NPSP", desc: "Enrich nonprofit records with real-time financial data and risk scores" },
          { name: "Fluxx / SmartSimple", desc: "Auto-populate grant applications with verified organisation details" },
          { name: "Power BI / Tableau", desc: "Build dashboards from live OpenBenefacts data feeds" },
          { name: "Python / R / Node.js", desc: "Research-grade datasets for academic and policy analysis" },
        ].map((ex, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 text-sm">{ex.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{ex.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">{hasApi ? "You have full API access" : "Start building today"}</h2>
        <p className="text-emerald-100 mb-4">{hasApi ? "Your Professional plan includes 50 requests/minute and 100 results per page." : "The free developer tier is available immediately — no signup required. Upgrade for higher limits."}</p>
        {!hasApi && <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-6 py-3 bg-white text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50">Start 30-Day Professional Trial</button>}
      </div>
    </div>
  );
}

// ===========================================================
// "WHERE DOES THE MONEY GO?" — shareable viral page for political/social audience
// ===========================================================
function MoneyPage({ setPage, orgCount = 36803 }) {
  const formattedCount = orgCount.toLocaleString();
  const totalFunding = funderData.reduce((s, f) => s + (f.total || 0), 0);

  // Top funders sorted by total
  const topFunders = [...funderData].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 12);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero — the screenshot-worthy headline */}
      <div className="text-center mb-12 py-10 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-3xl px-6">
        <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">Where Does Ireland's<br /><span className="text-emerald-400">€{(totalFunding / 1e9).toFixed(0)} Billion</span> Go?</h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-6">Every euro of government funding to Irish nonprofits — tracked, mapped, and searchable. {formattedCount} organisations. 11 years of data. Free and open.</p>
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          <button onClick={() => setPage("funders")} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-400 transition-colors">Follow the Money</button>
          <button onClick={() => setPage("orgs")} className="px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors">Search Organisations</button>
        </div>
        <p className="text-xs text-gray-500">Source: Charities Regulator, CRO, Revenue Commissioners, Government Estimates</p>
      </div>

      {/* The big number breakdown — designed to be screenshot-friendly */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
          <div className="text-3xl font-black text-gray-900">{formattedCount}</div>
          <div className="text-xs text-gray-400 uppercase font-medium mt-1">Organisations</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
          <div className="text-3xl font-black text-emerald-600">€{(totalFunding / 1e9).toFixed(1)}B</div>
          <div className="text-xs text-gray-400 uppercase font-medium mt-1">State Funding Tracked</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
          <div className="text-3xl font-black text-gray-900">{funderData.length}</div>
          <div className="text-xs text-gray-400 uppercase font-medium mt-1">Government Funders</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
          <div className="text-3xl font-black text-gray-900">11</div>
          <div className="text-xs text-gray-400 uppercase font-medium mt-1">Years of Data</div>
        </div>
      </div>

      {/* Top funders — the visual answer to "where does the money go?" */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">The biggest government funders</h2>
        <p className="text-gray-500 mb-6">Click any funder to see exactly where their money goes — every programme, every recipient, every euro.</p>
        <div className="space-y-2">
          {topFunders.map((f, i) => {
            const pct = totalFunding > 0 ? (f.total / totalFunding) * 100 : 0;
            return (
              <button key={i} onClick={() => setPage(`follow/${getFunderSlug(funderData.indexOf(f))}`)} className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all text-left group">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm flex-shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate group-hover:text-emerald-700">{f.name}</div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct * 2, 100)}%` }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-gray-900 text-sm">{fmt(f.total)}</div>
                  <div className="text-[10px] text-gray-400">{pct.toFixed(1)}%</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 flex-shrink-0" />
              </button>
            );
          })}
        </div>
        <button onClick={() => setPage("funders")} className="mt-4 text-sm text-emerald-600 font-medium hover:underline">View all {funderData.length} funders →</button>
      </div>

      {/* Share CTA */}
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-3">Share this. People should know.</h2>
        <p className="text-gray-300 max-w-xl mx-auto mb-6">Benefacts was shut down. This data almost disappeared. OpenBenefacts is rebuilding it — free, open, and independent. Help spread the word.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Where does Ireland's €14 billion in nonprofit funding go? Track every euro at OpenBenefacts — free and open.")}&url=${encodeURIComponent("https://openbenefacts.vercel.app/#money")}`} target="_blank" rel="noopener" className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">Share on X / Twitter</a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://openbenefacts.vercel.app/#money")}`} target="_blank" rel="noopener" className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">Share on LinkedIn</a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://openbenefacts.vercel.app/#money")}`} target="_blank" rel="noopener" className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">Share on Facebook</a>
          <button onClick={() => { navigator.clipboard.writeText("https://openbenefacts.vercel.app/#money"); }} className="px-5 py-2.5 bg-emerald-500 rounded-xl text-sm font-medium hover:bg-emerald-400 transition-colors">Copy Link</button>
        </div>
        <p className="text-xs text-gray-500 mt-4">openbenefacts.vercel.app · Built in Ireland · Open source</p>
      </div>
    </div>
  );
}

// ===========================================================
// FOUNDATIONS LANDING PAGE — targeted at grant-making foundations
// ===========================================================
function FoundationsPage({ orgCount = 36803 }) {
  const { setShowAuth, setAuthMode } = useAuth();
  const formattedCount = orgCount.toLocaleString();

  const painPoints = [
    { before: "2–4 hours", after: "30 seconds", label: "Per applicant due diligence" },
    { before: "Manual checking", after: "One-click report", label: "CRO, Charities Register, Revenue" },
    { before: "Spreadsheet tracking", after: "AI risk scoring", label: "Financial health assessment" },
    { before: "Scattered sources", after: "Single platform", label: "All regulatory data unified" },
  ];

  const checks = [
    "Multi-year financial trend analysis with CAGR",
    "AI risk score with confidence level",
    "Expenditure ratio and reserve coverage",
    "State funding dependency analysis",
    "Board governance and cross-directorships",
    "Filing history completeness check",
    "Source document links for verification",
    "White-label branded PDF reports",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-wider rounded-full mb-4">For Grant-Making Foundations</div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">Grant due diligence<br />in one click</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">Stop spending hours manually checking the Charities Register, CRO filings, and Revenue records. OpenBenefacts generates a comprehensive due diligence report on any Irish nonprofit in seconds — covering {formattedCount} organisations.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-8 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-lg hover:bg-emerald-700 transition-colors">Start Free 30-Day Trial</button>
          <a href="mailto:team@openbenefacts.com?subject=Foundation%20Pilot%20Programme" className="px-8 py-3.5 border-2 border-emerald-600 text-emerald-700 rounded-xl font-semibold text-lg hover:bg-emerald-50 transition-colors">Request Pilot Access</a>
        </div>
        <p className="text-sm text-gray-400 mt-3">No credit card required · Professional plan €1,499/year</p>
      </div>

      {/* Before/After comparison */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Replace hours of manual checking</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {painPoints.map((p, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 text-center">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">{p.label}</div>
              <div className="text-red-400 text-sm line-through mb-1">{p.before}</div>
              <div className="text-emerald-700 text-lg font-bold">{p.after}</div>
            </div>
          ))}
        </div>
      </div>

      {/* What the DD report covers */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">What every due diligence report includes</h2>
        <p className="text-gray-500 mb-6">Generated automatically from public regulatory data across nine Irish sources.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROI calculation */}
      <div className="bg-white rounded-2xl border-2 border-emerald-200 p-8 mb-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">The ROI is immediate</h2>
        <p className="text-gray-500 max-w-xl mx-auto mb-6">A foundation reviewing 50 grant applications per year spends 100–200 hours on due diligence alone. At €1,499/year, OpenBenefacts pays for itself after the first two applications.</p>
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
          <div><div className="text-3xl font-bold text-gray-900">50+</div><div className="text-xs text-gray-400">Applications reviewed</div></div>
          <div><div className="text-3xl font-bold text-emerald-600">200hrs</div><div className="text-xs text-gray-400">Saved per year</div></div>
          <div><div className="text-3xl font-bold text-emerald-600">98%</div><div className="text-xs text-gray-400">Time reduction</div></div>
        </div>
      </div>

      {/* Pilot programme CTA */}
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-3">Foundation Pilot Programme</h2>
        <p className="text-gray-300 max-w-xl mx-auto mb-6">We're offering five grant-making foundations free access to the Professional plan for 90 days — in exchange for feedback and a short case study.</p>
        <a href="mailto:team@openbenefacts.com?subject=Foundation%20Pilot%20Programme&body=Hi%20Mark%2C%0A%0AWe%27re%20interested%20in%20the%20Foundation%20Pilot%20Programme%20for%20OpenBenefacts.%0A%0AFoundation%20name%3A%20%0AApprox.%20grant%20applications%20reviewed%20per%20year%3A%20%0A%0AThanks" className="inline-block px-8 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors">Apply for the Pilot</a>
        <p className="text-sm text-gray-500 mt-3">5 places available · 90-day free Professional access</p>
      </div>
    </div>
  );
}

// ===========================================================
// MEDIA / JOURNALISTS LANDING PAGE — drive citations and coverage
// ===========================================================
function MediaPage({ orgCount = 36803 }) {
  const [copiedSnippet, setCopiedSnippet] = useState(null);
  const formattedCount = orgCount.toLocaleString();

  const tools = [
    { title: "Organisation profiles", desc: "Financial history, risk scores, board members, and state funding for any of " + formattedCount + " Irish nonprofits. Shareable link and embed code on every profile.", route: "orgs" },
    { title: "Follow the Money flows", desc: "Interactive funding flow visualisations showing how government money reaches nonprofits. Embeddable in any article with one line of HTML.", route: "funders" },
    { title: "AI risk scores", desc: "Algorithmic financial health assessment using multi-year trend analysis, expenditure ratios, reserve coverage, and governance checks. Fully transparent methodology.", route: "orgs" },
    { title: "Cross-directorship mapping", desc: "See every board a director sits on across the entire nonprofit sector. Identify overlapping governance networks.", route: "orgs" },
  ];

  const embedExample = `<iframe src="${window.location.origin}/follow/hse?embed=true"\n  width="100%" height="500" frameborder="0"\n  style="border:1px solid #e5e7eb;border-radius:12px">\n</iframe>`;
  const citationExample = `"[Organisation Name]," OpenBenefacts, accessed ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}, ${window.location.origin}/org/[id]`;

  const copySnippet = (text, id) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedSnippet(id); setTimeout(() => setCopiedSnippet(null), 2000); });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold uppercase tracking-wider rounded-full mb-4">For Journalists &amp; Researchers</div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">Ireland's nonprofit data,<br />ready for publication</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">OpenBenefacts gives journalists and researchers free access to financial data, governance records, and funding flows for {formattedCount} Irish nonprofits. Every data point sourced from the Charities Regulator, CRO, and Revenue. Every chart embeddable. Every profile citable.</p>
        <p className="text-emerald-600 font-semibold text-lg mb-2">Everything below is free. No paywall. No sign-up required.</p>
      </div>

      {/* Tools grid */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">What you can use — all free</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {tools.map((t, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-2">{t.title}</h3>
              <p className="text-sm text-gray-600">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How to embed */}
      <div className="bg-gray-900 rounded-2xl p-8 mb-16">
        <h2 className="text-2xl font-bold text-white mb-2">Embed in your article</h2>
        <p className="text-gray-400 mb-6">Every organisation profile and funding flow has a one-click embed code. Copy the iframe tag and paste it into your CMS — it works with WordPress, Ghost, Substack, and any HTML editor.</p>
        <div className="bg-gray-800 rounded-xl p-4 relative mb-4">
          <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">{embedExample}</pre>
          <button onClick={() => copySnippet(embedExample, "embed")} className="absolute top-3 right-3 p-1.5 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
            {copiedSnippet === "embed" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
          </button>
        </div>
        <p className="text-xs text-gray-500">The embed renders a compact, branded widget with a link back to the full profile. Responsive, mobile-friendly, loads fast.</p>
      </div>

      {/* How to cite */}
      <div className="bg-blue-50 rounded-2xl p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Cite OpenBenefacts</h2>
        <p className="text-gray-500 mb-4">Every org profile has a "Cite this" button that copies a ready-to-use citation. For manual citations, use this format:</p>
        <div className="bg-white rounded-xl p-4 relative border border-blue-200">
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">{citationExample}</pre>
          <button onClick={() => copySnippet(citationExample, "cite")} className="absolute top-3 right-3 p-1.5 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors">
            {copiedSnippet === "cite" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-blue-500" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">All data is sourced from the Charities Regulator, Companies Registration Office, and Revenue Commissioners. OpenBenefacts normalises, cross-references, and presents this public data — it does not generate or modify the underlying figures.</p>
      </div>

      {/* Data methodology */}
      <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Data sources and methodology</h2>
        <p className="text-sm text-gray-600 mb-4">OpenBenefacts aggregates public data from the following Irish regulatory sources. All data is updated as new filings become available.</p>
        <div className="space-y-3">
          {[
            { source: "Charities Regulator", data: "Annual returns, financial statements, governance code compliance, charity register" },
            { source: "Companies Registration Office (CRO)", data: "Company formations, annual returns, director appointments, constitutions" },
            { source: "Revenue Commissioners", data: "Tax-exempt charity status (CHY numbers), resident charities register" },
            { source: "Government Estimates & Appropriations", data: "State funding allocations to nonprofits via departmental budgets" },
            { source: "data.gov.ie Open Data Portal", data: "Bulk charity register data, public sector spending data" },
          ].map((s, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="text-gray-400 font-medium min-w-[200px]">{s.source}</span>
              <span className="text-gray-600">{s.data}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">AI risk scores are computed algorithmically from the above data using multi-year trend analysis. The methodology is transparent and documented in each report. Risk scores are not editorial judgements.</p>
      </div>

      {/* Contact / tip line */}
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-3">Working on a story?</h2>
        <p className="text-gray-300 max-w-xl mx-auto mb-6">If you're investigating a nonprofit and need deeper data, custom exports, or background context on how to read charity financials, reach out. We support journalists.</p>
        <a href="mailto:team@openbenefacts.com?subject=Media%20Enquiry" className="inline-block px-8 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors">Contact the Data Team</a>
        <p className="text-sm text-gray-500 mt-3">team@openbenefacts.com</p>
      </div>
    </div>
  );
}

// ===========================================================
// CSR / ESG LANDING PAGE — targeted at corporate giving teams
// ===========================================================
function CsrPage({ orgCount = 36803 }) {
  const { setShowAuth, setAuthMode } = useAuth();
  const formattedCount = orgCount.toLocaleString();

  const risks = [
    { icon: "&#9888;", title: "Reputational damage", desc: "A single donation to a poorly governed charity can generate months of negative press coverage." },
    { icon: "&#128200;", title: "Compliance exposure", desc: "ESG reporting frameworks (GRI, CSRD) require demonstrable due diligence on charitable partnerships." },
    { icon: "&#128176;", title: "Wasted impact", desc: "Organisations running persistent deficits or with declining income may not effectively deploy your funding." },
  ];

  const features = [
    "AI risk score for every Irish nonprofit",
    "Multi-year financial trend analysis",
    "Board governance and cross-directorship checks",
    "State funding dependency mapping",
    "Spending ratio and reserve coverage",
    "Filing history completeness",
    "One-click PDF reports for compliance files",
    "Watchlist alerts for portfolio charities",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-block px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold uppercase tracking-wider rounded-full mb-4">For Corporate CSR &amp; ESG Teams</div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">Know before you give</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">Since the Rehab Group and Console scandals, corporate Ireland knows the reputational cost of donating to a poorly governed charity. OpenBenefacts gives your CSR team instant financial and governance intelligence on {formattedCount} Irish nonprofits — so every donation is defensible.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-8 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-lg hover:bg-emerald-700 transition-colors">Start Free 30-Day Trial</button>
          <a href="mailto:team@openbenefacts.com?subject=CSR%20Team%20Enquiry" className="px-8 py-3.5 border-2 border-emerald-600 text-emerald-700 rounded-xl font-semibold text-lg hover:bg-emerald-50 transition-colors">Talk to Us</a>
        </div>
        <p className="text-sm text-gray-400 mt-3">No credit card required · Pro plan from €299/year</p>
      </div>

      {/* Risk cards */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">The risk of not vetting</h2>
        <p className="text-gray-500 text-center mb-8 max-w-lg mx-auto">Every unvetted donation is a reputational liability. These are the risks your legal and compliance teams already worry about.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          {risks.map((r, i) => (
            <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-5">
              <div className="text-2xl mb-2" dangerouslySetInnerHTML={{ __html: r.icon }} />
              <h3 className="font-bold text-gray-900 mb-1">{r.title}</h3>
              <p className="text-sm text-gray-600">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What you get */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">What your CSR team gets</h2>
        <p className="text-gray-500 mb-6">Everything you need to vet charity partners and document due diligence for ESG reporting.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROI / pricing */}
      <div className="bg-white rounded-2xl border-2 border-emerald-200 p-8 mb-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">A trivial cost for total confidence</h2>
        <p className="text-gray-500 max-w-xl mx-auto mb-6">For a company managing a €500K annual charity budget, a Pro plan at €299/year is less than 0.06% of your giving — and eliminates 100% of the "we didn't know" risk.</p>
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
          <div><div className="text-3xl font-bold text-gray-900">€299</div><div className="text-xs text-gray-400">Per year</div></div>
          <div><div className="text-3xl font-bold text-emerald-600">0.06%</div><div className="text-xs text-gray-400">Of a €500K budget</div></div>
          <div><div className="text-3xl font-bold text-emerald-600">100%</div><div className="text-xs text-gray-400">Due diligence coverage</div></div>
        </div>
      </div>

      {/* Use case: charity portfolio monitoring */}
      <div className="bg-gray-50 rounded-2xl p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Monitor your charity portfolio</h2>
        <p className="text-gray-500 mb-4">Add every charity your company supports to your watchlist. OpenBenefacts will track their financial health, flag governance changes, and alert you to emerging risks — so you never get surprised by a headline.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="text-xs text-gray-400 font-medium uppercase mb-1">Before OpenBenefacts</div>
            <p className="text-sm text-gray-600">Annual review of charity partners based on their own self-reported information. No independent verification. React to problems after they appear in the press.</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-emerald-200">
            <div className="text-xs text-emerald-600 font-medium uppercase mb-1">With OpenBenefacts</div>
            <p className="text-sm text-gray-600">Continuous monitoring with AI risk scores, real regulatory data, and instant alerts. Proactive risk management. Every donation decision backed by evidence.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-3">Protect your brand. Maximise your impact.</h2>
        <p className="text-gray-300 max-w-xl mx-auto mb-6">Join corporate CSR teams who use OpenBenefacts to make every charitable donation defensible, compliant, and impactful.</p>
        <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="inline-block px-8 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors">Start Free Trial — €299/year</button>
      </div>
    </div>
  );
}

// ===========================================================
// PRICING PAGE
// ===========================================================
function PricingPage({ orgCount = 36803, setPage }) {
  const { setShowAuth, setAuthMode } = useAuth();
  const [annual, setAnnual] = useState(true);
  const formattedCount = orgCount.toLocaleString();

  const plans = [
    { name: "Free", price: 0, desc: "Genuinely useful transparency", features: [`Browse ${formattedCount} organisations`,"5-year financial trend charts","Year-by-year comparison tables","Board member & cross-directorships","State funding received","AI risk score (summary)","Full search & filters"], cta: "Get Started" },
    { name: "Pro", price: annual ? 299 : 29, period: annual ? "/year" : "/month", desc: "Know before you give", features: ["Everything in Free","Full AI risk assessment","Charity portfolio watchlist","Sector benchmarking","Income source breakdown","PDF profile downloads","ESG-ready compliance reports"], highlight: true, cta: "Start Free Trial", badge: annual ? "Save 15%" : null },
    { name: "Professional", price: annual ? 1499 : 149, period: annual ? "/year" : "/month", desc: "Grant due diligence in one click", features: ["Everything in Pro","One-click due diligence reports","Grant readiness assessment","White-label branded reports","Bulk CSV/Excel export","API access (1,000 calls/mo)","Priority support"], cta: "Start Free Trial" },
    { name: "Enterprise", price: null, desc: "Custom solutions", features: ["Everything in Professional","Unlimited API access","Custom dashboards","White-label reports","Dedicated account manager","Custom data integration","SLA guarantee"], cta: "Contact Sales" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, Transparent Pricing</h1>
        <p className="text-gray-500 mb-2">Choose the plan that fits your needs. Cancel anytime.</p>
        <p className="text-sm text-emerald-600 font-medium mb-4">All paid plans include a 30-day free Professional trial. No credit card required.</p>
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? "text-gray-900 font-medium" : "text-gray-400"}`}>Monthly</span>
          <button onClick={() => setAnnual(!annual)} className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-emerald-600" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${annual ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
          <span className={`text-sm ${annual ? "text-gray-900 font-medium" : "text-gray-400"}`}>Annual</span>
          {annual && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Save 15%</span>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan, i) => (
          <div key={i} className={`rounded-2xl border-2 p-6 ${plan.highlight ? "border-emerald-500 bg-emerald-50/30 relative" : "border-gray-100 bg-white"}`}>
            {plan.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-0.5 rounded-full font-medium">{plan.badge}</span>}
            <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{plan.desc}</p>
            <div className="mb-4">
              {plan.price !== null ? <><span className="text-3xl font-bold text-gray-900">€{plan.price}</span><span className="text-gray-400 text-sm">{plan.period}</span></> : <span className="text-3xl font-bold text-gray-900">Custom</span>}
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((f, j) => <li key={j} className="flex items-start gap-2 text-sm text-gray-600"><Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />{f}</li>)}
            </ul>
            <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className={`w-full py-2.5 rounded-xl text-sm font-semibold ${plan.highlight ? "bg-emerald-600 text-white hover:bg-emerald-700" : plan.price === 0 ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-gray-900 text-white hover:bg-gray-800"}`}>{plan.cta}</button>
          </div>
        ))}
      </div>

      {/* Foundations CTA */}
      {setPage && (
        <div className="mt-10 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">For Grant-Making Foundations</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Replace 2–4 hours of manual due diligence with one click</h3>
            <p className="text-sm text-gray-500">See how OpenBenefacts saves foundations thousands of hours on grant applicant screening.</p>
          </div>
          <button onClick={() => setPage("foundations")} className="flex-shrink-0 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap">Learn More</button>
        </div>
      )}

      {/* CSR / ESG CTA */}
      {setPage && (
        <div className="mt-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1">
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">For Corporate CSR &amp; ESG Teams</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Know before you give</h3>
            <p className="text-sm text-gray-500">Protect your brand with instant financial and governance checks on every charity your company supports.</p>
          </div>
          <button onClick={() => setPage("csr")} className="flex-shrink-0 px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap">Learn More</button>
        </div>
      )}
    </div>
  );
}

// ===========================================================
// ABOUT PAGE
// ===========================================================
function AboutPage({ orgCount = 36803 }) {
  return (
    <div className="bg-white min-h-screen">
      {/* Breadcrumb */}
      <div className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="text-sm text-gray-400">
            <span className="hover:text-gray-600 cursor-pointer">Home</span>
            <span className="mx-2">·</span>
            <span className="text-gray-700">About</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Section label */}
        <p className="text-emerald-600 font-medium text-sm mb-3">About the project</p>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-gray-900 leading-tight mb-10">
          Why we built this
        </h1>

        {/* Independence statement */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 mb-10">
          <p className="text-emerald-800 text-sm font-medium leading-relaxed">
            OpenBenefacts is an independent, open-data project. It has no government funding, no political affiliation, and no commercial agenda beyond covering its costs. It exists because Ireland's nonprofit sector deserves transparency.
          </p>
        </div>

        {/* Article body */}
        <div className="space-y-6 text-base text-gray-700 leading-relaxed">
          <p>
            Every year, the Irish government distributes between €11 billion and €14 billion to nonprofits — charities, housing bodies, schools, sports clubs, and health agencies. For years, Benefacts was the only independent platform tracking where this money went. When government funding was pulled in 2022, Benefacts shut down. For four years, that oversight disappeared.
          </p>

          <p>
            OpenBenefacts picks up where they left off. We aggregate data from public regulators and government funding bodies, structure it, and publish it here — free to search. Our goal is simple: make it possible for anyone to follow Irish nonprofit money.
          </p>

          <p>
            OpenBenefacts publishes information on {orgCount.toLocaleString()} nonprofits — whether or not they are registered as charities. In many cases we have more data than any single regulator, because we combine information filed across multiple public sources.
          </p>
        </div>

        <hr className="my-10 border-gray-200" />

        {/* Data methodology */}
        <p className="text-emerald-600 font-medium text-sm mb-3">Data methodology</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-10">
          How we collect and verify data
        </h2>

        <div className="space-y-6 text-base text-gray-700 leading-relaxed">
          <p>
            All data on OpenBenefacts is sourced from official public datasets published by Irish government bodies and regulators. We do not create or estimate data — we aggregate, cross-reference, and structure what is already publicly available.
          </p>

          <p>
            Our data pipeline works in three stages: first, we ingest raw data from regulator APIs, published PDFs, and open data portals. Second, we normalise organisation names, addresses, and identifiers to link records across sources. Third, we run automated quality checks to flag anomalies, duplicates, and stale records.
          </p>

          <p>
            Every organisation profile shows which sources contributed to its data. Financial figures come directly from filed accounts — we do not adjust or restate them. Where data is missing or incomplete, we say so.
          </p>

          <p>
            The full data pipeline is open source on <a href="https://github.com/markcoachaifootball/openbenefacts" className="text-emerald-600 hover:text-emerald-700 underline font-medium" target="_blank" rel="noopener noreferrer">GitHub</a>. Anyone can inspect our scrapers, verify our methodology, and contribute improvements.
          </p>
        </div>

        <hr className="my-10 border-gray-200" />

        {/* Data sources — clean list style */}
        <p className="text-emerald-600 font-medium text-sm mb-3">Our data</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-10">
          Where does the data come from?
        </h2>

        <div className="space-y-6 text-base text-gray-700 leading-relaxed">
          <p>OpenBenefacts re-uses data from many public sources. The main ones are:</p>

          <div className="space-y-4 ml-1">
            {[
              { name: "Charities Regulator of Ireland", desc: "The public register of charities, annual returns, and financial statements filed by registered charities." },
              { name: "Companies Registration Office (CRO)", desc: "Company directors, legal status, incorporation dates, and annual returns for companies limited by guarantee." },
              { name: "Revenue Commissioners", desc: "CHY numbers identifying organisations with tax-exempt charitable status." },
              { name: "HSE (Section 38 & 39 agencies)", desc: "Funding to health and disability service providers under the Health Act." },
              { name: "Tusla — Child and Family Agency", desc: "Section 56 grants to family support, childcare, and domestic violence organisations." },
              { name: "Sport Ireland & Sports Capital Programme", desc: "National governing body allocations and capital grants to sports clubs nationwide." },
              { name: "Arts Council / An Chomhairle Ealaion", desc: "Annual funding decisions to arts organisations across all artforms." },
              { name: "Pobal", desc: "Community development, social inclusion, and early years programme funding." },
              { name: "Department of Housing — Local Authorities", desc: "Emergency accommodation data and housing body funding across 31 councils." },
            ].map((src, i) => (
              <div key={i} className="border-l-2 border-emerald-200 pl-4">
                <div className="font-semibold text-gray-900">{src.name}</div>
                <div className="text-sm text-gray-500 mt-0.5">{src.desc}</div>
              </div>
            ))}
          </div>

          <p>
            We continuously add new sources as we identify and process them. If you know of a public dataset we should include, please get in touch.
          </p>
        </div>

        <hr className="my-10 border-gray-200" />

        {/* Contact */}
        <div className="bg-emerald-50 rounded-xl p-6">
          <h3 className="font-bold text-emerald-900 mb-2">Contact</h3>
          <p className="text-emerald-700 text-sm">Questions, data corrections, or partnership inquiries: <a href="mailto:team@openbenefacts.com" className="underline font-medium">team@openbenefacts.com</a></p>
        </div>

        {/* Similar help topics */}
        <div className="mt-12">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Similar help topics</h3>
          <div className="space-y-2">
            {[
              { label: "How to search for an organisation", page: "knowledge" },
              { label: "Understanding financial data on OpenBenefacts", page: "knowledge" },
              { label: "What is a Section 38 or Section 39 agency?", page: "knowledge" },
            ].map((link, i) => (
              <div key={i} className="text-emerald-600 hover:text-emerald-700 cursor-pointer text-sm font-medium">
                {link.label} →
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// INNER APP (state-based routing)
// ===========================================================
function InnerApp() {
  // ---- Path-based routing (SEO-friendly) ----
  // Internal page state uses identifiers like "orgs", "org:UUID", "follow/hse".
  // These are converted to/from real URL paths like "/orgs", "/org/UUID", "/follow/hse".
  const pageToPath = (p) => {
    if (!p || p === "home") return "/";
    if (p.startsWith("org:")) return `/org/${p.slice(4)}`;
    if (p.startsWith("follow/")) return `/follow/${p.slice(7)}`;
    if (p.startsWith("flow:")) return `/follow/${p.slice(5)}`; // normalise legacy flow: to follow/
    if (p.startsWith("trackers/")) return `/${p}`;
    return `/${p}`;
  };

  const pathToPage = (path) => {
    const clean = (path || "/").replace(/\/$/, "") || "/";
    if (clean === "/" || clean === "") return "home";
    const parts = clean.slice(1).split("/"); // drop leading slash
    if (parts[0] === "org" && parts[1]) return `org:${parts[1]}`;
    if (parts[0] === "follow" && parts[1]) return `follow/${parts[1]}`;
    if (parts[0] === "flow" && parts[1]) return `follow/${parts[1]}`;
    if (parts[0] === "trackers" && parts[1]) return `trackers/${parts[1]}`;
    return parts[0];
  };

  const getInitialPage = () => {
    // Legacy support: if someone visits with a hash URL (e.g. old shared links
    // like /#orgs or /#org:UUID), convert it to the new path and update history.
    const hash = window.location.hash.replace("#", "").split("&")[0];
    if (hash) {
      const p = hash; // e.g. "orgs" or "org:UUID" or "follow/hse" or "flow:3"
      const newPath = pageToPath(p);
      window.history.replaceState({}, "", newPath + window.location.search);
      return p.startsWith("flow:") ? `follow/${p.slice(5)}` : p;
    }
    return pathToPage(window.location.pathname);
  };

  const isEmbed = new URLSearchParams(window.location.search).get("embed") === "true" || window.location.hash.includes("embed=true");

  const [page, setPage] = useState(getInitialPage);
  const [initialSearch, setInitialSearch] = useState("");
  const [initialSector, setInitialSector] = useState("");
  const { showPricing, setShowPricing } = useAuth();
  const wl = useWatchlist();
  const [globalStats, setGlobalStats] = useState(null);
  useEffect(() => { fetchStats().then(setGlobalStats).catch(() => {}); }, []);
  const orgCount = globalStats?.total_orgs || siteStats.totalOrgs || 36803;

  const handleSetPage = (p) => {
    setPage(p);
    window.scrollTo(0, 0);
    const newPath = pageToPath(p);
    if (window.location.pathname !== newPath) {
      window.history.pushState({ page: p }, "", newPath);
    }
  };

  // Listen for browser back/forward
  useEffect(() => {
    const onPop = () => {
      const p = pathToPage(window.location.pathname);
      setPage(p);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const renderPage = () => {
    if (page.startsWith("org:")) return <OrgProfilePage orgId={page.split(":")[1]} setPage={handleSetPage} watchlist={wl} embed={isEmbed} />;
    if (page.startsWith("funder:")) return <FollowTheMoneyPage setPage={handleSetPage} initialFunder={page.split("funder:")[1]} />;
    if (page.startsWith("follow/")) return <FlowPage funderSlug={page.split("follow/")[1]} setPage={handleSetPage} embed={isEmbed} />;
    if (page.startsWith("flow:")) return <FlowPage funderSlug={page.split(":")[1]} setPage={handleSetPage} embed={isEmbed} />;
    if (page === "trackers/emergency-accommodation") return <EmergencyAccommodationPage setPage={handleSetPage} embed={isEmbed} />;
    switch (page) {
      case "orgs": return <OrgsPage setPage={handleSetPage} initialSearch={initialSearch} setInitialSearch={setInitialSearch} initialSector={initialSector} setInitialSector={setInitialSector} watchlist={wl} />;
      case "funders": return <FollowTheMoneyPage setPage={handleSetPage} />;
      case "councils": return <CouncilFinancesPage setPage={handleSetPage} />;
      case "pricing": return <PricingPage orgCount={orgCount} setPage={handleSetPage} />;
      case "money": return <MoneyPage setPage={handleSetPage} orgCount={orgCount} />;
      case "foundations": return <FoundationsPage orgCount={orgCount} />;
      case "csr": return <CsrPage orgCount={orgCount} />;
      case "media": return <MediaPage orgCount={orgCount} />;
      case "knowledge": return <KnowledgeBasePage setPage={handleSetPage} />;
      case "api": return <ApiPage />;
      case "about": return <AboutPage orgCount={orgCount} />;
      case "privacy": return <PrivacyPage />;
      case "terms": return <TermsPage />;
      case "sources": return <DataSourcesPage />;
      case "claim": return <ClaimListingPage />;
      default: return <HomePage setPage={handleSetPage} setInitialSearch={setInitialSearch} setInitialSector={setInitialSector} watchlist={wl} />;
    }
  };

  // Embed mode: no navbar/footer chrome
  if (isEmbed) return <div className="min-h-screen bg-white">{renderPage()}</div>;

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <Navbar page={page} setPage={handleSetPage} />
      {renderPage()}
      <DonationPopup />
      <footer className="bg-[#1B3A4B] text-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4">
                <span className="font-wordmark text-[28px] text-white leading-none">OpenBenefacts</span>
              </div>
              <p className="text-sm text-white/65 leading-relaxed mb-3">Ireland's nonprofit transparency platform. Independent, open, free to search.</p>
              <p className="text-xs text-white/40 leading-relaxed">An independent civic data project. No government funding.</p>
            </div>

            {/* Explore */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#4A9B8E] mb-4">Explore</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("orgs")} className="text-sm text-white/70 hover:text-white">Organisations</button></li>
                <li><button onClick={() => handleSetPage("funders")} className="text-sm text-white/70 hover:text-white">Funders</button></li>
                <li><button onClick={() => handleSetPage("money")} className="text-sm text-white/70 hover:text-white">Follow the money</button></li>
                <li><button onClick={() => handleSetPage("foundations")} className="text-sm text-white/70 hover:text-white">Foundations</button></li>
                <li><button onClick={() => handleSetPage("trackers/emergency-accommodation")} className="text-sm text-white/70 hover:text-white">Housing Tracker</button></li>
                <li><button onClick={() => handleSetPage("api")} className="text-sm text-white/70 hover:text-white">API</button></li>
                <li><button onClick={() => handleSetPage("knowledge")} className="text-sm text-white/70 hover:text-white">Knowledge Base</button></li>
              </ul>
            </div>

            {/* For nonprofits */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#4A9B8E] mb-4">For nonprofits</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("claim")} className="text-sm text-white/70 hover:text-white">Claim your listing</button></li>
                <li><a href="mailto:data@openbenefacts.com" className="text-sm text-white/70 hover:text-white">Request a correction</a></li>
                <li><button onClick={() => handleSetPage("sources")} className="text-sm text-white/70 hover:text-white">Data sources</button></li>
                <li><button onClick={() => handleSetPage("api")} className="text-sm text-white/70 hover:text-white">Developer API</button></li>
              </ul>
            </div>

            {/* Project */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#4A9B8E] mb-4">Project</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("about")} className="text-sm text-white/70 hover:text-white">About</button></li>
                <li><a href="https://github.com/markcoachaifootball/openbenefacts" target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 hover:text-white">GitHub</a></li>
                <li><button onClick={() => handleSetPage("pricing")} className="text-sm text-white/70 hover:text-white">Pricing</button></li>
                <li><a href="mailto:team@openbenefacts.com" className="text-sm text-white/70 hover:text-white">Contact</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#4A9B8E] mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("privacy")} className="text-sm text-white/70 hover:text-white">Privacy policy</button></li>
                <li><button onClick={() => handleSetPage("terms")} className="text-sm text-white/70 hover:text-white">Terms of use</button></li>
                <li><a href="mailto:privacy@openbenefacts.com" className="text-sm text-white/70 hover:text-white">GDPR requests</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Dark bottom bar */}
        <div className="bg-[#0f2b3a] text-white/60 py-6 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
              <p>&copy; 2026 OpenBenefacts. Independent nonprofit transparency for Ireland.</p>
              <p>Data sourced from public Irish government and regulator datasets.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ===========================================================
// STATIC PAGES (Privacy, Terms, Data Sources, Claim Listing)
// ===========================================================
function StaticPageShell({ title, subtitle, children }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="mb-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">{title}</h1>
        {subtitle && <p className="text-lg text-gray-500">{subtitle}</p>}
      </div>
      <div className="prose prose-lg max-w-none text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <StaticPageShell title="Privacy Policy" subtitle="Last updated: 10 April 2026">
      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What we collect</h2>
      <p>OpenBenefacts is a public transparency platform. We do not require an account to browse organisations, funders, or financial data. When you sign up for a Professional or Enterprise plan, we collect your email address and billing information (processed securely by Stripe — we never store payment details).</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Analytics</h2>
      <p>We use privacy-respecting analytics to understand which pages are popular and whether the service is working. We do not track you across other sites and we do not sell or share your data with advertisers.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Public data</h2>
      <p>All organisation, funder, and financial data on OpenBenefacts is sourced from publicly available government and regulator datasets (Charities Regulator, Revenue Commissioners, data.gov.ie, and others). Publishing this data is in the public interest and is lawful under GDPR Article 6(1)(e) and Article 6(1)(f).</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Your rights</h2>
      <p>Under the GDPR, you have the right to access, correct, or delete any personal data we hold about you. To exercise these rights, email <a href="mailto:privacy@openbenefacts.com" className="text-emerald-600 hover:underline">privacy@openbenefacts.com</a>.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Contact</h2>
      <p>Questions about this policy? Email <a href="mailto:team@openbenefacts.com" className="text-emerald-600 hover:underline">team@openbenefacts.com</a>.</p>
    </StaticPageShell>
  );
}

function TermsPage() {
  return (
    <StaticPageShell title="Terms of Use" subtitle="Last updated: 10 April 2026">
      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">About OpenBenefacts</h2>
      <p>OpenBenefacts is an independent nonprofit transparency platform for Ireland. By using this site, you agree to these terms.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Permitted use</h2>
      <p>You are free to search, read, and link to data on OpenBenefacts for any lawful purpose — journalism, research, due diligence, academic work, or personal curiosity. Attribution is appreciated but not required.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">API and bulk data</h2>
      <p>Use of the OpenBenefacts API is subject to the rate limits of your tier (see the <a href="#api" className="text-emerald-600 hover:underline">API page</a>). You must not attempt to circumvent rate limits, scrape the web interface as a substitute for the API, or redistribute bulk data without permission.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Accuracy</h2>
      <p>We work hard to keep data accurate and up to date, but OpenBenefacts is provided <em>as is</em> with no warranty. Financial and governance data is derived from regulator filings and may contain errors, omissions, or outdated entries. Always verify important decisions against primary sources.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Corrections</h2>
      <p>If you spot an error on your organisation's listing, see the <button onClick={() => { window.history.pushState({}, "", "/claim"); window.dispatchEvent(new PopStateEvent("popstate")); }} className="text-emerald-600 hover:underline">Claim your listing</button> page or email <a href="mailto:corrections@openbenefacts.com" className="text-emerald-600 hover:underline">corrections@openbenefacts.com</a>.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Limitation of liability</h2>
      <p>OpenBenefacts shall not be liable for any indirect, incidental, or consequential damages arising from use of the platform or its data.</p>
    </StaticPageShell>
  );
}

function DataSourcesPage() {
  const sources = [
    { name: "Charities Regulator Ireland", desc: "Registered charities, trustees, financial returns", url: "https://www.charitiesregulator.ie", updated: "Monthly", count: "11,500+ charities" },
    { name: "Revenue Commissioners (CHY)", desc: "Tax-exempt charitable bodies with CHY numbers", url: "https://www.revenue.ie", updated: "Quarterly", count: "8,700+ entries" },
    { name: "Companies Registration Office (CRO)", desc: "Company filings, directors, annual returns", url: "https://www.cro.ie", updated: "Monthly", count: "15,000+ nonprofits" },
    { name: "Department of Education", desc: "Primary and post-primary school registers", url: "https://www.gov.ie/en/organisation/department-of-education", updated: "Annually", count: "4,000+ schools" },
    { name: "Department of Housing (AHBs)", desc: "Approved Housing Bodies register", url: "https://www.ahbregulator.ie", updated: "Quarterly", count: "450+ AHBs" },
    { name: "National Lottery Good Causes", desc: "Grants awarded via Good Causes funds", url: "https://www.lottery.ie/about/good-causes", updated: "Annually", count: "1,200+ grants/year" },
    { name: "HSE / Section 39", desc: "Health Service Executive grant recipients", url: "https://www.hse.ie", updated: "Annually", count: "1,523 recipients" },
    { name: "Pobal", desc: "Government programme management data", url: "https://www.pobal.ie", updated: "Annually", count: "€1.4B tracked" },
    { name: "Arts Council", desc: "Arts funding grants and programmes", url: "https://www.artscouncil.ie", updated: "Annually", count: "4,787 recipients" },
    { name: "Sport Ireland", desc: "Sports club and governing body funding", url: "https://www.sportireland.ie", updated: "Annually", count: "675 recipients" },
    { name: "data.gov.ie", desc: "Ireland's open data portal (CKAN API)", url: "https://data.gov.ie", updated: "Varies", count: "Multiple datasets" },
    { name: "Tusla", desc: "Child and Family Agency funding", url: "https://www.tusla.ie", updated: "Annually", count: "675 recipients" },
  ];

  return (
    <StaticPageShell title="Data Sources" subtitle="Everything on OpenBenefacts comes from public, primary sources.">
      <p className="mb-8">We ingest, clean, normalise, and archive data from the following Irish government and regulator sources. Our monthly archival pipeline ensures that historical data is preserved even if the original source is taken offline — filling the gap left when Benefacts was defunded in 2022.</p>

      <div className="not-prose grid md:grid-cols-2 gap-4 mb-10">
        {sources.map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-emerald-200 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-bold text-gray-900">{s.name}</h3>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">{s.updated}</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{s.desc}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{s.count}</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-medium">Source →</a>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">How we process data</h2>
      <p>Each month, our data analysts pull the latest data from CKAN APIs, regulator websites, and open data portals. They normalise organisation names (e.g. "CHILDANDFAMILY AGENCY" → "Child And Family Agency"), cross-reference identifiers (charity numbers, CHY numbers, CRO numbers), and link financial records to the organisations they describe. All raw downloads are archived to cold storage with SHA-256 hashes so researchers can verify that data hasn't been altered.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Missing a source?</h2>
      <p>If you know of a public dataset we should be ingesting, email <a href="mailto:data@openbenefacts.com" className="text-emerald-600 hover:underline">data@openbenefacts.com</a>. We prioritise sources by coverage, update frequency, and public interest value.</p>
    </StaticPageShell>
  );
}

function ClaimListingPage() {
  return (
    <StaticPageShell title="Claim your listing" subtitle="Update or correct your organisation's profile on OpenBenefacts.">
      <p>OpenBenefacts aggregates data from public Irish government sources. If you are a trustee, director, or authorised representative of a nonprofit listed here, you can request corrections, add missing information, or flag your listing as claimed.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">How it works</h2>
      <ol className="list-decimal pl-6 space-y-2">
        <li>Find your organisation in the <button onClick={() => { window.history.pushState({}, "", "/orgs"); window.dispatchEvent(new PopStateEvent("popstate")); }} className="text-emerald-600 hover:underline">directory</button>.</li>
        <li>Copy the URL of your profile page.</li>
        <li>Email <a href="mailto:claims@openbenefacts.com" className="text-emerald-600 hover:underline">claims@openbenefacts.com</a> from an address matching your organisation's domain, with the URL and the correction you'd like to make.</li>
        <li>We verify your authority and update the listing — usually within 5 working days.</li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What you can update</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Description, website, contact email, and social links</li>
        <li>Mission statement and areas of activity</li>
        <li>Corrections to board member data</li>
        <li>Logo and hero image</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What we can't change</h2>
      <p>We cannot alter financial data sourced from regulator filings (Charities Regulator, CRO). If those records contain errors, contact the source regulator directly — corrections will flow through on the next monthly sync.</p>

      <div className="not-prose mt-10 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-8 text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to claim?</h3>
        <p className="text-gray-600 mb-5">Email us from your organisation's verified domain.</p>
        <a href="mailto:claims@openbenefacts.com?subject=Claim%20listing%20request" className="inline-block px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors">Email claims@openbenefacts.com</a>
      </div>
    </StaticPageShell>
  );
}

// ===========================================================
// DONATION POPUP
// ===========================================================
function DonationPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if dismissed in last 30 days
    const dismissed = localStorage.getItem("ob_donate_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 30 * 86400000) return;

    // Show after 45 seconds on the site
    const timer = setTimeout(() => setShow(true), 45000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem("ob_donate_dismissed", String(Date.now()));
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={dismiss}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in">
        <button onClick={dismiss} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>

        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center">
            <Heart className="w-8 h-8 text-emerald-600" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Keep the money trail public</h2>

        <p className="text-gray-500 text-center text-sm leading-relaxed mb-2">
          OpenBenefacts tracks <span className="font-semibold text-gray-700">€14 billion</span> in nonprofit funding — for free, for everyone.
        </p>
        <p className="text-gray-500 text-center text-sm leading-relaxed mb-6">
          The original Benefacts was defunded in 2022. We rebuilt it, but we need your help to keep it alive. Even €5 makes a difference.
        </p>

        <a href="https://buy.stripe.com/test_00g00000000000000" target="_blank" rel="noopener noreferrer"
           className="block w-full text-center py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200 mb-3">
          Donate to OpenBenefacts
        </a>

        <button onClick={dismiss}
                className="block w-full text-center py-3 bg-gray-50 text-gray-500 font-medium rounded-xl hover:bg-gray-100 transition-colors text-sm">
          Not now, thank you
        </button>

        <p className="text-xs text-gray-300 text-center mt-4">OpenBenefacts is a nonprofit transparency project</p>
      </div>
    </div>
  );
}

// ===========================================================
// APP EXPORT
// ===========================================================
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
