import { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Search, Building2, Users, TrendingUp, DollarSign, ChevronRight, ArrowLeft, Eye, Star, Shield, Menu, X, MapPin, Hash, Landmark, GraduationCap, Heart, Briefcase, Globe, Filter, ChevronDown, ExternalLink, Info, BarChart3, FileText, Award, Zap, Database, ArrowRight, Layers, Check, CreditCard, LogIn, UserPlus, Crown, Sparkles, LogOut, AlertTriangle, Lock, ArrowUpDown, Bookmark, Share2, Copy, Code, Download } from "lucide-react";
import { supabase, fetchStats, fetchFunders, fetchOrganisations, fetchOrganisation, searchOrganisations, fetchSectorCounts, fetchCountyCounts, fetchDirectorBoards, fetchFunderGrants, fetchFunderGrantsByName, fetchSectorBenchmark } from "./supabase.js";
import { DATA } from "./data.js";

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
        React.createElement("button", { onClick: () => { this.setState({ hasError: false }); window.location.hash = ""; window.location.reload(); }, style: { background: "#059669", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer" } }, "Go Home")
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

  const ADMIN_EMAILS = ["mark@staydiasports.com", "mark@openbenefacts.com"];
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
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><span className="text-white font-extrabold text-2xl tracking-tight">OB</span></div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome to OpenBenefacts!</h2>
              <p className="text-gray-500 mt-2">Your 30-day Professional trial is now active. Here's how to get the most out of it:</p>
            </div>
            <div className="space-y-3 mb-6">
              {[
                { icon: Search, title: "Search & explore", desc: "Browse 36,803+ organizations by name, sector, or county" },
                { icon: BarChart3, title: "View full financials", desc: "Access multi-year trends, income breakdowns, and risk scores" },
                { icon: Bookmark, title: "Build your watchlist", desc: "Save organizations you're tracking and monitor changes" },
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
  const links = [["home","Dashboard"],["orgs","Organizations"],["funders","Funders"],["pricing","Pricing"],["api","API"],["about","About"]];

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav("home")}>
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center"><span className="text-white font-extrabold text-xs tracking-tight">OB</span></div>
            <span className="font-bold text-gray-900">Open</span><span className="font-bold text-emerald-600">Benefacts</span>
            <span className="hidden sm:inline text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium ml-1">NONPROFIT TRANSPARENCY</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {links.map(([key, label]) => (
              <button key={key} onClick={() => nav(key)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${page === key ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative" ref={avatarRef}>
                <button onClick={() => setAvatarOpen(!avatarOpen)} className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm flex items-center justify-center hover:bg-emerald-200">
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
              <>
                <button onClick={() => { setShowAuth(true); setAuthMode("login"); }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium hidden sm:block">Sign in</button>
                <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700">Sign up free</button>
              </>
            )}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-600">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-1">
          {links.map(([key, label]) => (<button key={key} onClick={() => nav(key)} className={`block w-full text-left px-3 py-2 rounded-lg text-sm ${page === key ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-600"}`}>{label}</button>))}
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero — left-aligned Candid-style layout */}
      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 mb-12 pt-4">
        {/* Left: copy + search */}
        <div className="flex-1 max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-5 text-xs font-semibold tracking-wide uppercase">
            <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full">The gap in Irish transparency</span>
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">Now filled</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 mb-5 leading-[1.1] tracking-tight">
            Tracking where Ireland's <span className="text-emerald-600">€14 billion</span> in nonprofit funding goes
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 mb-6 leading-relaxed max-w-xl">
            Search {orgCount.toLocaleString()} organisations and {financialCount.toLocaleString()} financial records. Follow the money from government to nonprofits — open to everyone.
          </p>
          <form onSubmit={e => { e.preventDefault(); doSearch(); }} className="relative max-w-lg mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Search by name, sector, or county..." value={heroSearch} onChange={e => setHeroSearch(e.target.value)} className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm bg-white" />
          </form>
          <div className="flex flex-wrap gap-2">
            {chips.map(c => <button key={c} onClick={() => doSearch(c)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors">{c}</button>)}
          </div>
        </div>

        {/* Right: abstract illustration SVG */}
        <div className="hidden lg:block flex-shrink-0 w-[420px] h-[380px] relative">
          <svg viewBox="0 0 420 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            {/* Background blobs */}
            <circle cx="210" cy="190" r="160" fill="#ecfdf5" />
            <circle cx="310" cy="120" r="80" fill="#d1fae5" opacity="0.6" />
            <circle cx="120" cy="280" r="60" fill="#d1fae5" opacity="0.4" />

            {/* Money flow lines */}
            <path d="M60 190 Q140 100 210 160 Q280 220 360 140" stroke="#059669" strokeWidth="3" fill="none" strokeDasharray="8 4" opacity="0.5" />
            <path d="M80 240 Q160 170 230 210 Q300 250 380 190" stroke="#0d9488" strokeWidth="2.5" fill="none" strokeDasharray="6 4" opacity="0.4" />
            <path d="M40 300 Q130 230 210 270 Q290 310 370 250" stroke="#10b981" strokeWidth="2" fill="none" strokeDasharray="5 3" opacity="0.3" />

            {/* Government node */}
            <rect x="30" y="155" width="70" height="70" rx="16" fill="#059669" />
            <text x="65" y="185" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">GOV</text>
            <text x="65" y="200" textAnchor="middle" fill="white" fontSize="8" opacity="0.8">€14B</text>

            {/* Org nodes */}
            <rect x="170" y="80" width="80" height="55" rx="14" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="210" y="103" textAnchor="middle" fill="#374151" fontSize="9" fontWeight="600">Education</text>
            <text x="210" y="118" textAnchor="middle" fill="#059669" fontSize="9" fontWeight="700">€2.7B</text>

            <rect x="170" y="165" width="80" height="55" rx="14" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="210" y="188" textAnchor="middle" fill="#374151" fontSize="9" fontWeight="600">Health</text>
            <text x="210" y="203" textAnchor="middle" fill="#059669" fontSize="9" fontWeight="700">€37.7B</text>

            <rect x="170" y="250" width="80" height="55" rx="14" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="210" y="273" textAnchor="middle" fill="#374151" fontSize="9" fontWeight="600">Housing</text>
            <text x="210" y="288" textAnchor="middle" fill="#059669" fontSize="9" fontWeight="700">€970M</text>

            {/* Recipient nodes */}
            <circle cx="340" cy="100" r="28" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="340" y="98" textAnchor="middle" fill="#374151" fontSize="7" fontWeight="600">1,523</text>
            <text x="340" y="108" textAnchor="middle" fill="#9ca3af" fontSize="6">orgs</text>

            <circle cx="355" cy="195" r="24" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="355" y="193" textAnchor="middle" fill="#374151" fontSize="7" fontWeight="600">272</text>
            <text x="355" y="203" textAnchor="middle" fill="#9ca3af" fontSize="6">orgs</text>

            <circle cx="340" cy="280" r="22" fill="white" stroke="#d1d5db" strokeWidth="1.5" />
            <text x="340" y="278" textAnchor="middle" fill="#374151" fontSize="7" fontWeight="600">1,066</text>
            <text x="340" y="288" textAnchor="middle" fill="#9ca3af" fontSize="6">orgs</text>

            {/* Connection lines */}
            <line x1="100" y1="190" x2="170" y2="107" stroke="#059669" strokeWidth="2" opacity="0.3" />
            <line x1="100" y1="190" x2="170" y2="192" stroke="#059669" strokeWidth="2.5" opacity="0.4" />
            <line x1="100" y1="190" x2="170" y2="277" stroke="#059669" strokeWidth="2" opacity="0.3" />
            <line x1="250" y1="107" x2="312" y2="100" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="250" y1="192" x2="331" y2="195" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="250" y1="277" x2="318" y2="280" stroke="#d1d5db" strokeWidth="1.5" />

            {/* Sparkle accents */}
            <circle cx="135" cy="130" r="3" fill="#059669" opacity="0.4" />
            <circle cx="295" cy="150" r="2.5" fill="#0d9488" opacity="0.3" />
            <circle cx="380" cy="240" r="3" fill="#10b981" opacity="0.3" />
            <circle cx="150" cy="310" r="2" fill="#059669" opacity="0.25" />
          </svg>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Organizations", value: orgCount.toLocaleString(), sub: "Charities, AHBs, schools, clubs", icon: Building2, color: "emerald" },
          { label: "Financial Records", value: financialCount.toLocaleString(), sub: "Income, expenditure, assets", icon: FileText, color: "blue" },
          { label: "Funding Links", value: fundingLinks.toLocaleString(), sub: "State → nonprofit relationships", icon: Zap, color: "purple" },
          { label: "State Funders", value: funderData.length || 14, sub: `${totalRecipients.toLocaleString()} orgs funded`, icon: Landmark, color: "teal" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
            <s.icon className={`w-7 h-7 text-${s.color}-500 mb-2`} />
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm font-medium text-gray-700">{s.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
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
        {/* Sector Distribution */}
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
        {/* Top Organizations by Income */}
        {siteStats.topRecipients && siteStats.topRecipients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Largest Organizations</h3>
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
            <div className="text-xs font-medium text-emerald-600 mb-1">Featured Organization</div>
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
          {topFunders.map((f, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <h3 className="font-semibold text-gray-900 text-sm mb-2">{f.name}</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold text-gray-900">{fmt(f.total)}</span>
                <span className="text-gray-400">{(f.recipients || 0).toLocaleString()} recipients</span>
                <span className="text-gray-400">{(f.programmes?.length || 0)} programmes</span>
              </div>
            </div>
          ))}
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
                  <div className="text-xs text-gray-400">{orgCount?.toLocaleString()} organizations</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA — narrative-driven */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-2xl p-8 sm:p-10 text-center text-white">
        <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">The money trail is back</p>
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">€14 billion deserves oversight.</h2>
        <p className="text-gray-300 max-w-2xl mx-auto mb-6">Benefacts is gone. OpenBenefacts is here — with full financials, AI risk scores, funder mapping, and due diligence reports. Free to search. Pro plans for professionals who need the full picture.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={() => setPage("pricing")} className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-400 transition-colors">Start free trial</button>
          <button onClick={() => setPage("orgs")} className="px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors border border-white/20">Browse {orgCount.toLocaleString()} organisations</button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// ORGANIZATIONS PAGE (with working filters + search)
// ===========================================================
function OrgsPage({ setPage, initialSearch, setInitialSearch, initialSector, setInitialSector, watchlist }) {
  const { tier, requirePro } = useAuth();
  const isProfessional = tier === "professional" || tier === "enterprise";
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState(initialSearch || "");
  const [sortBy, setSortBy] = useState("income");
  const [showFilters, setShowFilters] = useState(false);
  const [sector, setSector] = useState("");
  const [county, setCounty] = useState("");
  const [govForm, setGovForm] = useState("");
  const [incomeRange, setIncomeRange] = useState("");
  const [sectors, setSectors] = useState([]);
  const [counties, setCounties] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const pageSize = 30;
  const timer = useRef(null);

  useEffect(() => {
    fetchSectorCounts().then(d => setSectors((d || []).slice(0, 8))).catch(() => {});
    fetchCountyCounts().then(d => {
      // Normalise county names and deduplicate
      const raw = (d || []).map(c => ({ ...c, county: normaliseCounty(c.county) })).filter(c => c.county);
      const merged = {};
      raw.forEach(c => { merged[c.county] = (merged[c.county] || 0) + (c.org_count || 1); });
      const sorted = Object.entries(merged).sort((a, b) => b[1] - a[1]).map(([county]) => county);
      setCounties(sorted);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSearch) { setSearch(initialSearch); setInitialSearch(""); }
  }, [initialSearch]);

  useEffect(() => {
    if (initialSector) { setSector(initialSector); setInitialSector(""); setShowFilters(true); }
  }, [initialSector]);

  const INCOME_RANGES = [
    { label: "All", value: "", min: null, max: null },
    { label: "Under €100K", value: "0-100k", min: 0, max: 100000 },
    { label: "€100K – €1M", value: "100k-1m", min: 100000, max: 1000000 },
    { label: "€1M – €10M", value: "1m-10m", min: 1000000, max: 10000000 },
    { label: "€10M – €100M", value: "10m-100m", min: 10000000, max: 100000000 },
    { label: "Over €100M", value: "100m+", min: 100000000, max: null },
  ];

  const resultsRef = useRef(null);
  const isFirstLoad = useRef(true);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const sortMap = { income: "gross_income", employees: "employees", stateFunding: "total_grant_amount", name: "name" };
      const range = INCOME_RANGES.find(r => r.value === incomeRange);
      const result = await fetchOrganisations({
        page: pageNum,
        pageSize,
        search: search.trim(),
        sector,
        county,
        governingForm: govForm,
        minIncome: range?.min,
        maxIncome: range?.max,
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
  }, [search, pageNum, sector, county, govForm, incomeRange, sortBy]);

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

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500">Irish nonprofits with real government data</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{total.toLocaleString()} results</span>
          {isProfessional ? (
            <button onClick={() => {
              const headers = ["Name","Sector","County","Type","Charity Number","CRO Number","Gross Income","Gross Expenditure","Employees"];
              const csvRows = [headers.join(",")];
              orgs.forEach(o => {
                csvRows.push([
                  `"${(o.name || "").replace(/"/g, '""')}"`,
                  `"${o.sector || ""}"`,
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

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search organizations..." value={search} onChange={e => handleSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
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
        <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-3 rounded-xl border font-medium text-sm flex items-center gap-2 ${showFilters ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <Filter className="w-4 h-4" /> Filters {(sector || county || govForm || incomeRange) ? <span className="w-2 h-2 bg-emerald-500 rounded-full" /> : null}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 grid sm:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Sector</label>
            <select value={sector} onChange={e => { setSector(e.target.value); setPageNum(1); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={typeof s === "string" ? s : s.sector} value={typeof s === "string" ? s : s.sector}>{typeof s === "string" ? s : s.sector}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">County</label>
            <select value={county} onChange={e => { setCounty(e.target.value); setPageNum(1); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Counties</option>
              {counties.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Legal Type</label>
            <select value={govForm} onChange={e => { setGovForm(e.target.value); setPageNum(1); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Types</option>
              {["Company Limited by Guarantee","Trust","Designated Activity Company","Unincorporated Association","Friendly Society","Royal Charter Governance","Statute / Statutory Instrument"].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Income Range</label>
            <select value={incomeRange} onChange={e => { setIncomeRange(e.target.value); setPageNum(1); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {INCOME_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {(sector || county || govForm || incomeRange) && <button onClick={() => { setSector(""); setCounty(""); setGovForm(""); setIncomeRange(""); setPageNum(1); }} className="text-sm text-emerald-600 hover:underline sm:col-span-4">Clear all filters</button>}
        </div>
      )}

      {/* Sort buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["income","Income ↓"],["employees","Employees ↓"],["stateFunding","State Funding ↓"],["name","Name A-Z"]].map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${sortBy === key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>Sort: {label}</button>
        ))}
      </div>

      {/* Results */}
      {loading ? <Spinner /> : orgs.length === 0 ? <EmptyState icon={Building2} title="No organizations found" sub="Try adjusting your search or filters" /> : (
        <>
          <div className="space-y-2">
            {orgs.map((org, i) => (
              <div key={org.id || i} className="w-full bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-emerald-100 transition-all flex items-center justify-between">
                <button onClick={() => setPage(`org:${org.id}`)} className="flex-1 min-w-0 text-left">
                  <h3 className="font-semibold text-gray-900 truncate">{cleanName(org.name)}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{[clean(org.sector), clean(org.county), clean(org.governing_form)].filter(Boolean).join(" · ") || "Registered nonprofit"}</p>
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
      <button onclick="document.getElementById('print-bar').style.display='none';window.print();setTimeout(()=>document.getElementById('print-bar').style.display='flex',500)" style="background:white;color:#059669;border:none;padding:8px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px">Save as PDF</button>
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
  if (!org) return <ErrorState message="Organization not found" />;

  // Embed mode: compact org snapshot for embedding in articles
  if (embed) {
    const latest = org.financials?.[0];
    const risk = computeRiskScore(org);
    const orgUrl = `${window.location.origin}#org:${org.id}`;
    return (
      <div className="p-5 bg-white min-h-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center"><span className="text-white font-extrabold text-[8px] tracking-tight">OB</span></div>
          <span className="font-bold text-sm text-gray-900">OpenBenefacts</span>
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

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{cleanName(org.name)}</h1>
              <p className="text-emerald-100 mt-1">{[clean(org.county), clean(org.sector)].filter(Boolean).join(" · ")}</p>
              <div className="flex flex-wrap gap-3 mt-3">
                {clean(org.charity_number) && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">RCN {org.charity_number}</span>}
                {clean(org.governing_form) && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">{org.governing_form}</span>}
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
                    <h2>Organization Details</h2><table>${fields.map(f => `<tr><td style="color:#999;width:160px">${f.label}</td><td>${f.value}${f.sub?" — "+f.sub:""}</td></tr>`).join("")}</table>
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
          const orgUrl = `${window.location.origin}#org:${org.id}`;
          const orgEmbed = `<iframe src="${orgUrl}&embed=true" width="100%" height="420" frameborder="0" style="border:1px solid #e5e7eb;border-radius:12px"></iframe>`;
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
        <div className="border-b border-gray-100">
          <div className="flex gap-0">
            {["overview","governance","financials","details"].map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === "overview" && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Organization Info</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {fields.slice(0, 6).map((f, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-50">
                    <div className="text-xs text-gray-400 font-medium">{f.label}</div>
                    <div className="text-sm text-gray-900 mt-0.5">{f.value}{f.sub ? ` — ${f.sub}` : ""}</div>
                  </div>
                ))}
              </div>

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

              {/* Funding received */}
              {org.grants && org.grants.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">State Funding Received</h3>
                  <div className="space-y-2">
                    {org.grants.slice(0, 5).map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{g.funders?.name || g.funder_name || "Government"}</div>
                          <div className="text-xs text-gray-400">{g.programme || ""} {g.year ? `· ${g.year}` : ""}</div>
                        </div>
                        {g.amount > 0 && <div className="text-sm font-semibold text-emerald-600">{fmt(g.amount)}</div>}
                      </div>
                    ))}
                    {org.grants.length > 5 && <p className="text-xs text-gray-400 text-center">{org.grants.length - 5} more funding records</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "governance" && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Board Members & Trustees</h3>
              {org.boardMembers && org.boardMembers.length > 0 ? (
                <div className="space-y-2">
                  {org.boardMembers.map((bm, i) => {
                    const director = bm.directors;
                    if (!director) return null;
                    const isExpanded = expandedDirector === director.id;
                    const otherBoards = directorBoards[director.id] || [];
                    return (
                      <div key={i} className="rounded-lg border border-gray-100 overflow-hidden">
                        <button onClick={() => handleExpandDirector(director.id)} className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">{director.name.charAt(0)}</div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{director.name}</div>
                              <div className="text-xs text-gray-400">{bm.role || "Trustee"}{bm.start_date ? ` · Since ${bm.start_date.slice(0, 4)}` : ""}</div>
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
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
                  <p className="text-xs text-gray-400 mt-3">Source: Charities Regulator public register. Click a name to see cross-directorships.</p>

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
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No board member data available for this organization.</p>
                  <p className="text-xs text-gray-400 mt-1">Governance data is sourced from the Charities Regulator and CRO.</p>
                </div>
              )}
            </div>
          )}

          {tab === "financials" && (
            <div>
              <p className="text-gray-500 text-sm mb-4">Financial data sourced from Charities Regulator and CRO filings.</p>
              {org.financials && org.financials.length > 0 ? (
                <div className="mb-6">
                  <div className="bg-emerald-50 rounded-xl p-4 mb-4 flex items-center justify-between">
                    <p className="text-sm text-emerald-700 font-medium">Latest Annual Return ({org.financials[0].year || "Most Recent"})</p>
                    {org.financials.length > 1 && <span className="text-xs text-emerald-600">{org.financials.length} years on file</span>}
                  </div>
                  {/* YoY helper for change indicators */}
                  {(() => {
                    const cur = org.financials[0];
                    const prev = org.financials.length >= 2 ? org.financials[1] : null;
                    const yoyBadge = (curVal, prevVal) => {
                      if (!prev || curVal == null || prevVal == null || prevVal === 0) return null;
                      const pct = ((curVal - prevVal) / Math.abs(prevVal)) * 100;
                      if (Math.abs(pct) < 0.5) return <span className="text-[10px] text-gray-400 ml-1">unchanged</span>;
                      const up = pct > 0;
                      return <span className={`text-[10px] ml-1 font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs {prev.year || "prior"}</span>;
                    };
                    return (
                      <div className="grid sm:grid-cols-2 gap-4 mb-6">
                        {cur.gross_income != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Gross Income</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(cur.gross_income)} {yoyBadge(cur.gross_income, prev?.gross_income)}</div></div>}
                        {cur.gross_expenditure != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Gross Expenditure</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(cur.gross_expenditure)} {yoyBadge(cur.gross_expenditure, prev?.gross_expenditure)}</div></div>}
                        {cur.total_assets != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Total Assets</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(cur.total_assets)} {yoyBadge(cur.total_assets, prev?.total_assets)}</div></div>}
                        {cur.employees != null && cur.employees > 0 && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Employees</div><div className="text-xl font-bold text-gray-900 mt-1">{cur.employees.toLocaleString()} {yoyBadge(cur.employees, prev?.employees)}</div></div>}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-6 text-center mb-6">
                  <p className="text-gray-500">No financial records filed yet for this organization.</p>
                </div>
              )}
              {/* FREE: Multi-year trends + year-by-year table */}
              <div className="space-y-6">
                  {/* Multi-year trend chart with summary */}
                  {org.financials && org.financials.length > 1 && (() => {
                    const sorted = [...org.financials].reverse(); // oldest first
                    const trendData = sorted.map(f => ({
                      year: f.year || "—",
                      Income: f.gross_income || 0,
                      Expenditure: f.gross_expenditure || 0,
                    }));
                    // Compute overall CAGR (Compound Annual Growth Rate) for income
                    const first = sorted[0]?.gross_income;
                    const last = sorted[sorted.length - 1]?.gross_income;
                    const nYears = sorted.length - 1;
                    let cagrLabel = null;
                    if (first > 0 && last > 0 && nYears >= 2) {
                      const cagr = (Math.pow(last / first, 1 / nYears) - 1) * 100;
                      const dir = cagr >= 0 ? "+" : "";
                      cagrLabel = `${dir}${cagr.toFixed(1)}% CAGR over ${nYears + 1} years`;
                    }
                    // Compute surplus/deficit trend
                    const surplusYears = sorted.filter(f => f.gross_income > 0 && f.gross_expenditure > 0 && f.gross_income >= f.gross_expenditure).length;
                    const deficitYears = sorted.filter(f => f.gross_income > 0 && f.gross_expenditure > 0 && f.gross_expenditure > f.gross_income).length;
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-700">Financial Trends ({trendData.length} years)</h4>
                          {cagrLabel && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${last >= first ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{cagrLabel}</span>}
                        </div>
                        {(surplusYears > 0 || deficitYears > 0) && (
                          <p className="text-[11px] text-gray-500 mb-4">Surplus in {surplusYears} of {surplusYears + deficitYears} years{deficitYears > 0 ? ` · deficit in ${deficitYears}` : ""}</p>
                        )}
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={trendData}>
                            <XAxis dataKey="year" fontSize={11} />
                            <YAxis tickFormatter={v => v >= 1e6 ? `€${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `€${(v/1e3).toFixed(0)}K` : `€${v}`} fontSize={10} />
                            <Tooltip formatter={v => fmt(v)} />
                            <Bar dataKey="Income" fill="#059669" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Expenditure" fill="#0891b2" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center justify-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-emerald-600" /> Income</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-cyan-600" /> Expenditure</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* PRO: Enhanced multi-year trend analysis with surplus/deficit area + asset line */}
                  {isPro && org.financials && org.financials.length > 2 && (() => {
                    const sorted = [...org.financials].reverse();
                    const areaData = sorted.map(f => {
                      const income = f.gross_income || 0;
                      const expend = f.gross_expenditure || 0;
                      return { year: f.year || "—", Income: income, Expenditure: expend, Surplus: Math.max(0, income - expend), Deficit: Math.max(0, expend - income), Assets: f.total_assets || 0 };
                    });
                    const hasAssets = areaData.some(d => d.Assets > 0);
                    // Compute volatility (coefficient of variation of income)
                    const incomes = sorted.map(f => f.gross_income).filter(v => v > 0);
                    const avgInc = incomes.reduce((a,b) => a+b, 0) / incomes.length;
                    const stdDev = Math.sqrt(incomes.reduce((s, v) => s + Math.pow(v - avgInc, 2), 0) / incomes.length);
                    const volatility = avgInc > 0 ? ((stdDev / avgInc) * 100).toFixed(0) : 0;
                    const volatilityLabel = volatility < 15 ? "Stable" : volatility < 30 ? "Moderate" : "Volatile";
                    const volatilityColor = volatility < 15 ? "emerald" : volatility < 30 ? "amber" : "red";

                    return (
                      <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Crown className="w-4 h-4 text-emerald-600" /> Multi-Year Trend Analysis</h4>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full bg-${volatilityColor}-100 text-${volatilityColor}-700`}>Income volatility: {volatilityLabel} ({volatility}% CV)</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-4">{areaData.length} years · Surplus/deficit overlay with {hasAssets ? "asset position" : "trend lines"}</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={areaData}>
                            <defs>
                              <linearGradient id="surplusGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="deficitGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="year" fontSize={11} />
                            <YAxis tickFormatter={v => v >= 1e6 ? `€${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `€${(v/1e3).toFixed(0)}K` : `€${v}`} fontSize={10} />
                            <Tooltip formatter={v => fmt(v)} />
                            <Area type="monotone" dataKey="Surplus" stroke="#059669" fill="url(#surplusGrad)" strokeWidth={0} />
                            <Area type="monotone" dataKey="Deficit" stroke="#dc2626" fill="url(#deficitGrad)" strokeWidth={0} />
                            <Line type="monotone" dataKey="Income" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: "#059669" }} />
                            <Line type="monotone" dataKey="Expenditure" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 3, fill: "#0891b2" }} />
                            {hasAssets && <Line type="monotone" dataKey="Assets" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 2, fill: "#7c3aed" }} />}
                          </AreaChart>
                        </ResponsiveContainer>
                        <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-emerald-600" /> Income</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-cyan-600" /> Expenditure</div>
                          {hasAssets && <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-1 rounded bg-purple-600" style={{borderTop: "2px dashed #7c3aed"}} /> Assets</div>}
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-emerald-200" /> Surplus</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-3 rounded bg-red-200" /> Deficit</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Year-by-year table with YoY changes — FREE for everyone */}
                  {org.financials && org.financials.length > 1 && (() => {
                    const yoyPct = (cur, prev) => {
                      if (cur == null || prev == null || prev === 0) return null;
                      return ((cur - prev) / Math.abs(prev)) * 100;
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
                            <th className="text-left py-2 pr-3">Year</th><th className="text-right py-2 px-2">Income</th><th className="text-right py-2 px-1 text-[10px]">YoY</th><th className="text-right py-2 px-2">Expenditure</th><th className="text-right py-2 px-1 text-[10px]">YoY</th><th className="text-right py-2 px-2">Assets</th><th className="text-right py-2 pl-2">Employees</th>
                          </tr></thead>
                          <tbody>
                            {org.financials.map((f, i) => {
                              const prev = org.financials[i + 1];
                              return (
                              <tr key={i} className={`border-b border-gray-100 ${i === 0 ? "font-semibold" : ""}`}>
                                <td className="py-2 pr-3 text-gray-700">{f.year || "—"}</td>
                                <td className="py-2 px-2 text-right text-gray-900">{f.gross_income != null ? fmt(f.gross_income) : "—"}</td>
                                {yoyCell(prev ? yoyPct(f.gross_income, prev.gross_income) : null)}
                                <td className="py-2 px-2 text-right text-gray-900">{f.gross_expenditure != null ? fmt(f.gross_expenditure) : "—"}</td>
                                {yoyCell(prev ? yoyPct(f.gross_expenditure, prev.gross_expenditure) : null)}
                                <td className="py-2 px-2 text-right text-gray-900">{f.total_assets != null ? fmt(f.total_assets) : "—"}</td>
                                <td className="py-2 pl-2 text-right text-gray-900">{f.employees > 0 ? f.employees.toLocaleString() : "—"}</td>
                              </tr>);
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>);
                  })()}
              </div>

              {/* Income source breakdown — FREE for everyone */}
              <div className="mt-6 space-y-6">

                  {/* Income source breakdown */}
                  {org.financials && org.financials[0] && (() => {
                    const latest = org.financials[0];
                    const totalIncome = latest.gross_income || 0;
                    const grantTotal = org.grants ? org.grants.filter(g => g.year === latest.year || !g.year).reduce((s, g) => s + (g.amount || 0), 0) : 0;
                    const statePct = totalIncome > 0 ? Math.min(100, Math.round((grantTotal / totalIncome) * 100)) : 0;
                    const otherPct = 100 - statePct;
                    if (totalIncome === 0) return null;
                    const breakdownData = [
                      { name: "State Funding", value: statePct, fill: "#059669" },
                      { name: "Other Income", value: otherPct, fill: "#6366f1" },
                    ];
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Income Sources ({latest.year || "Latest"})</h4>
                        <div className="flex items-center gap-8">
                          <div className="w-32 h-32 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={breakdownData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                                  {breakdownData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-3 flex-1">
                            <div>
                              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded bg-emerald-600" /><span className="text-sm font-medium text-gray-700">State Funding</span><span className="text-sm font-bold text-gray-900 ml-auto">{statePct}%</span></div>
                              <div className="w-full h-2 bg-gray-200 rounded-full"><div className="h-2 bg-emerald-600 rounded-full" style={{ width: `${statePct}%` }} /></div>
                              <p className="text-xs text-gray-400 mt-0.5">{fmt(grantTotal)} from {org.grants?.length || 0} grant records</p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded bg-indigo-500" /><span className="text-sm font-medium text-gray-700">Other Income</span><span className="text-sm font-bold text-gray-900 ml-auto">{otherPct}%</span></div>
                              <div className="w-full h-2 bg-gray-200 rounded-full"><div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${otherPct}%` }} /></div>
                              <p className="text-xs text-gray-400 mt-0.5">Donations, earned income, other sources</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

              </div>

              {/* PRO: Sector benchmarking */}
              <div className="relative mt-6">
                {!isPro && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                    <Lock className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="font-semibold text-gray-700">Sector benchmarking & ranking</p>
                    <p className="text-sm text-gray-500 mb-3">See how this org compares — available on Pro</p>
                    <button onClick={() => requirePro("Sector Benchmarking")} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">Upgrade to Pro — €29/mo</button>
                  </div>
                )}
                <div className="space-y-6">
                  {/* Sector Benchmarking */}
                  {benchmark && org.financials?.[0]?.gross_income > 0 && (
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Sector Benchmarking</h4>
                      <p className="text-xs text-gray-400 mb-4">Compared to {benchmark.orgCount.toLocaleString()} organisations in {benchmark.sectorName}</p>
                      {(() => {
                        const income = org.financials[0].gross_income;
                        const expend = org.financials[0].gross_expenditure || 0;
                        const incomeRatio = benchmark.medianIncome > 0 ? income / benchmark.medianIncome : 0;
                        const incomePctile = incomeRatio > 3 ? "top 5%" : incomeRatio > 1.5 ? "above median" : incomeRatio > 0.8 ? "near median" : "below median";
                        const spendRatio = income > 0 ? ((expend / income) * 100).toFixed(0) : 0;
                        const sectorSpendRatio = benchmark.avgIncome > 0 ? ((benchmark.avgExpenditure / benchmark.avgIncome) * 100).toFixed(0) : 0;
                        return (
                          <div className="grid sm:grid-cols-3 gap-4">
                            <div className="text-center p-3 bg-white rounded-lg">
                              <div className="text-xs text-gray-400 mb-1">Income vs Sector Median</div>
                              <div className={`text-lg font-bold ${incomeRatio >= 1 ? "text-emerald-600" : "text-amber-600"}`}>{incomeRatio >= 10 ? "10x+" : `${incomeRatio.toFixed(1)}x`}</div>
                              <div className="text-xs text-gray-500 capitalize">{incomePctile}</div>
                              <div className="text-[10px] text-gray-400 mt-1">Median: {fmt(benchmark.medianIncome)}</div>
                            </div>
                            <div className="text-center p-3 bg-white rounded-lg">
                              <div className="text-xs text-gray-400 mb-1">Spending Efficiency</div>
                              <div className="text-lg font-bold text-gray-900">{spendRatio}%</div>
                              <div className="text-xs text-gray-500">of income spent</div>
                              <div className="text-[10px] text-gray-400 mt-1">Sector avg: {sectorSpendRatio}%</div>
                            </div>
                            <div className="text-center p-3 bg-white rounded-lg">
                              <div className="text-xs text-gray-400 mb-1">Sector Rank</div>
                              <div className="text-lg font-bold text-gray-900">{incomePctile === "top 5%" ? "Top 5%" : incomePctile === "above median" ? "Top 25%" : incomePctile === "near median" ? "Middle 50%" : "Bottom 25%"}</div>
                              <div className="text-xs text-gray-500">by income</div>
                              <div className="text-[10px] text-gray-400 mt-1">{benchmark.orgCount} orgs in sector</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                </div>
              </div>
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
  const sorted = useMemo(() => [...funderData].sort((a, b) => (b.total || 0) - (a.total || 0)), []);
  const totalFunding = funderData.reduce((s, f) => s + (f.total || 0), 0);
  const totalProgs = funderData.reduce((s, f) => s + (f.programmes?.length || 0), 0);
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
        <p className="text-gray-500">{funderData.length} funders distributing {fmt(totalFunding)} across {totalProgs} programmes</p>
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
              <div className="flex items-center gap-4">
                <button onClick={() => handleFunderClick(f)} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                  {selectedFunder?.name === f.name ? "Hide" : "View"} Recipients <ChevronDown className={`w-3 h-3 transition-transform ${selectedFunder?.name === f.name ? "rotate-180" : ""}`} />
                </button>
                <button onClick={() => { const idx = funderData.indexOf(f); setPage(`follow/${getFunderSlug(idx >= 0 ? idx : sorted.indexOf(f))}`); }} className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> Follow the Money
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
  const shareUrl = `${window.location.origin}#follow/${slug}`;
  const embedCode = `<iframe src="${shareUrl}&embed=true" width="100%" height="500" frameborder="0" style="border:1px solid #e5e7eb;border-radius:12px"></iframe>`;

  const copyToClip = (text, type) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(type); setTimeout(() => setCopied(null), 2000); });
  };

  if (!funder) return <EmptyState icon={Landmark} title="Funder not found" sub="Select a funder from the directory" />;

  // Embed mode: minimal chrome
  if (embed) {
    return (
      <div className="p-4 bg-white min-h-screen">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center"><span className="text-white font-extrabold text-[8px] tracking-tight">OB</span></div>
          <span className="font-bold text-sm text-gray-900">Follow the Money</span>
          <span className="text-xs text-gray-400">· openbenefacts.vercel.app</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{funder.name}</h2>
        <p className="text-xs text-gray-500 mb-4">{fmt(funder.total)} distributed to {(funder.recipients || 0).toLocaleString()} organisations</p>
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
        <p className="text-gray-300 text-sm">Distributing <span className="text-emerald-400 font-bold">{fmt(funder.total)}</span> to <span className="font-bold">{(funder.recipients || 0).toLocaleString()}</span> organisations across <span className="font-bold">{(funder.programmes?.length || 0)}</span> programmes</p>
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
          <a href="mailto:mark@openbenefacts.com?subject=Foundation%20Pilot%20Programme" className="px-8 py-3.5 border-2 border-emerald-600 text-emerald-700 rounded-xl font-semibold text-lg hover:bg-emerald-50 transition-colors">Request Pilot Access</a>
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
        <a href="mailto:mark@openbenefacts.com?subject=Foundation%20Pilot%20Programme&body=Hi%20Mark%2C%0A%0AWe%27re%20interested%20in%20the%20Foundation%20Pilot%20Programme%20for%20OpenBenefacts.%0A%0AFoundation%20name%3A%20%0AApprox.%20grant%20applications%20reviewed%20per%20year%3A%20%0A%0AThanks" className="inline-block px-8 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors">Apply for the Pilot</a>
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

  const embedExample = `<iframe src="${window.location.origin}#follow/hse&embed=true"\n  width="100%" height="500" frameborder="0"\n  style="border:1px solid #e5e7eb;border-radius:12px">\n</iframe>`;
  const citationExample = `"[Organisation Name]," OpenBenefacts, accessed ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}, ${window.location.origin}#org:[id]`;

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
        <a href="mailto:mark@openbenefacts.com?subject=Media%20Enquiry" className="inline-block px-8 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors">Contact the Data Team</a>
        <p className="text-sm text-gray-500 mt-3">mark@openbenefacts.com</p>
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
          <a href="mailto:mark@openbenefacts.com?subject=CSR%20Team%20Enquiry" className="px-8 py-3.5 border-2 border-emerald-600 text-emerald-700 rounded-xl font-semibold text-lg hover:bg-emerald-50 transition-colors">Talk to Us</a>
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
    { name: "Free", price: 0, desc: "Genuinely useful transparency", features: [`Browse ${formattedCount} organizations`,"5-year financial trend charts","Year-by-year comparison tables","Board member & cross-directorships","State funding received","AI risk score (summary)","Full search & filters"], cta: "Get Started" },
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-3">About OpenBenefacts</h1>
      <p className="text-lg text-gray-500 mb-8">Bringing transparency to Ireland's nonprofit sector</p>
      <div className="prose prose-gray max-w-none space-y-4">
        <p>OpenBenefacts is a modern, open-data platform that maps the funding relationships between government bodies, philanthropic organisations, and Ireland's {orgCount.toLocaleString()} registered nonprofits. We are the successor to Benefacts, which closed in 2022, leaving a four-year gap in Irish nonprofit transparency.</p>
        <p>Our mission is to make nonprofit funding data accessible, searchable, and transparent — helping donors, researchers, journalists, policymakers, and the public understand where money flows in Ireland's charitable sector.</p>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Data Sources</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { name: "Charities Regulator", desc: "Charity register, annual returns, financials", records: "12,000+", icon: Shield },
          { name: "Companies Registration Office", desc: "Company directors, legal status, incorporation", records: "25,000+", icon: Building2 },
          { name: "Revenue Commissioners", desc: "CHY numbers, tax-exempt status", records: "10,000+", icon: Landmark },
          { name: "Government Estimates", desc: "Departmental spending allocations", records: "Annual", icon: FileText },
          { name: "HSE Section 38/39", desc: "Health service funding to nonprofits", records: "1,500+", icon: Heart },
          { name: "Tusla Section 56", desc: "Child & family service grants", records: "500+", icon: Users },
          { name: "Arts Council", desc: "Arts organisation funding decisions", records: "2,000+", icon: Award },
          { name: "Sport Ireland", desc: "NGB allocations and programme funding", records: "500+", icon: Zap },
          { name: "Pobal", desc: "Community and social programme data", records: "3,000+", icon: Globe },
          { name: "EU Structural Funds", desc: "European funding to Irish nonprofits", records: "Varies", icon: Star },
          { name: "Local Authorities", desc: "31 county/city council grants", records: "1,000+", icon: MapPin },
        ].map((src, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <src.icon className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">{src.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{src.desc}</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">{src.records} records</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-3">Why This Matters</h2>
      <div className="prose prose-gray max-w-none">
        <p>Every year, the Irish government distributes €11–14 billion to nonprofits. Since Benefacts closed, there has been no single platform where citizens, journalists, or grant-makers can track where this money goes. OpenBenefacts fills that gap.</p>
      </div>
      <div className="mt-12 p-6 bg-emerald-50 rounded-2xl">
        <h3 className="font-bold text-emerald-900 mb-2">Contact</h3>
        <p className="text-emerald-700">Questions, data corrections, or partnership inquiries: <a href="mailto:mark@openbenefacts.com" className="underline font-medium">mark@openbenefacts.com</a></p>
      </div>
    </div>
  );
}

// ===========================================================
// INNER APP (state-based routing)
// ===========================================================
function InnerApp() {
  // Hash-based routing for shareable links (e.g. #flow:3)
  const getInitialPage = () => {
    const hash = window.location.hash.replace("#", "");
    if (hash) return hash.split("&")[0]; // strip &embed=true
    return "home";
  };
  const isEmbed = window.location.hash.includes("embed=true") || new URLSearchParams(window.location.search).get("embed") === "true";

  const [page, setPage] = useState(getInitialPage);
  const [initialSearch, setInitialSearch] = useState("");
  const [initialSector, setInitialSector] = useState("");
  const { showPricing, setShowPricing } = useAuth();
  const wl = useWatchlist();
  const [globalStats, setGlobalStats] = useState(null);
  useEffect(() => { fetchStats().then(setGlobalStats).catch(() => {}); }, []);
  const orgCount = globalStats?.total_orgs || siteStats.totalOrgs || 36803;

  const handleSetPage = (p) => { setPage(p); window.scrollTo(0, 0); if (p.startsWith("follow/") || p.startsWith("flow:")) window.location.hash = p; };

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const onHash = () => { const h = window.location.hash.replace("#", "").split("&")[0]; if (h) setPage(h); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const renderPage = () => {
    if (page.startsWith("org:")) return <OrgProfilePage orgId={page.split(":")[1]} setPage={handleSetPage} watchlist={wl} embed={isEmbed} />;
    if (page.startsWith("follow/")) return <FlowPage funderSlug={page.split("follow/")[1]} setPage={handleSetPage} embed={isEmbed} />;
    if (page.startsWith("flow:")) return <FlowPage funderSlug={page.split(":")[1]} setPage={handleSetPage} embed={isEmbed} />;
    switch (page) {
      case "orgs": return <OrgsPage setPage={handleSetPage} initialSearch={initialSearch} setInitialSearch={setInitialSearch} initialSector={initialSector} setInitialSector={setInitialSector} watchlist={wl} />;
      case "funders": return <FundersPage setPage={handleSetPage} setInitialSearch={setInitialSearch} />;
      case "pricing": return <PricingPage orgCount={orgCount} setPage={handleSetPage} />;
      case "money": return <MoneyPage setPage={handleSetPage} orgCount={orgCount} />;
      case "foundations": return <FoundationsPage orgCount={orgCount} />;
      case "csr": return <CsrPage orgCount={orgCount} />;
      case "media": return <MediaPage orgCount={orgCount} />;
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
    <div className="min-h-screen bg-gray-50">
      <Navbar page={page} setPage={handleSetPage} />
      {renderPage()}
      <DonationPopup />
      <footer className="bg-white border-t border-gray-100 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-extrabold text-xs tracking-tight">OB</span>
                </div>
                <span className="font-bold text-gray-900">Open</span><span className="font-bold text-emerald-600">Benefacts</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">Ireland's nonprofit transparency platform. Independent, open, free to search.</p>
            </div>

            {/* Explore */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-4">Explore</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("orgs")} className="text-sm text-gray-500 hover:text-emerald-600">Organisations</button></li>
                <li><button onClick={() => handleSetPage("funders")} className="text-sm text-gray-500 hover:text-emerald-600">Funders</button></li>
                <li><button onClick={() => handleSetPage("money")} className="text-sm text-gray-500 hover:text-emerald-600">Follow the money</button></li>
                <li><button onClick={() => handleSetPage("foundations")} className="text-sm text-gray-500 hover:text-emerald-600">Foundations</button></li>
                <li><button onClick={() => handleSetPage("api")} className="text-sm text-gray-500 hover:text-emerald-600">API</button></li>
              </ul>
            </div>

            {/* For nonprofits */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-4">For nonprofits</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("claim")} className="text-sm text-gray-500 hover:text-emerald-600">Claim your listing</button></li>
                <li><a href="mailto:corrections@openbenefacts.com" className="text-sm text-gray-500 hover:text-emerald-600">Request a correction</a></li>
                <li><button onClick={() => handleSetPage("sources")} className="text-sm text-gray-500 hover:text-emerald-600">Data sources</button></li>
                <li><button onClick={() => handleSetPage("api")} className="text-sm text-gray-500 hover:text-emerald-600">Developer API</button></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("about")} className="text-sm text-gray-500 hover:text-emerald-600">About</button></li>
                <li><button onClick={() => handleSetPage("media")} className="text-sm text-gray-500 hover:text-emerald-600">Media</button></li>
                <li><button onClick={() => handleSetPage("pricing")} className="text-sm text-gray-500 hover:text-emerald-600">Pricing</button></li>
                <li><a href="mailto:mark@openbenefacts.com" className="text-sm text-gray-500 hover:text-emerald-600">Contact</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><button onClick={() => handleSetPage("privacy")} className="text-sm text-gray-500 hover:text-emerald-600">Privacy policy</button></li>
                <li><button onClick={() => handleSetPage("terms")} className="text-sm text-gray-500 hover:text-emerald-600">Terms of use</button></li>
                <li><a href="mailto:privacy@openbenefacts.com" className="text-sm text-gray-500 hover:text-emerald-600">GDPR requests</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Dark bottom bar */}
        <div className="bg-gray-900 text-gray-400 py-6">
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
      <p>Questions about this policy? Email <a href="mailto:mark@openbenefacts.com" className="text-emerald-600 hover:underline">mark@openbenefacts.com</a>.</p>
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
      <p>If you spot an error on your organisation's listing, see the <button onClick={() => { window.location.hash = "claim"; }} className="text-emerald-600 hover:underline">Claim your listing</button> page or email <a href="mailto:corrections@openbenefacts.com" className="text-emerald-600 hover:underline">corrections@openbenefacts.com</a>.</p>

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
      <p>Each month, our scrapers pull the latest data from CKAN APIs, regulator websites, and open data portals. We normalise organisation names (e.g. "CHILDANDFAMILY AGENCY" → "Child And Family Agency"), cross-reference identifiers (charity numbers, CHY numbers, CRO numbers), and link financial records to the organisations they describe. All raw downloads are archived to cold storage with SHA-256 hashes so researchers can verify that data hasn't been altered.</p>

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
        <li>Find your organisation in the <button onClick={() => { window.location.hash = "orgs"; }} className="text-emerald-600 hover:underline">directory</button>.</li>
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
