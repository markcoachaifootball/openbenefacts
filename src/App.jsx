import { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Search, Building2, Users, TrendingUp, DollarSign, ChevronRight, ArrowLeft, Eye, Star, Shield, Menu, X, MapPin, Hash, Landmark, GraduationCap, Heart, Briefcase, Globe, Filter, ChevronDown, ExternalLink, Info, BarChart3, FileText, Award, Zap, Database, ArrowRight, Layers, Check, CreditCard, LogIn, UserPlus, Crown, Sparkles, LogOut, AlertTriangle, Lock, ArrowUpDown, Bookmark, Share2, Copy, Code } from "lucide-react";
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
const clean = (v) => (!v || v === "nan" || v === "NaN" || v === "null" || v === "None" || v === "undefined") ? null : v;
// Fix badly concatenated org names (e.g. "CHILD ANDFAMILY AGENCY" → "Child And Family Agency")
const cleanName = (name) => {
  if (!name) return name;
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
const funderData = Array.isArray(DATA?.funders) ? DATA.funders : [];
const siteStats = DATA?.stats || {};
const COLORS = ["#059669","#0d9488","#0891b2","#2563eb","#7c3aed","#db2777","#ea580c","#ca8a04","#65a30d","#475569","#dc2626","#4f46e5","#0e7490","#b91c1c"];
// Slug-based funder routing for shareable URLs (e.g. #follow/hse)
const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
const funderSlugs = funderData.map((f, i) => ({ slug: toSlug(f.name), index: i, name: f.name }));
const findFunderBySlug = (slug) => funderSlugs.find(f => f.slug === slug || f.slug.startsWith(slug));
const getFunderSlug = (index) => funderSlugs[index]?.slug || String(index);

// ===========================================================
// AI RISK SCORE — algorithmic financial health assessment
// ===========================================================
function computeRiskScore(org) {
  if (!org?.financials || org.financials.length === 0) return null;
  const latest = org.financials[0];
  let score = 70; // Base score
  const factors = [];

  // 1. Expenditure ratio (spending within income?)
  if (latest.gross_income > 0 && latest.gross_expenditure > 0) {
    const ratio = latest.gross_expenditure / latest.gross_income;
    if (ratio > 1.1) { score -= 15; factors.push({ label: "Spending exceeds income", impact: "negative" }); }
    else if (ratio > 0.95) { score += 5; factors.push({ label: "Balanced budget", impact: "positive" }); }
    else if (ratio < 0.7) { score -= 5; factors.push({ label: "Low spending ratio — possible reserves accumulation", impact: "neutral" }); }
    else { score += 10; factors.push({ label: "Healthy spending ratio", impact: "positive" }); }
  }

  // 2. Income trend (multi-year)
  if (org.financials.length >= 2) {
    const prev = org.financials[1];
    if (latest.gross_income > 0 && prev.gross_income > 0) {
      const change = (latest.gross_income - prev.gross_income) / prev.gross_income;
      if (change > 0.1) { score += 10; factors.push({ label: "Income growing", impact: "positive" }); }
      else if (change < -0.2) { score -= 15; factors.push({ label: "Significant income decline", impact: "negative" }); }
      else if (change < -0.05) { score -= 5; factors.push({ label: "Slight income decline", impact: "neutral" }); }
    }
    factors.push({ label: `${org.financials.length} years of filings`, impact: org.financials.length >= 3 ? "positive" : "neutral" });
    if (org.financials.length >= 3) score += 5;
  } else {
    score -= 10; factors.push({ label: "Only 1 year of data", impact: "neutral" });
  }

  // 3. Asset coverage
  if (latest.total_assets > 0 && latest.gross_expenditure > 0) {
    const coverage = latest.total_assets / latest.gross_expenditure;
    if (coverage > 0.5) { score += 5; factors.push({ label: "Adequate reserves", impact: "positive" }); }
    else { score -= 5; factors.push({ label: "Low reserve coverage", impact: "neutral" }); }
  }

  // 4. State funding dependency
  if (org.grants && org.grants.length > 0 && latest.gross_income > 0) {
    const grantTotal = org.grants.reduce((s, g) => s + (g.amount || 0), 0);
    const dependency = grantTotal / latest.gross_income;
    if (dependency > 0.8) { factors.push({ label: "High state funding dependency", impact: "neutral" }); }
    else if (dependency > 0) { factors.push({ label: "Diversified income sources", impact: "positive" }); score += 5; }
  }

  // 5. Governance
  if (org.boardMembers && org.boardMembers.length >= 3) { score += 5; factors.push({ label: `${org.boardMembers.length} board members on record`, impact: "positive" }); }
  else if (org.boardMembers && org.boardMembers.length > 0) { factors.push({ label: "Small board", impact: "neutral" }); }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? "low" : score >= 50 ? "moderate" : "elevated";
  const color = score >= 75 ? "emerald" : score >= 50 ? "amber" : "red";
  return { score, level, color, factors };
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

  // Trial: check if user is within 14-day Pro trial
  const trialDaysLeft = user?.trialStart ? Math.max(0, 14 - Math.floor((Date.now() - new Date(user.trialStart).getTime()) / 86400000)) : 0;
  const isTrialActive = trialDaysLeft > 0;
  const tier = user?.tier || (isTrialActive ? "pro" : "free");
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
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Eye className="w-8 h-8 text-white" /></div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome to OpenBenefacts!</h2>
              <p className="text-gray-500 mt-2">Your 14-day Pro trial is now active. Here's how to get the most out of it:</p>
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
            <p className="text-center text-xs text-gray-400 mt-3">Your Pro trial lasts 14 days. No credit card required.</p>
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
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center"><Eye className="w-4 h-4 text-white" /></div>
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
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Pro Trial · {trialDaysLeft} days left</span>
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
      {/* Hero — bold narrative */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4 text-xs font-semibold tracking-wide uppercase">
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full">The gap in Irish transparency</span>
          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">Now filled</span>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-5 leading-tight">
          Every year, Ireland pours<br/><span className="text-emerald-600">€14 billion</span> into nonprofits.<br/>
          <span className="text-gray-400 text-3xl sm:text-4xl lg:text-5xl">Nobody was tracking where it went.</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-500 max-w-3xl mx-auto mb-3">Benefacts tracked every euro. The government defunded it in 2022. For four years, the money trail went dark.</p>
        <p className="text-lg sm:text-xl text-gray-900 font-semibold max-w-2xl mx-auto mb-8">We rebuilt it. {orgCount.toLocaleString()} organisations. {financialCount.toLocaleString()} financial records. Open to everyone.</p>
        {/* Search */}
        <div className="max-w-xl mx-auto mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder={`Search ${orgCount.toLocaleString()} organisations...`} value={heroSearch} onChange={e => setHeroSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {chips.map(c => <button key={c} onClick={() => doSearch(c)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors">{c}</button>)}
          </div>
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
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
    fetchCountyCounts().then(d => setCounties((d || []).map(c => c.county))).catch(() => {});
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
      setOrgs(result?.orgs || []);
      setTotal(result?.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, pageNum, sector, county, govForm, incomeRange, sortBy]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleSearch = (v) => {
    setSearch(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPageNum(1);
      if (v.trim().length >= 2) {
        searchOrganisations(v.trim(), 8).then(r => setSuggestions(r || [])).catch(() => {});
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
function OrgProfilePage({ orgId, setPage, watchlist }) {
  const { isPro, requirePro, tier } = useAuth();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [expandedDirector, setExpandedDirector] = useState(null);
  const [directorBoards, setDirectorBoards] = useState({});
  const [benchmark, setBenchmark] = useState(null);
  // White-label branding for reports
  const [showBranding, setShowBranding] = useState(null); // "pdf" or "dd"
  const [brandName, setBrandName] = useState(() => { try { return localStorage.getItem("ob_brand_name") || ""; } catch { return ""; } });
  const saveBrand = (v) => { setBrandName(v); try { localStorage.setItem("ob_brand_name", v); } catch {} };

  useEffect(() => {
    setLoading(true);
    fetchOrganisation(orgId).then(d => {
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
                <button onClick={() => {
                  if ((tier === "professional" || tier === "enterprise") && !brandName) { setShowBranding("pdf"); return; }
                  const risk = computeRiskScore(org);
                  const latest = org.financials?.[0];
                  const w = window.open("", "_blank");
                  w.document.write(`<!DOCTYPE html><html><head><title>${org.name} — OpenBenefacts Profile</title><style>
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
                    ${risk ? `<div style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"};padding:12px;border-radius:8px;margin-bottom:20px"><strong>AI Risk Score: ${risk.score}/100</strong> — <span class="badge" style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"}">${risk.level} risk</span></div>` : ""}
                    ${latest ? `<h2>Latest Financials (${latest.year || "Most Recent"})</h2><div class="grid">
                      ${latest.gross_income!=null ? `<div class="card"><div class="label">Gross Income</div><div class="val">${fmt(latest.gross_income)}</div></div>` : ""}
                      ${latest.gross_expenditure!=null ? `<div class="card"><div class="label">Gross Expenditure</div><div class="val">${fmt(latest.gross_expenditure)}</div></div>` : ""}
                      ${latest.total_assets!=null ? `<div class="card"><div class="label">Total Assets</div><div class="val">${fmt(latest.total_assets)}</div></div>` : ""}
                      ${latest.employees>0 ? `<div class="card"><div class="label">Employees</div><div class="val">${latest.employees.toLocaleString()}</div></div>` : ""}
                    </div>` : ""}
                    ${org.grants?.length > 0 ? `<h2>State Funding</h2><table><tr><th>Funder</th><th>Programme</th><th>Year</th><th style="text-align:right">Amount</th></tr>${org.grants.slice(0,20).map(g => `<tr><td>${g.funders?.name||g.funder_name||"Government"}</td><td>${g.programme||"—"}</td><td>${g.year||"—"}</td><td style="text-align:right">${g.amount>0?fmt(g.amount):"—"}</td></tr>`).join("")}</table>` : ""}
                    ${org.boardMembers?.length > 0 ? `<h2>Board Members</h2><table><tr><th>Name</th><th>Role</th><th>Since</th></tr>${org.boardMembers.map(bm => `<tr><td>${bm.directors?.name||"—"}</td><td>${bm.role||"Trustee"}</td><td>${bm.start_date?.slice(0,4)||"—"}</td></tr>`).join("")}</table>` : ""}
                    <h2>Organization Details</h2><table>${fields.map(f => `<tr><td style="color:#999;width:160px">${f.label}</td><td>${f.value}${f.sub?" — "+f.sub:""}</td></tr>`).join("")}</table>
                    <div class="footer">${brandName ? `<p style="font-size:13px;font-weight:600;color:#333;margin-bottom:4px">Prepared by ${brandName}</p>` : ""}Generated by OpenBenefacts · openbenefacts.vercel.app · ${new Date().toLocaleDateString()}</div>
                  </body></html>`);
                  w.document.close();
                  setTimeout(() => w.print(), 300);
                }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/20 text-white hover:bg-white/30 transition-colors">
                  <FileText className="w-4 h-4" /> PDF
                </button>
              )}
              {(tier === "professional" || tier === "enterprise") && (
                <button onClick={() => {
                  if (!brandName) { setShowBranding("dd"); return; }
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
                  const w = window.open("", "_blank");
                  w.document.write(`<!DOCTYPE html><html><head><title>Due Diligence Report — ${org.name}</title><style>
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
                    .footer{margin-top:40px;padding-top:16px;border-top:2px solid #059669;font-size:10px;color:#999;text-align:center}
                    .section{page-break-inside:avoid} .confidential{color:#dc2626;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
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
                    </div>

                    ${risk ? `<h2>2. Risk Assessment</h2>
                    <div class="section">
                      <div class="risk-box" style="background:${risk.color==="emerald"?"#ecfdf5":risk.color==="amber"?"#fffbeb":"#fef2f2"}">
                        <strong style="font-size:16px">Overall Risk Score: ${risk.score}/100 — ${risk.level.charAt(0).toUpperCase()+risk.level.slice(1)} Risk</strong>
                        <div style="margin-top:12px">${risk.factors.map(f => `<div class="factor"><span class="dot" style="background:${f.impact==="positive"?"#059669":f.impact==="negative"?"#dc2626":"#9ca3af"}"></span> ${f.label}</div>`).join("")}</div>
                      </div>
                    </div>` : ""}

                    ${latest ? `<h2>3. Financial Overview</h2>
                    <div class="section">
                      <div class="grid">
                        ${latest.gross_income!=null ? `<div class="card"><div class="label">Gross Income</div><div class="val">${fmt(latest.gross_income)}</div></div>` : ""}
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

                    ${org.grants?.length > 0 ? `<h2>4. Government Funding History</h2>
                    <div class="section">
                      <table><tr><th>Funder</th><th>Programme</th><th>Year</th><th style="text-align:right">Amount</th></tr>${org.grants.map(g=>`<tr><td>${g.funders?.name||g.funder_name||"Government"}</td><td>${g.programme||"—"}</td><td>${g.year||"—"}</td><td style="text-align:right">${g.amount>0?fmt(g.amount):"—"}</td></tr>`).join("")}</table>
                    </div>` : ""}

                    ${org.boardMembers?.length > 0 ? `<h2>5. Governance</h2>
                    <div class="section">
                      <p>${org.boardMembers.length} board member${org.boardMembers.length>1?"s":""} on record.</p>
                      <table><tr><th>Name</th><th>Role</th><th>Since</th></tr>${org.boardMembers.map(bm=>`<tr><td>${bm.directors?.name||"—"}</td><td>${bm.role||"Trustee"}</td><td>${bm.start_date?.slice(0,4)||"—"}</td></tr>`).join("")}</table>
                    </div>` : ""}

                    <h2>${org.grants?.length > 0 ? (org.boardMembers?.length > 0 ? "6" : "5") : (org.boardMembers?.length > 0 ? "5" : "4")}. Organisation Details</h2>
                    <div class="section">
                      <table>${fields.map(f=>`<tr><td style="color:#999;width:160px">${f.label}</td><td>${f.value}${f.sub?" — "+f.sub:""}</td></tr>`).join("")}</table>
                    </div>

                    <div class="footer">
                      ${brandName ? `<p style="font-size:13px;font-weight:600;color:#333;margin-bottom:4px">Prepared by ${brandName}</p>` : ""}
                      <p><strong>OpenBenefacts Due Diligence Report</strong></p>
                      <p>Generated on ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })} · openbenefacts.vercel.app</p>
                      <p style="margin-top:8px">This report is generated from publicly available data and does not constitute financial or legal advice. Users should verify all information independently.</p>
                    </div>
                  </body></html>`);
                  w.document.close();
                  setTimeout(() => w.print(), 300);
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
                  <div className="bg-emerald-50 rounded-xl p-4 mb-4">
                    <p className="text-sm text-emerald-700 font-medium">Latest Annual Return ({org.financials[0].year || "Most Recent"})</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    {org.financials[0].gross_income != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Gross Income</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(org.financials[0].gross_income)}</div></div>}
                    {org.financials[0].gross_expenditure != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Gross Expenditure</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(org.financials[0].gross_expenditure)}</div></div>}
                    {org.financials[0].total_assets != null && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Total Assets</div><div className="text-xl font-bold text-gray-900 mt-1">{fmt(org.financials[0].total_assets)}</div></div>}
                    {org.financials[0].employees != null && org.financials[0].employees > 0 && <div className="p-4 bg-gray-50 rounded-xl"><div className="text-xs text-gray-400 font-medium">Employees</div><div className="text-xl font-bold text-gray-900 mt-1">{org.financials[0].employees.toLocaleString()}</div></div>}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-6 text-center mb-6">
                  <p className="text-gray-500">No financial records filed yet for this organization.</p>
                </div>
              )}
              {/* PRO: Multi-year trends + income breakdown */}
              <div className="relative">
                {!isPro && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                    <Lock className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="font-semibold text-gray-700">Multi-year trends & income breakdown</p>
                    <p className="text-sm text-gray-500 mb-3">Available on Pro and above</p>
                    <button onClick={() => requirePro("Financial Trends")} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">Upgrade to Pro — €29/mo</button>
                  </div>
                )}
                <div className="space-y-6">
                  {/* Multi-year trend chart */}
                  {org.financials && org.financials.length > 1 && (() => {
                    const trendData = [...org.financials].reverse().map(f => ({
                      year: f.year || "—",
                      Income: f.gross_income || 0,
                      Expenditure: f.gross_expenditure || 0,
                      Assets: f.total_assets || 0,
                    }));
                    return (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Financial Trends ({trendData.length} years)</h4>
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

                  {/* Year-by-year table */}
                  {org.financials && org.financials.length > 1 && (
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Year-by-Year Comparison</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-gray-400 border-b border-gray-200">
                            <th className="text-left py-2 pr-3">Year</th><th className="text-right py-2 px-3">Income</th><th className="text-right py-2 px-3">Expenditure</th><th className="text-right py-2 px-3">Assets</th><th className="text-right py-2 pl-3">Employees</th>
                          </tr></thead>
                          <tbody>
                            {org.financials.map((f, i) => (
                              <tr key={i} className={`border-b border-gray-100 ${i === 0 ? "font-semibold" : ""}`}>
                                <td className="py-2 pr-3 text-gray-700">{f.year || "—"}</td>
                                <td className="py-2 px-3 text-right text-gray-900">{f.gross_income != null ? fmt(f.gross_income) : "—"}</td>
                                <td className="py-2 px-3 text-right text-gray-900">{f.gross_expenditure != null ? fmt(f.gross_expenditure) : "—"}</td>
                                <td className="py-2 px-3 text-right text-gray-900">{f.total_assets != null ? fmt(f.total_assets) : "—"}</td>
                                <td className="py-2 pl-3 text-right text-gray-900">{f.employees > 0 ? f.employees.toLocaleString() : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "details" && (
            <div className="grid sm:grid-cols-2 gap-4">
              {fields.map((f, i) => (
                <div key={i} className="p-3 rounded-lg bg-gray-50">
                  <div className="text-xs text-gray-400 font-medium">{f.label}</div>
                  <div className="text-sm text-gray-900 mt-0.5">{f.value}</div>
                </div>
              ))}
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
              <button onClick={() => { setShowBranding(null); }} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">{brandName.trim() ? "Generate report" : "Skip branding"}</button>
              <button onClick={() => setShowBranding(null)} className="px-4 py-2.5 text-gray-500 hover:text-gray-700">Cancel</button>
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
  const [funderGrants, setFunderGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(f => f.name.toLowerCase().includes(q));
  }, [sorted, search]);

  const handleFunderClick = async (funder) => {
    if (selectedFunder?.name === funder.name) { setSelectedFunder(null); setFunderGrants([]); return; }
    setSelectedFunder(funder);
    setGrantsLoading(true);
    try {
      if (funder.id) {
        const result = await fetchFunderGrants(funder.id, { pageSize: 100 });
        setFunderGrants(result?.grants || []);
      } else {
        // Fallback: look up funder by name then fetch their grants
        const result = await fetchFunderGrantsByName(funder.name, { pageSize: 100 });
        setFunderGrants(result?.grants || []);
      }
    } catch (e) { console.error(e); setFunderGrants([]); }
    setGrantsLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">State Funders Directory</h1>
        <p className="text-gray-500">{funderData.length} funders distributing {fmt(totalFunding)} across {totalProgs} programmes</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search funders..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
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
                  <div className="text-xs text-gray-400">Programmes</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(f.programmes || []).slice(0, 4).map((p, j) => <span key={j} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full truncate max-w-[140px]">{p}</span>)}
                    {(f.programmes || []).length > 4 && <span className="text-[10px] text-gray-400">+{f.programmes.length - 4}</span>}
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
                    <p className="text-xs text-gray-500 mb-3">{funderGrants.length} grant records found</p>
                    <div className="space-y-2">
                      {funderGrants.map((g, j) => (
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

function FundingFlowWidget({ funder, grants, compact = false, onOrgClick }) {
  if (!funder || !grants || grants.length === 0) return null;

  // Aggregate grants by recipient org, take top 10
  const byOrg = {};
  grants.forEach(g => {
    const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
    const id = g.organisations?.id || g.org_id || name;
    if (!byOrg[id]) byOrg[id] = { id, name, total: 0, county: g.organisations?.county || "", sector: g.organisations?.sector || "" };
    byOrg[id].total += (g.amount || 0);
  });
  const top10 = Object.values(byOrg).sort((a, b) => b.total - a.total).slice(0, 10);
  const maxAmount = top10[0]?.total || 1;
  const totalFlowing = top10.reduce((s, r) => s + r.total, 0);

  const svgW = compact ? 560 : 720;
  const svgH = compact ? 320 : 420;
  const leftX = 20;
  const rightX = svgW - 200;
  const funderBoxW = 180;
  const funderBoxH = Math.min(svgH - 40, top10.length * 36);
  const funderBoxY = (svgH - funderBoxH) / 2;
  const recipH = Math.max(24, (svgH - 60) / top10.length - 4);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxWidth: svgW, minWidth: compact ? 400 : 560 }}>
        <defs>
          {top10.map((_, i) => (
            <linearGradient key={i} id={`flow-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.6" />
              <stop offset="100%" stopColor={FLOW_COLORS[i % FLOW_COLORS.length]} stopOpacity="0.4" />
            </linearGradient>
          ))}
        </defs>

        {/* Funder box (left) */}
        <rect x={leftX} y={funderBoxY} width={funderBoxW} height={funderBoxH} rx="12" fill="#059669" />
        <text x={leftX + funderBoxW / 2} y={funderBoxY + funderBoxH / 2 - 12} textAnchor="middle" fill="white" fontSize={compact ? 10 : 12} fontWeight="700">
          {funder.name.length > 22 ? funder.name.substring(0, 20) + "..." : funder.name}
        </text>
        <text x={leftX + funderBoxW / 2} y={funderBoxY + funderBoxH / 2 + 6} textAnchor="middle" fill="#a7f3d0" fontSize={compact ? 9 : 11} fontWeight="600">
          {fmt(totalFlowing)}
        </text>
        <text x={leftX + funderBoxW / 2} y={funderBoxY + funderBoxH / 2 + 22} textAnchor="middle" fill="#6ee7b7" fontSize={compact ? 8 : 9}>
          to top {top10.length} recipients
        </text>

        {/* Recipient boxes + flow paths */}
        {top10.map((r, i) => {
          const y = 20 + i * ((svgH - 40) / top10.length);
          const barW = Math.max(40, (r.total / maxAmount) * 140);
          const funderOutY = funderBoxY + (funderBoxH / (top10.length + 1)) * (i + 1);
          const recipMidY = y + recipH / 2;

          // Curved path from funder to recipient
          const pathThickness = Math.max(2, (r.total / maxAmount) * 14);
          const cx1 = leftX + funderBoxW + (rightX - leftX - funderBoxW) * 0.4;
          const cx2 = leftX + funderBoxW + (rightX - leftX - funderBoxW) * 0.6;
          const path = `M ${leftX + funderBoxW} ${funderOutY} C ${cx1} ${funderOutY}, ${cx2} ${recipMidY}, ${rightX} ${recipMidY}`;

          return (
            <g key={r.id}>
              {/* Flow path */}
              <path d={path} fill="none" stroke={`url(#flow-grad-${i})`} strokeWidth={pathThickness} opacity="0.7" />

              {/* Recipient bar + label */}
              <g
                style={{ cursor: onOrgClick ? "pointer" : "default" }}
                onClick={() => onOrgClick && r.id !== r.name && onOrgClick(r.id)}
              >
                <rect x={rightX} y={y} width={barW} height={recipH} rx="4" fill={FLOW_COLORS[i % FLOW_COLORS.length]} opacity="0.85" />
                <text x={rightX + barW + 6} y={y + recipH / 2 - 3} fill="#111" fontSize={compact ? 9 : 10} fontWeight="600" dominantBaseline="middle">
                  {r.name.length > 24 ? r.name.substring(0, 22) + "..." : r.name}
                </text>
                <text x={rightX + barW + 6} y={y + recipH / 2 + 10} fill="#888" fontSize={compact ? 7 : 8} dominantBaseline="middle">
                  {fmt(r.total)}{r.county ? ` · ${r.county}` : ""}
                </text>
              </g>
            </g>
          );
        })}

        {/* Watermark */}
        <text x={svgW - 6} y={svgH - 6} textAnchor="end" fill="#ccc" fontSize="8" fontWeight="500">openbenefacts.vercel.app</text>
      </svg>
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
          <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center"><Eye className="w-3 h-3 text-white" /></div>
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

      {/* Share / Embed bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => copyToClip(shareUrl, "link")} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          {copied === "link" ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
          {copied === "link" ? "Link copied!" : "Share link"}
        </button>
        <button onClick={() => copyToClip(embedCode, "embed")} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          {copied === "embed" ? <Check className="w-4 h-4 text-emerald-500" /> : <Code className="w-4 h-4" />}
          {copied === "embed" ? "Embed code copied!" : "Copy embed code"}
        </button>
      </div>

      {/* Visualization */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding Flow — Top 10 Recipients</h2>
        {loading ? <Spinner /> : grants.length > 0 ? (
          <FundingFlowWidget funder={funder} grants={grants} onOrgClick={(id) => setPage(`org:${id}`)} />
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

      {/* Full recipient table */}
      {grants.length > 0 && (() => {
        const byOrg = {};
        grants.forEach(g => {
          const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
          const id = g.organisations?.id || g.org_id || name;
          if (!byOrg[id]) byOrg[id] = { id, name, total: 0, count: 0, county: g.organisations?.county || "", sector: g.organisations?.sector || "" };
          byOrg[id].total += (g.amount || 0);
          byOrg[id].count++;
        });
        const allRecipients = Object.values(byOrg).sort((a, b) => b.total - a.total);

        return (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">All Recipients ({allRecipients.length})</h2>
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

  const endpoints = [
    { method: "GET", path: "/api/v1/organisations", desc: "List organisations with pagination, search, and filters", params: "page, pageSize, search, sector, county, governingForm, minIncome, maxIncome, sortBy, sortDir", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/organisations?search=barnardos&sector=Social+Services"` },
    { method: "GET", path: "/api/v1/organisations/:id", desc: "Get full organisation profile including financials, grants, and board members", params: "id (UUID)", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/organisations/abc123"` },
    { method: "GET", path: "/api/v1/funders", desc: "List all state funders with total funding and recipient counts", params: "search", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/funders"` },
    { method: "GET", path: "/api/v1/funders/:id/grants", desc: "List individual grants from a specific funder", params: "id, page, pageSize", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/funders/xyz789/grants?pageSize=100"` },
    { method: "GET", path: "/api/v1/search", desc: "Fast autocomplete search across organisation names and registration numbers", params: "q, limit", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/search?q=focus+ireland&limit=5"` },
    { method: "GET", path: "/api/v1/stats", desc: "Platform-wide statistics: total orgs, financials, funding relationships", params: "none", example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://openbenefacts.vercel.app/api/v1/stats"` },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Documentation</h1>
          <p className="text-gray-500 mt-1">Programmatic access to Ireland's nonprofit data</p>
        </div>
        {hasApi ? (
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-full">API Active</span>
        ) : (
          <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700">Get API Access</button>
        )}
      </div>

      {/* Overview */}
      <div className="bg-gray-50 rounded-2xl p-6 mb-8">
        <h2 className="font-bold text-gray-900 mb-3">Overview</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>The OpenBenefacts REST API provides JSON access to our full database of Irish nonprofit organisations, their financial records, state funding, and governance data.</p>
          <p>Base URL: <code className="px-2 py-0.5 bg-gray-200 rounded text-gray-800 text-xs">https://openbenefacts.vercel.app/api/v1</code></p>
          <p>Authentication: Include your API key in the <code className="px-2 py-0.5 bg-gray-200 rounded text-gray-800 text-xs">Authorization: Bearer</code> header.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">1,000</div>
            <div className="text-xs text-gray-500">requests/month (Professional)</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">Unlimited</div>
            <div className="text-xs text-gray-500">requests (Enterprise)</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">JSON</div>
            <div className="text-xs text-gray-500">response format</div>
          </div>
        </div>
      </div>

      {/* Rate limits */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
        <h3 className="text-sm font-semibold text-amber-800 mb-1">Rate Limiting</h3>
        <p className="text-sm text-amber-700">Professional: 1,000 requests/month, 10 requests/second burst. Enterprise: unlimited monthly, 50 requests/second burst. Rate limit headers are included in every response.</p>
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

      {/* Integration examples */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Integration Examples</h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {[
          { name: "Salesforce NPSP", desc: "Enrich nonprofit records with real-time financial data and risk scores" },
          { name: "Fluxx", desc: "Auto-populate grant applications with verified organisation details" },
          { name: "Power BI / Tableau", desc: "Build dashboards from live OpenBenefacts data feeds" },
          { name: "Custom CRM", desc: "Integrate nonprofit intelligence directly into your workflow" },
        ].map((ex, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 text-sm">{ex.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{ex.desc}</p>
          </div>
        ))}
      </div>

      {!hasApi && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">Ready to integrate?</h2>
          <p className="text-emerald-100 mb-4">API access starts at Professional tier (€1,499/year). Enterprise plans include unlimited calls and a dedicated account manager.</p>
          <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} className="px-6 py-3 bg-white text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50">Start Free Trial</button>
        </div>
      )}
    </div>
  );
}

// ===========================================================
// PRICING PAGE
// ===========================================================
function PricingPage({ orgCount = 36803 }) {
  const { setShowAuth, setAuthMode } = useAuth();
  const [annual, setAnnual] = useState(true);
  const formattedCount = orgCount.toLocaleString();

  const plans = [
    { name: "Free", price: 0, desc: "Public data access", features: [`Browse ${formattedCount} organizations`,"View sector & county data","Basic search & filters","State funder directory","Public data access"], cta: "Get Started" },
    { name: "Pro", price: annual ? 299 : 29, period: annual ? "/year" : "/month", desc: "Financial intelligence", features: ["Everything in Free","Full financial records","Multi-year trend charts","Income source breakdown","PDF profile downloads","AI risk scores","Watchlist & alerts"], highlight: true, cta: "Start Free Trial", badge: annual ? "Save 15%" : null },
    { name: "Professional", price: annual ? 1499 : 149, period: annual ? "/year" : "/month", desc: "Due diligence & research", features: ["Everything in Pro","Automated due diligence reports","Sector benchmarking","Board member data","Bulk CSV/Excel export","API access (1,000 calls/mo)","Priority support"], cta: "Start Free Trial" },
    { name: "Enterprise", price: null, desc: "Custom solutions", features: ["Everything in Professional","Unlimited API access","Custom dashboards","White-label reports","Dedicated account manager","Custom data integration","SLA guarantee"], cta: "Contact Sales" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, Transparent Pricing</h1>
        <p className="text-gray-500 mb-2">Choose the plan that fits your needs. Cancel anytime.</p>
        <p className="text-sm text-emerald-600 font-medium mb-4">All paid plans include a 14-day free Pro trial. No credit card required.</p>
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
    if (page.startsWith("org:")) return <OrgProfilePage orgId={page.split(":")[1]} setPage={handleSetPage} watchlist={wl} />;
    if (page.startsWith("follow/")) return <FlowPage funderSlug={page.split("follow/")[1]} setPage={handleSetPage} embed={isEmbed} />;
    if (page.startsWith("flow:")) return <FlowPage funderSlug={page.split(":")[1]} setPage={handleSetPage} embed={isEmbed} />;
    switch (page) {
      case "orgs": return <OrgsPage setPage={handleSetPage} initialSearch={initialSearch} setInitialSearch={setInitialSearch} initialSector={initialSector} setInitialSector={setInitialSector} watchlist={wl} />;
      case "funders": return <FundersPage setPage={handleSetPage} setInitialSearch={setInitialSearch} />;
      case "pricing": return <PricingPage orgCount={orgCount} />;
      case "api": return <ApiPage />;
      case "about": return <AboutPage orgCount={orgCount} />;
      default: return <HomePage setPage={handleSetPage} setInitialSearch={setInitialSearch} setInitialSector={setInitialSector} watchlist={wl} />;
    }
  };

  // Embed mode: no navbar/footer chrome
  if (isEmbed) return <div className="min-h-screen bg-white">{renderPage()}</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar page={page} setPage={handleSetPage} />
      {renderPage()}
      <footer className="bg-white border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center"><Eye className="w-4 h-4 text-white" /></div><span className="font-bold text-gray-900">Open</span><span className="font-bold text-emerald-600">Benefacts</span></div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <button onClick={() => handleSetPage("pricing")} className="hover:text-gray-600">Pricing</button>
              <button onClick={() => handleSetPage("about")} className="hover:text-gray-600">About</button>
              <a href="mailto:mark@openbenefacts.com" className="hover:text-gray-600">Contact</a>
            </div>
          </div>
          <p className="text-xs text-gray-300 mt-4 text-center">&copy; 2026 OpenBenefacts</p>
        </div>
      </footer>
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
