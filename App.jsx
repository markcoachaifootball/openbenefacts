import { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Search, Building2, Users, TrendingUp, DollarSign, ChevronRight, ArrowLeft, Eye, Star, Shield, Menu, X, MapPin, Hash, Landmark, GraduationCap, Heart, Briefcase, Globe, Filter, ChevronDown, ExternalLink, Info, BarChart3, FileText, Award, Zap, Database, ArrowRight, Layers, Check, CreditCard, LogIn, UserPlus, Crown, Sparkles, LogOut, AlertTriangle, Lock, ArrowUpDown } from "lucide-react";
import { supabase, fetchStats, fetchFunders, fetchOrganisations, fetchOrganisation, searchOrganisations, fetchSectorCounts, fetchCountyCounts } from "./supabase.js";
import { funders as rawFunderData } from "./data.js";

// ===========================================================
// UTILITIES
// ===========================================================
const clean = (v) => (!v || v === "nan" || v === "NaN" || v === "null" || v === "None" || v === "undefined") ? null : v;
const fmt = (n) => {
  if (!n && n !== 0) return "\u2014";
  if (n >= 1e9) return `\u20AC${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `\u20AC${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `\u20AC${(n/1e3).toFixed(0)}K`;
  return `\u20AC${n.toLocaleString()}`;
};
const funderData = Array.isArray(rawFunderData) ? rawFunderData : [];
const COLORS = ["#059669","#0d9488","#0891b2","#2563eb","#7c3aed","#db2777","#ea580c","#ca8a04","#65a30d","#475569","#dc2626","#4f46e5","#0e7490","#b91c1c"];

// ===========================================================
// AUTH CONTEXT
// ===========================================================
const AuthContext = createContext();
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [showPricing, setShowPricing] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");

  const tier = user?.tier || "free";
  const isPro = tier === "pro" || tier === "professional" || tier === "enterprise";
  const logout = () => setUser(null);
  const requirePro = (feature) => { if (!isPro) { setUpgradePrompt(feature); setShowPricing(true); return false; } return true; };

  const ADMIN_EMAILS = ["mark@staydiasports.com", "mark@openbenefacts.com"];
  const handleSubmit = (e) => {
    e.preventDefault();
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase().trim());
    setUser({ email, name: name || email.split("@")[0], tier: isAdmin ? "enterprise" : "free", isAdmin });
    setShowAuth(false);
    setEmail(""); setPass(""); setName("");
  };

  return (
    <AuthContext.Provider value={{ user, tier, isPro, logout, showAuth, setShowAuth, authMode, setAuthMode, showPricing, setShowPricing, requirePro, upgradePrompt, setUpgradePrompt }}>
      {children}
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
  const { user, setShowAuth, setAuthMode, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const nav = (p) => { setPage(p); setMobileOpen(false); };
  const links = [["home","Dashboard"],["orgs","Organizations"],["funders","Funders"],["pricing","Pricing"],["about","About"]];

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
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full capitalize">{user.tier}</span>
                    </div>
                    <button onClick={() => { setAvatarOpen(false); nav("pricing"); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Crown className="w-4 h-4" /> Upgrade</button>
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
function HomePage({ setPage, setInitialSearch }) {
  const [stats, setStats] = useState(null);
  const [sectors, setSectors] = useState([]);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    fetchSectorCounts().then(d => setSectors((d || []).slice(0, 8))).catch(() => {});
  }, []);

  const topFunders = useMemo(() => [...funderData].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 6), []);
  const totalFunding = funderData.reduce((s, f) => s + (f.total || 0), 0);
  const totalRecipients = funderData.reduce((s, f) => s + (f.recipients || 0), 0);

  const [heroSearch, setHeroSearch] = useState("");
  const doSearch = (q) => { setInitialSearch(q || heroSearch); setPage("orgs"); };
  const chips = ["Barnardos", "HSE", "Focus Ireland", "Rehab Group"];

  const sectorIcons = { "Education, Research": GraduationCap, "Health": Heart, "Social Services": Users, "Arts, Culture, Heritage": Award, "Arts, Culture, Media": Award, "Recreation, Sports": Zap, "Local Development, Housing": Building2, "Religion": Star, "International": Globe, "Environment": Globe, "Advocacy": Shield, "Philanthropy": Sparkles };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-block mb-3 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">Live data from {funderData.length || 14} government sources</div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Ireland's Nonprofit<br/><span className="text-emerald-600">Transparency</span> Platform</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-6">Explore {stats?.org_count?.toLocaleString() || "26,906"} organizations. Track \u20ACbillions in government funding. Access real financial data.</p>
        {/* Search */}
        <div className="max-w-xl mx-auto mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder={`Search ${stats?.org_count?.toLocaleString() || "26,906"} organizations...`} value={heroSearch} onChange={e => setHeroSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {chips.map(c => <button key={c} onClick={() => doSearch(c)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors">{c}</button>)}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Organizations", value: stats?.org_count?.toLocaleString() || "26,906", sub: "Charities, AHBs, schools, clubs", icon: Building2, color: "emerald" },
          { label: "Financial Records", value: stats?.financial_count?.toLocaleString() || "11,823", sub: "Income, expenditure, assets", icon: FileText, color: "blue" },
          { label: "Funding Links", value: stats?.funding_link_count?.toLocaleString() || "37,173", sub: "State \u2192 nonprofit relationships", icon: Zap, color: "purple" },
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

      {/* Featured Org (static) */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-600 mb-1">Featured Organization</div>
          <h3 className="text-lg font-bold text-gray-900">TRINITY COLLEGE DUBLIN</h3>
          <p className="text-sm text-gray-500">Education, Research \u00B7 DUBLIN</p>
        </div>
        <div className="flex gap-6">
          <div><div className="text-xs text-gray-400">Income</div><div className="text-lg font-bold text-gray-900">\u20AC558.1M</div></div>
          <div><div className="text-xs text-gray-400">State Funding</div><div className="text-lg font-bold text-emerald-600">41%</div></div>
        </div>
        <button onClick={() => setPage("orgs")} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">View full profile <ChevronRight className="w-4 h-4" /></button>
      </div>

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
              const Icon = sectorIcons[s.sector] || Briefcase;
              return (
                <button key={i} onClick={() => { setInitialSearch(""); setPage("orgs"); }} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:border-emerald-200 hover:shadow-md transition-all group">
                  <Icon className="w-6 h-6 text-emerald-600 mb-2" />
                  <div className="font-medium text-gray-900 text-sm">{s.sector}</div>
                  <div className="text-xs text-gray-400">{s.org_count?.toLocaleString()} organizations</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">Ready for full nonprofit intelligence?</h2>
        <p className="text-emerald-100 mb-6">Unlock exact financials, income breakdowns, AI risk scores, and downloadable reports for all organizations.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={() => setPage("pricing")} className="px-6 py-3 bg-white text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50">View pricing plans</button>
          <button onClick={() => setPage("orgs")} className="px-6 py-3 bg-emerald-700/50 text-white rounded-xl font-semibold hover:bg-emerald-700/70">Browse free data</button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// ORGANIZATIONS PAGE (with working filters + search)
// ===========================================================
function OrgsPage({ setPage, initialSearch, setInitialSearch }) {
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
  const [sectors, setSectors] = useState([]);
  const [counties, setCounties] = useState([]);
  const pageSize = 30;
  const timer = useRef(null);

  useEffect(() => {
    fetchSectorCounts().then(d => setSectors((d || []).map(s => s.sector))).catch(() => {});
    fetchCountyCounts().then(d => setCounties((d || []).map(c => c.county))).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSearch) { setSearch(initialSearch); setInitialSearch(""); }
  }, [initialSearch]);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      if (search.trim()) {
        const data = await searchOrganisations(search, pageNum, pageSize);
        setOrgs(data?.data || []);
        setTotal(data?.count || 0);
      } else {
        const data = await fetchOrganisations(pageNum, pageSize, { sector, county, governing_form: govForm });
        setOrgs(data?.data || []);
        setTotal(data?.count || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, pageNum, sector, county, govForm]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleSearch = (v) => {
    setSearch(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPageNum(1), 400);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500">Irish nonprofits with real government data</p>
        </div>
        <span className="text-sm text-gray-400">{total.toLocaleString()} results</span>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search organizations..." value={search} onChange={e => handleSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-3 rounded-xl border font-medium text-sm flex items-center gap-2 ${showFilters ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <Filter className="w-4 h-4" /> Filters {(sector || county || govForm) ? <span className="w-2 h-2 bg-emerald-500 rounded-full" /> : null}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Sector</label>
            <select value={sector} onChange={e => { setSector(e.target.value); setPageNum(1); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
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
          {(sector || county || govForm) && <button onClick={() => { setSector(""); setCounty(""); setGovForm(""); setPageNum(1); }} className="text-sm text-emerald-600 hover:underline sm:col-span-3">Clear all filters</button>}
        </div>
      )}

      {/* Sort buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["income","Income \u2193"],["employees","Employees \u2193"],["state_funding","State Funding \u2193"],["name","Name A-Z"]].map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${sortBy === key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>Sort: {label}</button>
        ))}
      </div>

      {/* Results */}
      {loading ? <Spinner /> : orgs.length === 0 ? <EmptyState icon={Building2} title="No organizations found" sub="Try adjusting your search or filters" /> : (
        <>
          <div className="space-y-2">
            {orgs.map((org, i) => (
              <button key={org.id || i} onClick={() => setPage(`org:${org.id}`)} className="w-full bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-emerald-100 transition-all text-left flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{org.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{[clean(org.sector), clean(org.county), clean(org.governing_form)].filter(Boolean).join(" \u00B7 ") || "Registered nonprofit"}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 ml-4" />
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPageNum(1)} disabled={pageNum === 1} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setPageNum(Math.max(1, pageNum - 1))} disabled={pageNum === 1} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">\u2190 Prev</button>
              <span className="text-sm text-gray-500">Page {pageNum} of {totalPages}</span>
              <button onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))} disabled={pageNum === totalPages} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">Next \u2192</button>
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
function OrgProfilePage({ orgId, setPage }) {
  const { isPro, requirePro } = useAuth();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    setLoading(true);
    fetchOrganisation(orgId).then(d => { setOrg(d); setLoading(false); }).catch(() => setLoading(false));
  }, [orgId]);

  if (loading) return <Spinner />;
  if (!org) return <ErrorState message="Organization not found" />;

  const fields = [
    { label: "Sector", value: clean(org.sector), sub: clean(org.subsector) },
    { label: "County", value: clean(org.county) },
    { label: "Type", value: clean(org.governing_form) },
    { label: "Charity Number", value: clean(org.charity_number) },
    { label: "CRO Number", value: clean(org.cro_number) },
    { label: "Revenue CHY", value: clean(org.revenue_chy) },
    { label: "Also Known As", value: clean(org.also_known_as) },
    { label: "Address", value: clean(org.address) },
    { label: "Eircode", value: clean(org.eircode) },
    { label: "Date Incorporated", value: org.date_incorporated },
  ].filter(f => f.value);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => setPage("orgs")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ArrowLeft className="w-4 h-4" /> Back to directory</button>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6">
          <h1 className="text-2xl font-bold text-white">{org.name}</h1>
          <p className="text-emerald-100 mt-1">{[clean(org.county), clean(org.sector)].filter(Boolean).join(" \u00B7 ")}</p>
          <div className="flex flex-wrap gap-3 mt-3">
            {clean(org.charity_number) && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">RCN {org.charity_number}</span>}
            {clean(org.governing_form) && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">{org.governing_form}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100">
          <div className="flex gap-0">
            {["overview","financials","details"].map(t => (
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
                    <div className="text-sm text-gray-900 mt-0.5">{f.value}{f.sub ? ` \u2014 ${f.sub}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "financials" && (
            <div>
              <p className="text-gray-500 text-sm mb-4">Financial data is sourced from the Charities Regulator and Companies Registration Office filings.</p>
              {/* Show basic financials for free per audit recommendation */}
              <div className="bg-emerald-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-emerald-700 font-medium mb-1">Latest Annual Return</p>
                <p className="text-xs text-emerald-600">Basic financials are shown free. Upgrade for multi-year trends and income source breakdown.</p>
              </div>
              {/* Pro: multi-year trends */}
              <div className="relative">
                {!isPro && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                    <Lock className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="font-semibold text-gray-700">Multi-year trends &amp; income breakdown</p>
                    <p className="text-sm text-gray-500 mb-3">Available on Pro and above</p>
                    <button onClick={() => requirePro("Financial Trends")} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">Upgrade to Pro \u2014 \u20AC29/mo</button>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-6 h-48" />
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
    </div>
  );
}

// ===========================================================
// FUNDERS PAGE
// ===========================================================
function FundersPage({ setPage, setInitialSearch }) {
  const sorted = useMemo(() => [...funderData].sort((a, b) => (b.total || 0) - (a.total || 0)), []);
  const totalFunding = funderData.reduce((s, f) => s + (f.total || 0), 0);
  const totalProgs = funderData.reduce((s, f) => s + (f.programmes?.length || 0), 0);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(f => f.name.toLowerCase().includes(q));
  }, [sorted, search]);

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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((f, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm flex-1">{f.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.type === "Government" ? "bg-blue-50 text-blue-700" : f.type === "State Agency" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{f.type}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded-lg p-2.5">
                <div className="text-xs text-gray-400">Total Funding</div>
                <div className="text-lg font-bold text-gray-900">{fmt(f.total)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <div className="text-xs text-gray-400">Recipients</div>
                <div className="text-lg font-bold text-gray-900">{(f.recipients || 0).toLocaleString()}</div>
              </div>
            </div>
            {f.programmes && f.programmes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {f.programmes.slice(0, 3).map((p, j) => <span key={j} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full truncate max-w-[120px]">{p}</span>)}
                {f.programmes.length > 3 && <span className="text-[10px] text-gray-400">+{f.programmes.length - 3} more</span>}
              </div>
            )}
            <button onClick={() => { setInitialSearch(f.name.split("/")[0].split("(")[0].trim()); setPage("orgs"); }} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              View Recipients <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={Landmark} title="No funders match" sub="Try a different search" />}
    </div>
  );
}

// ===========================================================
// PRICING PAGE
// ===========================================================
function PricingPage() {
  const { setShowAuth, setAuthMode } = useAuth();
  const [annual, setAnnual] = useState(true);

  const plans = [
    { name: "Free", price: 0, desc: "Public data access", features: ["Browse 26,906 organizations","View sector & county data","Basic search & filters","State funder directory","Public data access"], cta: "Get Started" },
    { name: "Pro", price: annual ? 299 : 29, period: annual ? "/year" : "/month", desc: "Financial intelligence", features: ["Everything in Free","Full financial records","Multi-year trend charts","Income source breakdown","PDF profile downloads","AI risk scores","Watchlist & alerts"], highlight: true, cta: "Start Free Trial", badge: annual ? "Save 15%" : null },
    { name: "Professional", price: annual ? 1499 : 149, period: annual ? "/year" : "/month", desc: "Due diligence & research", features: ["Everything in Pro","Automated due diligence reports","Sector benchmarking","Board member data","Bulk CSV/Excel export","API access (1,000 calls/mo)","Priority support"], cta: "Start Free Trial" },
    { name: "Enterprise", price: null, desc: "Custom solutions", features: ["Everything in Professional","Unlimited API access","Custom dashboards","White-label reports","Dedicated account manager","Custom data integration","SLA guarantee"], cta: "Contact Sales" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, Transparent Pricing</h1>
        <p className="text-gray-500 mb-6">Choose the plan that fits your needs. Cancel anytime.</p>
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
              {plan.price !== null ? <><span className="text-3xl font-bold text-gray-900">\u20AC{plan.price}</span><span className="text-gray-400 text-sm">{plan.period}</span></> : <span className="text-3xl font-bold text-gray-900">Custom</span>}
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
function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-3">About OpenBenefacts</h1>
      <p className="text-lg text-gray-500 mb-8">Bringing transparency to Ireland's nonprofit sector</p>
      <div className="prose prose-gray max-w-none space-y-4">
        <p>OpenBenefacts is a modern, open-data platform that maps the funding relationships between government bodies, philanthropic organisations, and Ireland's 26,906 registered nonprofits. We are the successor to Benefacts, which closed in 2022, leaving a four-year gap in Irish nonprofit transparency.</p>
        <p>Our mission is to make nonprofit funding data accessible, searchable, and transparent \u2014 helping donors, researchers, journalists, policymakers, and the public understand where money flows in Ireland's charitable sector.</p>
        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-3">Data Sources</h2>
        <p>We aggregate data from the Charities Regulator, Companies Registration Office, Revenue Commissioners, government department Estimates, HSE Section 38/39 returns, Tusla Section 56 reports, Arts Council funding decisions, Sport Ireland NGB allocations, Pobal programme data, and EU structural fund reports.</p>
        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-3">Why This Matters</h2>
        <p>Every year, the Irish government distributes \u20AC11\u201314 billion to nonprofits. Since Benefacts closed, there has been no single platform where citizens, journalists, or grant-makers can track where this money goes. OpenBenefacts fills that gap.</p>
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
  const [page, setPage] = useState("home");
  const [initialSearch, setInitialSearch] = useState("");
  const { showPricing, setShowPricing } = useAuth();

  const handleSetPage = (p) => { setPage(p); window.scrollTo(0, 0); };

  const renderPage = () => {
    if (page.startsWith("org:")) return <OrgProfilePage orgId={page.split(":")[1]} setPage={handleSetPage} />;
    switch (page) {
      case "orgs": return <OrgsPage setPage={handleSetPage} initialSearch={initialSearch} setInitialSearch={setInitialSearch} />;
      case "funders": return <FundersPage setPage={handleSetPage} setInitialSearch={setInitialSearch} />;
      case "pricing": return <PricingPage />;
      case "about": return <AboutPage />;
      default: return <HomePage setPage={handleSetPage} setInitialSearch={setInitialSearch} />;
    }
  };

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
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  );
}
