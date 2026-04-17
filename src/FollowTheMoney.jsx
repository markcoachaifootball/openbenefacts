import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  fetchFunders, fetchAllFunderGrants, resolveFunderByName,
} from "./supabase";

// ============================================================
// UTILITIES
// ============================================================
const fmt = (n) => {
  if (n == null || isNaN(n)) return "€0";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${Math.round(n).toLocaleString()}`;
};
const fmtFull = (n) => `€${Math.round(n || 0).toLocaleString()}`;
const pct = (a, b) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
const cleanName = (n) => (n || "").replace(/\s+(CLG|DAC|Ltd|Limited|Company|Teoranta)\s*$/i, "").trim();

const COLORS = ["#059669","#2563eb","#dc2626","#7c3aed","#ea580c","#0891b2","#db2777","#ca8a04","#4f46e5","#65a30d","#be185d","#0d9488","#9333ea","#f97316"];
const SECTOR_ICONS = { "Social Services": "🤝", "Education": "🎓", "Health": "🏥", "Religion": "⛪", "Arts Culture": "🎭", "Sports": "⚽", "Community Development": "🏘️", "Environment": "🌿", "Housing": "🏠", "International": "🌍" };

const Spinner = () => <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

// Custom CSV download
function downloadCSV(rows, headers, filename) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => typeof c === "string" ? `"${c.replace(/"/g, '""')}"` : c).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// FUNDER OVERVIEW PAGE — All funders with comparison
// ============================================================
function FunderOverview({ funders, onSelectFunder }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("total"); // total | recipients | programmes
  const [view, setView] = useState("cards"); // cards | chart | treemap

  const types = useMemo(() => {
    const t = {};
    funders.forEach(f => { const tp = f.type || "Other"; t[tp] = (t[tp] || 0) + 1; });
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [funders]);

  const filtered = useMemo(() => {
    let list = funders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    if (typeFilter !== "all") list = list.filter(f => (f.type || "Other") === typeFilter);
    return [...list].sort((a, b) => {
      if (sortBy === "recipients") return (b.recipients || 0) - (a.recipients || 0);
      if (sortBy === "programmes") return (b.programmes?.length || 0) - (a.programmes?.length || 0);
      return (b.total || 0) - (a.total || 0);
    });
  }, [funders, search, typeFilter, sortBy]);

  const totalFunding = filtered.reduce((s, f) => s + (f.total || 0), 0);
  const totalRecipients = filtered.reduce((s, f) => s + (f.recipients || 0), 0);
  const totalProgs = filtered.reduce((s, f) => s + (f.programmes?.length || 0), 0);

  // Treemap data
  const treemapData = useMemo(() => filtered.filter(f => f.total > 0).map((f, i) => ({
    name: f.name.length > 25 ? f.name.substring(0, 23) + "…" : f.name,
    fullName: f.name,
    size: f.total,
    fill: COLORS[i % COLORS.length],
  })), [filtered]);

  return (
    <div>
      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100">
          <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Total Tracked</div>
          <div className="text-2xl font-extrabold text-emerald-900 mt-1">{fmt(totalFunding)}</div>
          <div className="text-xs text-emerald-500 mt-0.5">across {filtered.length} funders</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
          <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Recipients</div>
          <div className="text-2xl font-extrabold text-blue-900 mt-1">{totalRecipients.toLocaleString()}</div>
          <div className="text-xs text-blue-500 mt-0.5">organisations funded</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 border border-purple-100">
          <div className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Programmes</div>
          <div className="text-2xl font-extrabold text-purple-900 mt-1">{totalProgs}</div>
          <div className="text-xs text-purple-500 mt-0.5">funding streams</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-100">
          <div className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Avg per Funder</div>
          <div className="text-2xl font-extrabold text-amber-900 mt-1">{fmt(totalFunding / (filtered.length || 1))}</div>
          <div className="text-xs text-amber-500 mt-0.5">median funding</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" placeholder="Search funders..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white">
          <option value="all">All types ({funders.length})</option>
          {types.map(([t, c]) => <option key={t} value={t}>{t} ({c})</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white">
          <option value="total">Sort by Funding</option>
          <option value="recipients">Sort by Recipients</option>
          <option value="programmes">Sort by Programmes</option>
        </select>
        <div className="flex border border-gray-200 rounded-xl overflow-hidden">
          {["cards","chart","treemap"].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-2 text-xs font-medium transition-colors ${view === v ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v === "cards" ? "Cards" : v === "chart" ? "Bar Chart" : "Treemap"}
            </button>
          ))}
        </div>
      </div>

      {/* Visualisation views */}
      {view === "chart" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding Distribution</h3>
          <ResponsiveContainer width="100%" height={Math.max(300, filtered.length * 36)}>
            <BarChart data={filtered.map((f, i) => ({ name: f.name.length > 30 ? f.name.substring(0, 28) + "…" : f.name, fullName: f.name, total: f.total || 0, fill: COLORS[i % COLORS.length] }))} layout="vertical" margin={{ left: 180, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
              <RTooltip formatter={(v) => fmtFull(v)} labelFormatter={(l, payload) => payload?.[0]?.payload?.fullName || l} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {filtered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "treemap" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding Treemap — Size = Total Funding</h3>
          <ResponsiveContainer width="100%" height={480}>
            <Treemap data={treemapData} dataKey="size" ratio={4/3} stroke="#fff" strokeWidth={3}
              content={(props) => {
                const { x, y, width, height, index, name, size } = props || {};
                if (!name || !width || !height || width < 8 || height < 8) return null;
                const fill = COLORS[(index || 0) % COLORS.length];
                const showName = width > 55 && height > 28;
                const showAmount = width > 45 && height > 40;
                const fontSize = Math.max(9, Math.min(14, width / 10, height / 4));
                const maxChars = Math.floor(width / (fontSize * 0.55));
                const displayName = name.length > maxChars ? name.substring(0, maxChars - 1) + "…" : name;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} rx={8} style={{ fill, stroke: "#fff", strokeWidth: 3 }} />
                    <rect x={x} y={y} width={width} height={height} rx={8} style={{ fill: "rgba(0,0,0,0.15)" }} />
                    {showName && (
                      <text x={x + width/2} y={y + height/2 - (showAmount ? fontSize * 0.6 : 0)} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={fontSize} fontWeight="800" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                        {displayName}
                      </text>
                    )}
                    {showAmount && (
                      <text x={x + width/2} y={y + height/2 + fontSize * 0.8} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={fontSize * 0.8} fontWeight="700" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
                        {fmt(size)}
                      </text>
                    )}
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2 text-center">Click any block to see full funder breakdown</p>
        </div>
      )}

      {/* Cards (always show, but act as primary in cards view) */}
      {view === "cards" && (
        <div className="space-y-3">
          {filtered.map((f, i) => {
            const share = totalFunding > 0 ? (f.total || 0) / totalFunding : 0;
            return (
              <button key={f.name} onClick={() => onSelectFunder(f)} className="w-full text-left bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-emerald-200 transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{f.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.type === "Government" ? "bg-blue-50 text-blue-700" : f.type === "State Agency" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{f.type}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div><span className="text-gray-400">Funding:</span> <span className="font-bold text-emerald-700">{fmt(f.total)}</span></div>
                      <div><span className="text-gray-400">Recipients:</span> <span className="font-semibold text-gray-700">{(f.recipients || 0).toLocaleString()}</span></div>
                      <div><span className="text-gray-400">Programmes:</span> <span className="font-semibold text-gray-700">{(f.programmes?.length || 0)}</span></div>
                      <div><span className="text-gray-400">Share:</span> <span className="font-semibold text-gray-700">{pct(f.total || 0, totalFunding)}</span></div>
                    </div>
                    {/* Programmes pills */}
                    {f.programmes?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {f.programmes.slice(0, 5).map((p, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 truncate max-w-[160px]">{p}</span>
                        ))}
                        {f.programmes.length > 5 && <span className="text-[10px] text-gray-400">+{f.programmes.length - 5}</span>}
                      </div>
                    )}
                  </div>
                  {/* Mini share bar */}
                  <div className="flex flex-col items-end gap-1 min-w-[80px]">
                    <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(2, share * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400">{pct(f.total || 0, totalFunding)} of total</span>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// FUNDER DETAIL PAGE — Deep drill-down into a single funder
// ============================================================
function FunderDetail({ funder, grants, setPage, onBack }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [progFilter, setProgrammeFilter] = useState(null);
  const [expandedRecipient, setExpandedRecipient] = useState(null);
  const [searchRecipients, setSearchRecipients] = useState("");
  const [recipientSort, setRecipientSort] = useState("total"); // total | name | count
  const [sectorFilter, setSectorFilter] = useState(null);
  const [countyFilter, setCountyFilter] = useState(null);
  const [grantSizeBand, setGrantSizeBand] = useState(null); // e.g. [0,10000] or [1000000, Infinity]
  const [selectedYear, setSelectedYear] = useState("all"); // global year filter

  // ---- Available years (sorted) ----
  const availableYears = useMemo(() => {
    const years = [...new Set(grants.map(g => g.year).filter(Boolean))].sort();
    return years;
  }, [grants]);

  // ---- Year-filtered grants (used for ALL analytics) ----
  const filteredGrants = useMemo(() => {
    if (selectedYear === "all") return grants;
    return grants.filter(g => g.year === selectedYear || String(g.year) === String(selectedYear));
  }, [grants, selectedYear]);

  // ---- Derived analytics (now all use filteredGrants) ----
  const totalFunding = filteredGrants.reduce((s, g) => s + (g.amount || 0), 0);
  const matchedGrants = filteredGrants.filter(g => g.org_id || g.organisations?.id);
  const unmatchedGrants = filteredGrants.filter(g => !g.org_id && !g.organisations?.id);

  // By programme (uses filteredGrants)
  const byProgramme = useMemo(() => {
    const map = {};
    filteredGrants.forEach(g => {
      const p = g.programme || "General";
      if (!map[p]) map[p] = { name: p, total: 0, count: 0, recipients: new Set(), matched: 0 };
      map[p].total += (g.amount || 0);
      map[p].count++;
      map[p].recipients.add(g.recipient_name_raw);
      if (g.org_id || g.organisations?.id) map[p].matched++;
    });
    return Object.values(map).map(p => ({ ...p, recipients: p.recipients.size })).sort((a, b) => b.total - a.total);
  }, [filteredGrants]);

  // By recipient (aggregated, uses filteredGrants + all active filters)
  const byRecipient = useMemo(() => {
    const map = {};
    let base = filteredGrants;
    if (progFilter) base = base.filter(g => (g.programme || "General") === progFilter);
    if (sectorFilter) base = base.filter(g => (g.organisations?.sector || "Unclassified") === sectorFilter);
    if (countyFilter) base = base.filter(g => (g.organisations?.county || "Unknown") === countyFilter);
    if (grantSizeBand) base = base.filter(g => (g.amount || 0) >= grantSizeBand[0] && (g.amount || 0) < grantSizeBand[1]);
    base.forEach(g => {
      const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
      const id = g.organisations?.id || name;
      if (!map[id]) map[id] = { id, name, total: 0, count: 0, programmes: new Set(), county: g.organisations?.county || "", sector: g.organisations?.sector || "", charityNumber: g.organisations?.charity_number || "", orgId: g.organisations?.id || null, grants: [] };
      map[id].total += (g.amount || 0);
      map[id].count++;
      map[id].programmes.add(g.programme || "General");
      map[id].grants.push(g);
    });
    let list = Object.values(map).map(r => ({ ...r, programmes: [...r.programmes] }));
    if (searchRecipients.trim()) {
      const q = searchRecipients.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.county.toLowerCase().includes(q) || r.sector.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      if (recipientSort === "name") return a.name.localeCompare(b.name);
      if (recipientSort === "count") return b.count - a.count;
      return b.total - a.total;
    });
  }, [filteredGrants, progFilter, sectorFilter, countyFilter, grantSizeBand, searchRecipients, recipientSort]);

  // By county (uses filteredGrants)
  const byCounty = useMemo(() => {
    const map = {};
    filteredGrants.forEach(g => {
      const county = g.organisations?.county || "Unknown";
      if (!map[county]) map[county] = { name: county, total: 0, count: 0, orgs: new Set() };
      map[county].total += (g.amount || 0);
      map[county].count++;
      map[county].orgs.add(g.recipient_name_raw);
    });
    return Object.values(map).map(c => ({ ...c, orgs: c.orgs.size })).sort((a, b) => b.total - a.total);
  }, [filteredGrants]);

  // By sector (uses filteredGrants)
  const bySector = useMemo(() => {
    const map = {};
    filteredGrants.forEach(g => {
      const sector = g.organisations?.sector || "Unclassified";
      if (!map[sector]) map[sector] = { name: sector, total: 0, count: 0, orgs: new Set() };
      map[sector].total += (g.amount || 0);
      map[sector].count++;
      map[sector].orgs.add(g.recipient_name_raw);
    });
    return Object.values(map).map(s => ({ ...s, orgs: s.orgs.size })).sort((a, b) => b.total - a.total);
  }, [filteredGrants]);

  // By year — always use ALL grants (this drives the year trend chart, not filtered)
  const byYear = useMemo(() => {
    const map = {};
    grants.forEach(g => {
      const y = g.year || "Unknown";
      if (!map[y]) map[y] = { year: y, total: 0, count: 0 };
      map[y].total += (g.amount || 0);
      map[y].count++;
    });
    return Object.values(map).sort((a, b) => (a.year === "Unknown" ? 9999 : a.year) - (b.year === "Unknown" ? 9999 : b.year));
  }, [grants]);

  // Key stats (use filteredGrants)
  const avgGrantSize = filteredGrants.length > 0 ? totalFunding / filteredGrants.length : 0;
  const medianGrant = useMemo(() => {
    const amounts = filteredGrants.map(g => g.amount || 0).sort((a, b) => a - b);
    if (amounts.length === 0) return 0;
    const mid = Math.floor(amounts.length / 2);
    return amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
  }, [filteredGrants]);
  const largestGrant = filteredGrants.length > 0 ? filteredGrants.reduce((max, g) => (g.amount || 0) > (max.amount || 0) ? g : max, filteredGrants[0]) : null;
  const smallestGrant = filteredGrants.length > 0 ? filteredGrants.reduce((min, g) => (g.amount || 0) < (min.amount || 0) ? g : min, filteredGrants[0]) : null;
  const matchRate = filteredGrants.length > 0 ? (matchedGrants.length / filteredGrants.length * 100).toFixed(0) : 0;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "recipients", label: `Recipients (${byRecipient.length})` },
    { id: "programmes", label: `Programmes (${byProgramme.length})` },
    { id: "geography", label: "Geography" },
    { id: "sectors", label: "Sectors" },
    { id: "data", label: "Raw Data" },
  ];

  return (
    <div>
      {/* Back + header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
        Back to all funders
      </button>

      {/* Dark hero header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-2xl p-6 sm:p-8 mb-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Follow the Money</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">{funder.name}</h1>
            <p className="text-gray-300 text-sm">
              <span className="text-emerald-400 font-bold">{fmt(totalFunding)}</span> distributed across{" "}
              <span className="font-bold">{byRecipient.length.toLocaleString()}</span> recipients via{" "}
              <span className="font-bold">{byProgramme.length}</span> programmes
              {selectedYear !== "all" && <span className="ml-1 text-amber-300 font-semibold">· {selectedYear} only</span>}
            </p>
          </div>
          <span className={`text-[10px] px-3 py-1 rounded-full font-medium ${funder.type === "Government" ? "bg-blue-500/20 text-blue-300" : funder.type === "State Agency" ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-300"}`}>{funder.type}</span>
        </div>

        {/* Year filter — only show if multiple years available */}
        {availableYears.length > 1 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Year:</span>
            <button
              onClick={() => setSelectedYear("all")}
              className={`text-xs px-4 py-1.5 rounded-full font-semibold transition-all ${selectedYear === "all" ? "bg-white text-gray-900 shadow" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}
            >
              All years
            </button>
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y === selectedYear ? "all" : y)}
                className={`text-xs px-4 py-1.5 rounded-full font-semibold transition-all ${selectedYear === y ? "bg-emerald-400 text-gray-900 shadow" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          {[
            { label: "Total Grants", value: filteredGrants.length.toLocaleString() },
            { label: "Avg Grant", value: fmt(avgGrantSize) },
            { label: "Median Grant", value: fmt(medianGrant) },
            { label: "Match Rate", value: `${matchRate}%` },
            { label: "Counties", value: byCounty.filter(c => c.name !== "Unknown").length },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</div>
              <div className="text-lg font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Download + Share bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => {
          const rows = filteredGrants.map(g => [
            funder.name, g.programme || "", cleanName(g.organisations?.name || g.recipient_name_raw), g.organisations?.county || "", g.organisations?.sector || "", g.year || "", g.amount || 0, g.organisations?.charity_number || "",
          ]);
          downloadCSV(rows, ["Funder","Programme","Recipient","County","Sector","Year","Amount","RCN"], `${funder.name.replace(/\s+/g, "-").toLowerCase()}-${selectedYear === "all" ? "all-years" : selectedYear}-grants.csv`);
        }} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          {selectedYear === "all" ? "Download All Grants CSV" : `Download ${selectedYear} Grants CSV`}
        </button>
        <button onClick={() => { navigator.clipboard.writeText(window.location.href); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
          Share
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ OVERVIEW TAB ============ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Funding by Year trend */}
          {byYear.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding by Year</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={byYear.filter(y => y.year !== "Unknown")}>
                  <defs>
                    <linearGradient id="yearGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={fmt} />
                  <RTooltip formatter={(v) => fmtFull(v)} />
                  <Area type="monotone" dataKey="total" stroke="#059669" fill="url(#yearGrad)" strokeWidth={2.5} name="Total Funding" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top 10 Recipients bar chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Top 10 Recipients</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={byRecipient.slice(0, 10).map((r, i) => ({ name: r.name.length > 28 ? r.name.substring(0, 26) + "…" : r.name, total: r.total, fill: COLORS[i % COLORS.length] }))} layout="vertical" margin={{ left: 180, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => fmtFull(v)} />
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {byRecipient.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Programme breakdown pie + sector pie side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {byProgramme.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">By Programme</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byProgramme.slice(0, 8)} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name.length > 15 ? name.substring(0, 13) + "…" : name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} cursor="pointer"
                      onClick={(data) => { if (data?.name) { setProgrammeFilter(data.name); setActiveTab("recipients"); } }}>
                      {byProgramme.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RTooltip formatter={(v) => fmtFull(v)} />
                  </PieChart>
                  <p className="text-[10px] text-gray-400 text-center mt-2">Click a segment to filter recipients by programme</p>
                </ResponsiveContainer>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">By Sector</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={bySector.slice(0, 8)} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${SECTOR_ICONS[name] || ""} ${name.length > 15 ? name.substring(0, 13) + "…" : name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} cursor="pointer"
                    onClick={(data) => { if (data?.name) { setSectorFilter(data.name); setActiveTab("recipients"); } }}>
                    {bySector.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v) => fmtFull(v)} />
                </PieChart>
                <p className="text-[10px] text-gray-400 text-center mt-2">Click a segment to filter recipients by sector</p>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grant size distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Grant Size Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "< €10K", range: [0, 10000] },
                { label: "€10K–€100K", range: [10000, 100000] },
                { label: "€100K–€1M", range: [100000, 1000000] },
                { label: "> €1M", range: [1000000, Infinity] },
              ].map(b => {
                const count = grants.filter(g => (g.amount || 0) >= b.range[0] && (g.amount || 0) < b.range[1]).length;
                const total = grants.filter(g => (g.amount || 0) >= b.range[0] && (g.amount || 0) < b.range[1]).reduce((s, g) => s + (g.amount || 0), 0);
                const isActive = grantSizeBand && grantSizeBand[0] === b.range[0] && grantSizeBand[1] === b.range[1];
                return (
                  <button key={b.label} onClick={() => { setGrantSizeBand(isActive ? null : b.range); setActiveTab("recipients"); }}
                    className={`rounded-xl p-3 text-center transition-all cursor-pointer ${isActive ? "bg-emerald-100 border-2 border-emerald-500 shadow-sm" : "bg-gray-50 border-2 border-transparent hover:border-emerald-200 hover:bg-emerald-50"}`}>
                    <div className="text-xs text-gray-400 font-medium">{b.label}</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">{count}</div>
                    <div className="text-xs text-emerald-600 font-semibold">{fmt(total)}</div>
                    <div className="text-[9px] text-gray-400 mt-1">{count > 0 ? "Click to view →" : ""}</div>
                  </button>
                );
              })}
            </div>
            {largestGrant && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-2">
                <span>Largest: <strong className="text-gray-900">{fmtFull(largestGrant.amount)}</strong> → {largestGrant.organisations?.id ? (
                  <button onClick={() => setPage(`org:${largestGrant.organisations.id}`)} className="text-emerald-600 hover:text-emerald-800 font-semibold underline">{cleanName(largestGrant.organisations?.name || largestGrant.recipient_name_raw)}</button>
                ) : cleanName(largestGrant.organisations?.name || largestGrant.recipient_name_raw)}</span>
                {smallestGrant && <span>Smallest: <strong className="text-gray-900">{fmtFull(smallestGrant.amount)}</strong> → {smallestGrant.organisations?.id ? (
                  <button onClick={() => setPage(`org:${smallestGrant.organisations.id}`)} className="text-emerald-600 hover:text-emerald-800 font-semibold underline">{cleanName(smallestGrant.organisations?.name || smallestGrant.recipient_name_raw)}</button>
                ) : cleanName(smallestGrant.organisations?.name || smallestGrant.recipient_name_raw)}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ RECIPIENTS TAB ============ */}
      {activeTab === "recipients" && (
        <div>
          {/* Active filter banners */}
          {(sectorFilter || countyFilter || grantSizeBand) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {sectorFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-800 text-xs font-semibold rounded-full">
                  Sector: {sectorFilter}
                  <button onClick={() => setSectorFilter(null)} className="ml-1 text-violet-500 hover:text-violet-700 font-bold">×</button>
                </span>
              )}
              {countyFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 text-teal-800 text-xs font-semibold rounded-full">
                  County: {countyFilter}
                  <button onClick={() => setCountyFilter(null)} className="ml-1 text-teal-500 hover:text-teal-700 font-bold">×</button>
                </span>
              )}
              {grantSizeBand && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                  Grant size: {fmt(grantSizeBand[0])}–{grantSizeBand[1] === Infinity ? "∞" : fmt(grantSizeBand[1])}
                  <button onClick={() => setGrantSizeBand(null)} className="ml-1 text-amber-500 hover:text-amber-700 font-bold">×</button>
                </span>
              )}
              <button onClick={() => { setSectorFilter(null); setCountyFilter(null); setGrantSizeBand(null); setProgrammeFilter(null); }} className="text-xs text-gray-500 hover:text-gray-700 underline ml-2">Clear all filters</button>
            </div>
          )}

          {/* Programme filter + search */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" placeholder="Search recipients, county, sector..." value={searchRecipients} onChange={e => setSearchRecipients(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
            </div>
            <select value={recipientSort} onChange={e => setRecipientSort(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white">
              <option value="total">Sort by Amount</option>
              <option value="count">Sort by Grant Count</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>

          {/* Programme filter pills */}
          {byProgramme.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button onClick={() => setProgrammeFilter(null)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${!progFilter ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-emerald-50"}`}>
                All programmes ({grants.length})
              </button>
              {byProgramme.map(p => (
                <button key={p.name} onClick={() => setProgrammeFilter(progFilter === p.name ? null : p.name)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${progFilter === p.name ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-emerald-50"}`}>
                  {p.name} ({p.count})
                </button>
              ))}
            </div>
          )}

          {progFilter && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
              <span className="text-xs text-emerald-700 font-medium">Programme: <strong>{progFilter}</strong> — {fmt(byProgramme.find(p => p.name === progFilter)?.total || 0)} to {byRecipient.length} organisations</span>
              <button onClick={() => setProgrammeFilter(null)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Clear</button>
            </div>
          )}

          {/* Recipients list — expandable cards */}
          <div className="space-y-2">
            {byRecipient.slice(0, 100).map((r, i) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow">
                <button onClick={() => setExpandedRecipient(expandedRecipient === r.id ? null : r.id)} className="w-full text-left p-4 flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm truncate">{r.name}</span>
                      {r.charityNumber && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-mono">RCN {r.charityNumber}</span>}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                      {r.sector && <span>{SECTOR_ICONS[r.sector] || "📋"} {r.sector}</span>}
                      {r.county && <span>📍 {r.county}</span>}
                      <span>{r.count} grant{r.count !== 1 ? "s" : ""}</span>
                      {r.programmes.length > 1 && <span>{r.programmes.length} programmes</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-600">{fmt(r.total)}</div>
                    <div className="text-[10px] text-gray-400">{pct(r.total, totalFunding)} of total</div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-300 transition-transform ${expandedRecipient === r.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </button>

                {/* Expanded detail */}
                {expandedRecipient === r.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="text-[10px] text-gray-400">Total from {funder.name.split(" ")[0]}</div>
                        <div className="text-lg font-bold text-emerald-700">{fmtFull(r.total)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="text-[10px] text-gray-400">Number of Grants</div>
                        <div className="text-lg font-bold text-gray-900">{r.count}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="text-[10px] text-gray-400">Avg per Grant</div>
                        <div className="text-lg font-bold text-gray-900">{fmt(r.total / r.count)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="text-[10px] text-gray-400">Share of Funder Total</div>
                        <div className="text-lg font-bold text-amber-600">{pct(r.total, totalFunding)}</div>
                      </div>
                    </div>

                    {/* Individual grants */}
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Individual Grants</h4>
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {r.grants.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((g, gi) => (
                        <div key={gi} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-700 font-medium">{g.programme || "General"}</span>
                            {g.year && <span className="text-gray-400 ml-2">({g.year})</span>}
                          </div>
                          <span className="font-semibold text-emerald-600 ml-3">{fmtFull(g.amount)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Link to org profile */}
                    {r.orgId && (
                      <button onClick={() => setPage(`org:${r.orgId}`)} className="mt-3 flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        View Full Organisation Profile
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {byRecipient.length > 100 && <p className="text-xs text-gray-400 text-center py-3">{byRecipient.length - 100} more recipients — use search to find specific ones</p>}
          </div>
        </div>
      )}

      {/* ============ PROGRAMMES TAB ============ */}
      {activeTab === "programmes" && (
        <div className="space-y-4">
          {byProgramme.map((prog, pi) => {
            const share = totalFunding > 0 ? prog.total / totalFunding : 0;
            return (
              <div key={prog.name} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: COLORS[pi % COLORS.length] }} />
                      {prog.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{prog.count} grants to {prog.recipients} recipients · {prog.matched} matched to database</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-700">{fmt(prog.total)}</div>
                    <div className="text-xs text-gray-400">{pct(prog.total, totalFunding)} of total</div>
                  </div>
                </div>
                {/* Share bar */}
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1, share * 100)}%`, background: COLORS[pi % COLORS.length] }} />
                </div>
                {/* Top recipients for this programme */}
                <div className="text-xs text-gray-400 mb-2">Top recipients in this programme:</div>
                <div className="space-y-1">
                  {(() => {
                    const progRecipients = {};
                    grants.filter(g => (g.programme || "General") === prog.name).forEach(g => {
                      const name = cleanName(g.organisations?.name || g.recipient_name_raw) || "Unknown";
                      const id = g.organisations?.id || name;
                      if (!progRecipients[id]) progRecipients[id] = { name, total: 0, orgId: g.organisations?.id };
                      progRecipients[id].total += (g.amount || 0);
                    });
                    return Object.values(progRecipients).sort((a, b) => b.total - a.total).slice(0, 5).map((r, ri) => (
                      <button key={ri} onClick={() => r.orgId ? setPage(`org:${r.orgId}`) : null} className="w-full text-left flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                        <span className="text-gray-700">{r.name}</span>
                        <span className="font-semibold text-emerald-600">{fmt(r.total)}</span>
                      </button>
                    ));
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ GEOGRAPHY TAB ============ */}
      {activeTab === "geography" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding by County</h3>
            <ResponsiveContainer width="100%" height={Math.max(300, byCounty.filter(c => c.name !== "Unknown").length * 32)}>
              <BarChart data={byCounty.filter(c => c.name !== "Unknown").slice(0, 26)} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => fmtFull(v)} />
                <Bar dataKey="total" fill="#0d9488" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* County table */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">County Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left py-2 pr-3">#</th><th className="text-left py-2 pr-3">County</th><th className="text-right py-2 pr-3">Grants</th><th className="text-right py-2 pr-3">Organisations</th><th className="text-right py-2 pr-3">Total</th><th className="text-right py-2">Share</th>
                </tr></thead>
                <tbody>
                  {byCounty.map((c, i) => (
                    <tr key={c.name} className="border-b border-gray-50 hover:bg-emerald-50 cursor-pointer transition-colors" onClick={() => { setCountyFilter(c.name); setActiveTab("recipients"); }}>
                      <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-emerald-700 hover:underline">{c.name}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">{c.count}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">{c.orgs}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{fmt(c.total)}</td>
                      <td className="py-2 text-right text-gray-500 text-xs">{pct(c.total, totalFunding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ SECTORS TAB ============ */}
      {activeTab === "sectors" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Funding by Sector</h3>
            <ResponsiveContainer width="100%" height={Math.max(250, bySector.length * 36)}>
              <BarChart data={bySector} layout="vertical" margin={{ left: 160, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => fmtFull(v)} />
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {bySector.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sector cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bySector.map((s, si) => (
              <button key={s.name} onClick={() => { setSectorFilter(s.name); setActiveTab("recipients"); }} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm flex items-center gap-2 group-hover:text-emerald-700">
                    <span className="text-lg">{SECTOR_ICONS[s.name] || "📋"}</span>
                    {s.name}
                  </span>
                  <span className="text-sm font-bold text-emerald-600">{fmt(s.total)}</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{s.count} grants</span>
                  <span>{s.orgs} orgs</span>
                  <span>{pct(s.total, totalFunding)} of total</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(1, (s.total / (bySector[0]?.total || 1)) * 100)}%`, background: COLORS[si % COLORS.length] }} />
                </div>
                <div className="text-[10px] text-gray-400 mt-2 group-hover:text-emerald-600">Click to see all {s.orgs} recipients →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============ RAW DATA TAB ============ */}
      {activeTab === "data" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Grant Records
                <span className="ml-2 text-gray-400 font-normal normal-case">
                  {selectedYear === "all" ? `${filteredGrants.length} across all years` : `${filteredGrants.length} in ${selectedYear}`}
                </span>
              </h3>
              {selectedYear === "all" && availableYears.length > 1 && (
                <p className="text-xs text-gray-400 mt-1">
                  Tip: use the year filter above to drill into a specific year
                </p>
              )}
            </div>
            <button onClick={() => {
              const rows = filteredGrants.map(g => [
                funder.name, g.programme || "", cleanName(g.organisations?.name || g.recipient_name_raw), g.organisations?.county || "", g.organisations?.sector || "", g.year || "", g.amount || 0, g.organisations?.charity_number || "",
              ]);
              downloadCSV(rows, ["Funder","Programme","Recipient","County","Sector","Year","Amount","RCN"], `${funder.name.replace(/\s+/g, "-").toLowerCase()}-${selectedYear === "all" ? "all-years" : selectedYear}-grants.csv`);
            }} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Recipient</th>
                <th className="text-left py-2 pr-3">Programme</th>
                <th className="text-left py-2 pr-3">County</th>
                <th className="text-left py-2 pr-3">Sector</th>
                <th className="text-center py-2 pr-3">Year</th>
                <th className="text-right py-2">Amount</th>
              </tr></thead>
              <tbody>
                {filteredGrants.slice(0, 300).map((g, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => g.organisations?.id && setPage(`org:${g.organisations.id}`)}>
                    <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium text-gray-900 max-w-[200px] truncate">{cleanName(g.organisations?.name || g.recipient_name_raw)}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs max-w-[150px] truncate">{g.programme || "—"}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{g.organisations?.county || "—"}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{g.organisations?.sector || "—"}</td>
                    <td className="py-2 pr-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${g.year === 2026 ? "bg-emerald-100 text-emerald-700" : g.year === 2025 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                        {g.year || "—"}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-emerald-600">{fmtFull(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredGrants.length > 300 && <p className="text-xs text-gray-400 text-center mt-3">Showing 300 of {filteredGrants.length} grants. Download CSV for full dataset.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN EXPORT — Follow The Money Page
// ============================================================
export default function FollowTheMoneyPage({ setPage, initialFunder = null }) {
  const [funders, setFunders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFunder, setSelectedFunder] = useState(null);
  const [funderGrants, setFunderGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  // Load funder list
  useEffect(() => {
    setLoading(true);
    fetchFunders().then(data => {
      if (data) {
        setFunders(data.map(f => ({
          ...f,
          total: Number(f.total_funding) || Number(f.total_funding_legacy) || 0,
          recipients: Number(f.total_recipients) || 0,
          programmes: f.programmes || [],
        })));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Auto-select if initialFunder provided
  useEffect(() => {
    if (initialFunder && funders.length > 0 && !selectedFunder) {
      const match = funders.find(f => f.name === initialFunder || f.id === initialFunder);
      if (match) handleSelectFunder(match);
    }
  }, [initialFunder, funders]);

  const handleSelectFunder = async (funder) => {
    setSelectedFunder(funder);
    setGrantsLoading(true);
    try {
      const grants = await fetchAllFunderGrants(funder.id);
      setFunderGrants(grants);
    } catch (e) {
      console.error("Failed to load grants:", e);
      setFunderGrants([]);
    }
    setGrantsLoading(false);
  };

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-12"><Spinner /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Follow the Money</h1>
        <p className="text-gray-500">Track where Irish state funding goes — every euro, every recipient, every programme</p>
      </div>

      {selectedFunder ? (
        grantsLoading ? <Spinner /> : (
          <FunderDetail
            funder={selectedFunder}
            grants={funderGrants}
            setPage={setPage}
            onBack={() => { setSelectedFunder(null); setFunderGrants([]); }}
          />
        )
      ) : (
        <FunderOverview funders={funders} onSelectFunder={handleSelectFunder} />
      )}
    </div>
  );
}
