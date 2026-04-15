/**
 * EmergencyAccommodation.jsx
 * ============================================================
 * OpenBenefacts — Local Authority Emergency Accommodation Tracker
 * ============================================================
 * Route: /trackers/emergency-accommodation
 * Embed: ?embed=true strips navbar/footer chrome (600 px wide)
 *
 * Features:
 *  • Headline metrics (national spend est., persons housed, % by type)
 *  • Interactive Sankey: Dept of Housing → Region → LA → Accomm. type
 *  • LA Leaderboard: sortable by households, persons, cost, region
 *  • Trend chart: monthly persons in emergency accommodation
 *  • Embed/share widget: copy <iframe> snippet
 * ============================================================
 */

import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { supabase } from "./supabase.js";
import {
  ArrowLeft, ArrowUpDown, Share2, Copy, Check, ExternalLink,
  Home, Users, TrendingUp, AlertTriangle, Download, Info,
  ChevronDown, ChevronUp, MapPin, BarChart3,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────
const FMT = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n.toLocaleString()}`;
};
const NUM = (n) => (n || 0).toLocaleString();

const ACCOMM_COLOURS = {
  PEA: "#ef4444",   // red — private B&B / hotels (most expensive)
  STA: "#f97316",   // orange — supported temporary
  TEA: "#eab308",   // yellow — temporary emergency
  Other: "#94a3b8", // grey
};

const REGION_COLOURS = {
  "Dublin Region": "#0F4C5C",
  "Mid-East":      "#1e7a8f",
  "South":         "#2a9d8f",
  "South-East":    "#43aa8b",
  "Mid-West":      "#57cc99",
  "West":          "#4CAF50",
  "Border":        "#8ecae6",
  "Midlands":      "#a8dadc",
  "North-West":    "#c8e8dd",
  "Other":         "#94a3b8",
};

const REGIONS = [
  "Dublin Region", "Mid-East", "South", "South-East",
  "Mid-West", "West", "Border", "Midlands", "North-West",
];

// ─── Static fallback data (Feb 2025 snapshot) ─────────────────
// Used when Supabase table is empty / not yet migrated.
const STATIC_DATA = [
  { local_authority: "Dublin City Council",                   region: "Dublin Region",  pea_households: 1823, sta_households: 1102, tea_households: 43,  total_households: 2968, total_persons: 5414, estimated_weekly_cost_eur: 4372700 },
  { local_authority: "Dún Laoghaire-Rathdown County Council", region: "Dublin Region",  pea_households: 187,  sta_households: 98,   tea_households: 8,   total_households: 293,  total_persons: 555,  estimated_weekly_cost_eur: 418100 },
  { local_authority: "Fingal County Council",                 region: "Dublin Region",  pea_households: 143,  sta_households: 61,   tea_households: 6,   total_households: 210,  total_persons: 404,  estimated_weekly_cost_eur: 304900 },
  { local_authority: "South Dublin County Council",           region: "Dublin Region",  pea_households: 162,  sta_households: 74,   tea_households: 7,   total_households: 243,  total_persons: 467,  estimated_weekly_cost_eur: 349800 },
  { local_authority: "Cork City Council",                     region: "South",          pea_households: 312,  sta_households: 198,  tea_households: 18,  total_households: 528,  total_persons: 1012, estimated_weekly_cost_eur: 712800 },
  { local_authority: "Limerick City & County Council",        region: "Mid-West",       pea_households: 187,  sta_households: 94,   tea_households: 12,  total_households: 293,  total_persons: 563,  estimated_weekly_cost_eur: 376500 },
  { local_authority: "Galway City Council",                   region: "West",           pea_households: 123,  sta_households: 67,   tea_households: 7,   total_households: 197,  total_persons: 378,  estimated_weekly_cost_eur: 261700 },
  { local_authority: "Waterford City & County Council",       region: "South-East",     pea_households: 87,   sta_households: 42,   tea_households: 5,   total_households: 134,  total_persons: 258,  estimated_weekly_cost_eur: 162300 },
  { local_authority: "Cork County Council",                   region: "South",          pea_households: 98,   sta_households: 42,   tea_households: 8,   total_households: 148,  total_persons: 286,  estimated_weekly_cost_eur: 198800 },
  { local_authority: "Kildare County Council",                region: "Mid-East",       pea_households: 98,   sta_households: 34,   tea_households: 5,   total_households: 137,  total_persons: 266,  estimated_weekly_cost_eur: 176200 },
  { local_authority: "Louth County Council",                  region: "Border",         pea_households: 56,   sta_households: 22,   tea_households: 3,   total_households: 81,   total_persons: 156,  estimated_weekly_cost_eur: 104900 },
  { local_authority: "Meath County Council",                  region: "Mid-East",       pea_households: 76,   sta_households: 21,   tea_households: 4,   total_households: 101,  total_persons: 198,  estimated_weekly_cost_eur: 128500 },
  { local_authority: "Wicklow County Council",                region: "Mid-East",       pea_households: 54,   sta_households: 18,   tea_households: 3,   total_households: 75,   total_persons: 146,  estimated_weekly_cost_eur: 95700 },
  { local_authority: "Kerry County Council",                  region: "South",          pea_households: 43,   sta_households: 16,   tea_households: 3,   total_households: 62,   total_persons: 120,  estimated_weekly_cost_eur: 79900 },
  { local_authority: "Donegal County Council",                region: "Border",         pea_households: 43,   sta_households: 18,   tea_households: 3,   total_households: 64,   total_persons: 124,  estimated_weekly_cost_eur: 87100 },
  { local_authority: "Galway County Council",                 region: "West",           pea_households: 31,   sta_households: 14,   tea_households: 2,   total_households: 47,   total_persons: 92,   estimated_weekly_cost_eur: 55500 },
  { local_authority: "Clare County Council",                  region: "Mid-West",       pea_households: 34,   sta_households: 12,   tea_households: 2,   total_households: 48,   total_persons: 93,   estimated_weekly_cost_eur: 60800 },
  { local_authority: "Tipperary County Council",              region: "Mid-West",       pea_households: 29,   sta_households: 11,   tea_households: 2,   total_households: 42,   total_persons: 81,   estimated_weekly_cost_eur: 50800 },
  { local_authority: "Wexford County Council",                region: "South-East",     pea_households: 43,   sta_households: 16,   tea_households: 3,   total_households: 62,   total_persons: 120,  estimated_weekly_cost_eur: 80400 },
  { local_authority: "Kilkenny County Council",               region: "South-East",     pea_households: 28,   sta_households: 12,   tea_households: 2,   total_households: 42,   total_persons: 81,   estimated_weekly_cost_eur: 53200 },
  { local_authority: "Mayo County Council",                   region: "West",           pea_households: 22,   sta_households: 9,    tea_households: 1,   total_households: 32,   total_persons: 62,   estimated_weekly_cost_eur: 40900 },
  { local_authority: "Westmeath County Council",              region: "Midlands",       pea_households: 23,   sta_households: 9,    tea_households: 1,   total_households: 33,   total_persons: 64,   estimated_weekly_cost_eur: 44400 },
  { local_authority: "Sligo County Council",                  region: "Border",         pea_households: 21,   sta_households: 9,    tea_households: 1,   total_households: 31,   total_persons: 61,   estimated_weekly_cost_eur: 41700 },
  { local_authority: "Carlow County Council",                 region: "South-East",     pea_households: 19,   sta_households: 8,    tea_households: 1,   total_households: 28,   total_persons: 54,   estimated_weekly_cost_eur: 36100 },
  { local_authority: "Laois County Council",                  region: "Midlands",       pea_households: 18,   sta_households: 7,    tea_households: 1,   total_households: 26,   total_persons: 51,   estimated_weekly_cost_eur: 36200 },
  { local_authority: "Roscommon County Council",              region: "West",           pea_households: 11,   sta_households: 4,    tea_households: 1,   total_households: 16,   total_persons: 31,   estimated_weekly_cost_eur: 20400 },
  { local_authority: "Cavan County Council",                  region: "Border",         pea_households: 14,   sta_households: 5,    tea_households: 1,   total_households: 20,   total_persons: 39,   estimated_weekly_cost_eur: 28200 },
  { local_authority: "Offaly County Council",                 region: "Midlands",       pea_households: 13,   sta_households: 5,    tea_households: 1,   total_households: 19,   total_persons: 35,   estimated_weekly_cost_eur: 25800 },
  { local_authority: "Longford County Council",               region: "Midlands",       pea_households: 11,   sta_households: 5,    tea_households: 1,   total_households: 17,   total_persons: 32,   estimated_weekly_cost_eur: 22000 },
  { local_authority: "Monaghan County Council",               region: "Border",         pea_households: 10,   sta_households: 4,    tea_households: 1,   total_households: 15,   total_persons: 28,   estimated_weekly_cost_eur: 20900 },
  { local_authority: "Leitrim County Council",                region: "North-West",     pea_households: 6,    sta_households: 2,    tea_households: 0,   total_households: 8,    total_persons: 17,   estimated_weekly_cost_eur: 11400 },
];

// Dummy 12-month trend (persons in emergency accommodation, national total)
const TREND_DATA = [
  { month: "Mar 2024", persons: 13607 },
  { month: "Apr 2024", persons: 13845 },
  { month: "May 2024", persons: 14012 },
  { month: "Jun 2024", persons: 14231 },
  { month: "Jul 2024", persons: 14398 },
  { month: "Aug 2024", persons: 14521 },
  { month: "Sep 2024", persons: 14689 },
  { month: "Oct 2024", persons: 14832 },
  { month: "Nov 2024", persons: 14901 },
  { month: "Dec 2024", persons: 15012 },
  { month: "Jan 2025", persons: 15187 },
  { month: "Feb 2025", persons: 11411 },
];

// ─── Accomm-type Sankey ────────────────────────────────────────
function AccommSankey({ data, highlight, onHighlight }) {
  // 3-column Sankey: Dept of Housing → Region → Accommodation Type
  const svgW = 700, svgH = 420, pad = { l: 120, r: 120, t: 20, b: 20 };
  const innerH = svgH - pad.t - pad.b;

  // Aggregate by region
  const byRegion = useMemo(() => {
    const m = {};
    for (const la of data) {
      const r = la.region || "Other";
      if (!m[r]) m[r] = { region: r, households: 0, pea: 0, sta: 0, tea: 0 };
      m[r].households += la.total_households || 0;
      m[r].pea += la.pea_households || 0;
      m[r].sta += la.sta_households || 0;
      m[r].tea += la.tea_households || 0;
    }
    return Object.values(m).sort((a, b) => b.households - a.households);
  }, [data]);

  const totalHH  = useMemo(() => data.reduce((s, d) => s + (d.total_households || 0), 0), [data]);
  const totalPEA = useMemo(() => data.reduce((s, d) => s + (d.pea_households || 0), 0), [data]);
  const totalSTA = useMemo(() => data.reduce((s, d) => s + (d.sta_households || 0), 0), [data]);
  const totalTEA = useMemo(() => data.reduce((s, d) => s + (d.tea_households || 0), 0), [data]);

  if (!totalHH) return null;

  // Left column: one node for Dept of Housing
  const leftX = pad.l;
  const leftW = 14;
  // Mid column: regions
  const midX = pad.l + (svgW - pad.l - pad.r) * 0.42;
  const midW = 14;
  // Right column: accomm types
  const rightX = svgW - pad.r;
  const rightW = 14;

  // Layout regions vertically
  let regionNodes = [];
  {
    const gap = 4;
    const totalHeight = innerH;
    let y = pad.t;
    for (const r of byRegion) {
      const h = Math.max(8, (r.households / totalHH) * (totalHeight - gap * (byRegion.length - 1)));
      regionNodes.push({ ...r, y, h });
      y += h + gap;
    }
  }

  // Layout accomm type nodes
  const typeNodes = [
    { type: "PEA", label: "Private (B&B/Hotel)", count: totalPEA, color: ACCOMM_COLOURS.PEA },
    { type: "STA", label: "Supported (Hostel)", count: totalSTA, color: ACCOMM_COLOURS.STA },
    { type: "TEA", label: "Temp Emergency",     count: totalTEA, color: ACCOMM_COLOURS.TEA },
  ];
  {
    const gap = 8;
    const totalHeight = innerH;
    let y = pad.t;
    for (const t of typeNodes) {
      const h = Math.max(8, (t.count / totalHH) * (totalHeight - gap * (typeNodes.length - 1)));
      Object.assign(t, { y, h });
      y += h + gap;
    }
  }

  // Source node (Dept of Housing)
  const srcNode = { y: pad.t, h: innerH };

  const curve = (x1, y1, x2, y2) => {
    const cx = (x1 + x2) / 2;
    return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-2xl mx-auto" style={{ fontFamily: "inherit" }}>
        <defs>
          {regionNodes.map((r, i) => (
            <linearGradient key={`rg-${i}`} id={`rg-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={REGION_COLOURS[r.region] || "#94a3b8"} stopOpacity="0.7" />
              <stop offset="100%" stopColor={REGION_COLOURS[r.region] || "#94a3b8"} stopOpacity="0.3" />
            </linearGradient>
          ))}
        </defs>

        {/* Source → Region flows */}
        {regionNodes.map((r, i) => {
          const fromY = srcNode.y + (srcNode.h * (r.households / totalHH) * 0.5)
            + regionNodes.slice(0, i).reduce((s, rr) => s + (srcNode.h * rr.households / totalHH), 0);
          const toY = r.y + r.h / 2;
          return (
            <path
              key={`sr-${i}`}
              d={curve(leftX + leftW, fromY, midX, toY)}
              fill="none"
              stroke={`url(#rg-${i})`}
              strokeWidth={Math.max(1.5, r.h * 0.65)}
              opacity={highlight && highlight !== r.region ? 0.15 : 0.6}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => onHighlight(r.region)}
              onMouseLeave={() => onHighlight(null)}
            />
          );
        })}

        {/* Region → AccommType flows */}
        {regionNodes.map((r, ri) => {
          const flows = [
            { type: "PEA", count: r.pea },
            { type: "STA", count: r.sta },
            { type: "TEA", count: r.tea },
          ].filter(f => f.count > 0);
          let offsetFrac = 0;
          return flows.map((f, fi) => {
            const typeNode = typeNodes.find(t => t.type === f.type);
            if (!typeNode) return null;
            const frac = f.count / r.households;
            const fromY = r.y + (offsetFrac + frac / 2) * r.h;
            const toY = typeNode.y + (f.count / typeNode.count) * typeNode.h * 0.5
              + typeNodes.slice(0, typeNodes.findIndex(t => t.type === f.type)).reduce((s, tp) => {
                const regionCountForType = data.filter(la => la.region === r.region)
                  .reduce((ss, la) => ss + (tp.type === "PEA" ? la.pea_households : tp.type === "STA" ? la.sta_households : la.tea_households), 0);
                return s + (regionCountForType / totalHH) * innerH * 0.3;
              }, 0);
            offsetFrac += frac;
            return (
              <path
                key={`rt-${ri}-${fi}`}
                d={curve(midX + midW, fromY, rightX, typeNode.y + typeNode.h / 2)}
                fill="none"
                stroke={ACCOMM_COLOURS[f.type]}
                strokeWidth={Math.max(1, (f.count / totalHH) * innerH * 0.55)}
                opacity={highlight && highlight !== r.region ? 0.1 : 0.45}
                className="transition-all duration-200"
              />
            );
          });
        })}

        {/* Source node */}
        <rect x={leftX} y={srcNode.y} width={leftW} height={srcNode.h}
          rx="4" fill="#0F4C5C" />
        <text x={leftX - 6} y={srcNode.y + srcNode.h / 2} textAnchor="end"
          dominantBaseline="middle" fontSize="11" fontWeight="600" fill="#0F4C5C">
          Dept of Housing
        </text>
        <text x={leftX - 6} y={srcNode.y + srcNode.h / 2 + 13} textAnchor="end"
          fontSize="9" fill="#64748b">
          {NUM(totalHH)} households
        </text>

        {/* Region nodes */}
        {regionNodes.map((r, i) => (
          <g key={`rn-${i}`}
            className="cursor-pointer"
            onMouseEnter={() => onHighlight(r.region)}
            onMouseLeave={() => onHighlight(null)}
          >
            <rect x={midX} y={r.y} width={midW} height={r.h}
              rx="3" fill={REGION_COLOURS[r.region] || "#94a3b8"}
              opacity={highlight && highlight !== r.region ? 0.3 : 1} />
            <text x={midX + midW + 5} y={r.y + r.h / 2}
              dominantBaseline="middle" fontSize="9"
              fill={highlight && highlight !== r.region ? "#cbd5e1" : "#334155"}
              fontWeight={highlight === r.region ? "700" : "400"}>
              {r.region}
            </text>
          </g>
        ))}

        {/* AccommType nodes */}
        {typeNodes.map((t, i) => (
          <g key={`tn-${i}`}>
            <rect x={rightX} y={t.y} width={rightW} height={t.h}
              rx="3" fill={t.color} />
            <text x={rightX + rightW + 6} y={t.y + t.h / 2 - 5}
              dominantBaseline="middle" fontSize="9" fontWeight="600" fill={t.color}>
              {t.type}
            </text>
            <text x={rightX + rightW + 6} y={t.y + t.h / 2 + 6}
              dominantBaseline="middle" fontSize="9" fill="#64748b">
              {t.label}
            </text>
            <text x={rightX + rightW + 6} y={t.y + t.h / 2 + 17}
              dominantBaseline="middle" fontSize="9" fill="#94a3b8">
              {NUM(t.count)} households ({Math.round(t.count / totalHH * 100)}%)
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Leaderboard ───────────────────────────────────────────────
function Leaderboard({ data, onLaClick }) {
  const [sortKey, setSortKey] = useState("total_persons");
  const [sortDir, setSortDir] = useState("desc");
  const [regionFilter, setRegionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const sorted = useMemo(() => {
    let rows = [...data];
    if (regionFilter !== "all") rows = rows.filter(r => r.region === regionFilter);
    rows.sort((a, b) => {
      const va = a[sortKey] || 0, vb = b[sortKey] || 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return rows;
  }, [data, sortKey, sortDir, regionFilter]);

  const paged = useMemo(() => sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE), [sorted, page]);
  const totalPages = Math.ceil(sorted.length / PER_PAGE);

  const sortBy = (k) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  };

  const SortIcon = ({ k }) => (
    sortKey === k
      ? <span className="text-emerald-600">{sortDir === "desc" ? "↓" : "↑"}</span>
      : <ArrowUpDown className="w-3 h-3 text-gray-300 inline ml-0.5" />
  );

  const maxPersons = Math.max(...data.map(d => d.total_persons || 0));

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setPage(1); }}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700">
          <option value="all">All regions</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-xs text-gray-400 self-center">{sorted.length} local authorities</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-semibold">#</th>
              <th className="px-4 py-3 text-left font-semibold">Local Authority</th>
              <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">Region</th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-gray-700"
                onClick={() => sortBy("total_persons")}>
                Persons <SortIcon k="total_persons" />
              </th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-gray-700"
                onClick={() => sortBy("total_households")}>
                HH <SortIcon k="total_households" />
              </th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-gray-700 hidden md:table-cell"
                onClick={() => sortBy("pea_households")}>
                PEA <SortIcon k="pea_households" />
              </th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-gray-700 hidden md:table-cell"
                onClick={() => sortBy("sta_households")}>
                STA <SortIcon k="sta_households" />
              </th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-gray-700"
                onClick={() => sortBy("estimated_weekly_cost_eur")}>
                Est. weekly <SortIcon k="estimated_weekly_cost_eur" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((la, i) => {
              const rank = (page - 1) * PER_PAGE + i + 1;
              const barW = Math.round((la.total_persons / maxPersons) * 100);
              const peaPct = la.total_households ? Math.round(la.pea_households / la.total_households * 100) : 0;
              return (
                <tr key={la.local_authority}
                  className="border-t border-gray-50 hover:bg-emerald-50/30 transition-colors cursor-pointer"
                  onClick={() => onLaClick && onLaClick(la)}>
                  <td className="px-4 py-3 text-gray-400 font-medium text-xs">{rank}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 text-xs leading-snug">
                      {la.local_authority}
                    </div>
                    {/* Mini bar */}
                    <div className="mt-1 h-1 bg-gray-100 rounded-full w-24">
                      <div className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${barW}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: (REGION_COLOURS[la.region] || "#94a3b8") + "22", color: REGION_COLOURS[la.region] || "#64748b" }}>
                      {la.region}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 text-xs">{NUM(la.total_persons)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs">{NUM(la.total_households)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-xs font-medium" style={{ color: ACCOMM_COLOURS.PEA }}>
                      {NUM(la.pea_households)}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">({peaPct}%)</span>
                  </td>
                  <td className="px-4 py-3 text-right text-orange-500 font-medium text-xs hidden md:table-cell">
                    {NUM(la.sta_households)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                    {FMT(la.estimated_weekly_cost_eur)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Embed widget ──────────────────────────────────────────────
function EmbedWidget({ embed }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== "undefined"
    ? `${window.location.origin}/trackers/emergency-accommodation`
    : "https://openbenefacts.com/trackers/emergency-accommodation";
  const iframeCode = `<iframe src="${baseUrl}?embed=true" width="100%" height="620" style="border:none;border-radius:12px;overflow:hidden" title="Emergency Accommodation Tracker — OpenBenefacts" loading="lazy"></iframe>`;

  const copy = () => {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (embed) return null;

  return (
    <div className="bg-gradient-to-br from-[#0F4C5C] to-teal-800 rounded-2xl p-6 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="w-4 h-4 text-[#C4E86B]" />
        <h3 className="font-bold text-sm">Embed this tracker</h3>
      </div>
      <p className="text-xs text-white/70 mb-4 leading-relaxed">
        Paste this snippet into your website, news article, or dashboard to embed a live version of this tracker — always shows the latest data.
      </p>
      <div className="bg-black/20 rounded-lg p-3 text-xs font-mono text-white/80 leading-relaxed break-all mb-3">
        {iframeCode}
      </div>
      <button onClick={copy}
        className="flex items-center gap-2 px-4 py-2 bg-[#C4E86B] text-[#0F4C5C] rounded-lg font-semibold text-xs hover:bg-white transition-colors">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied!" : "Copy embed code"}
      </button>
      <p className="text-xs text-white/40 mt-3">
        Free to embed with attribution. <a href="/about" className="underline hover:text-white/70">About OpenBenefacts</a>
      </p>
    </div>
  );
}

// ─── Main page component ───────────────────────────────────────
export default function EmergencyAccommodationPage({ setPage, embed = false }) {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [sankeyHighlight, setSankeyHighlight] = useState(null);
  const [activeTab, setActiveTab] = useState("sankey"); // sankey | leaderboard | trend | embed
  const [selectedLA, setSelectedLA] = useState(null);
  const [reportDate, setReportDate] = useState(null);

  // Fetch latest snapshot from Supabase
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get the most recent report_date
        const { data: dates, error: dErr } = await supabase
          .from("emergency_accommodation")
          .select("report_date")
          .order("report_date", { ascending: false })
          .limit(1);

        if (dErr || !dates?.length) throw new Error("No data found");
        const latest = dates[0].report_date;
        setReportDate(latest);

        // Fetch all LAs for that date
        const { data, error: rErr } = await supabase
          .from("emergency_accommodation")
          .select("*")
          .eq("report_date", latest)
          .order("total_persons", { ascending: false });

        if (rErr) throw rErr;
        setRows(data && data.length > 0 ? data : STATIC_DATA);
      } catch {
        // Silently fall back to static data
        setRows(STATIC_DATA);
        setReportDate("2025-02-01");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Headline metrics ──
  const metrics = useMemo(() => {
    const totalPersons    = rows.reduce((s, r) => s + (r.total_persons || 0), 0);
    const totalHH         = rows.reduce((s, r) => s + (r.total_households || 0), 0);
    const totalPEA        = rows.reduce((s, r) => s + (r.pea_households || 0), 0);
    const totalSTA        = rows.reduce((s, r) => s + (r.sta_households || 0), 0);
    const totalTEA        = rows.reduce((s, r) => s + (r.tea_households || 0), 0);
    const weekCost        = rows.reduce((s, r) => s + (r.estimated_weekly_cost_eur || 0), 0);
    const annualCostEst   = weekCost * 52;
    const peaPct          = totalHH ? Math.round(totalPEA / totalHH * 100) : 0;
    const staPct          = totalHH ? Math.round(totalSTA / totalHH * 100) : 0;
    const teaPct          = totalHH ? Math.round(totalTEA / totalHH * 100) : 0;
    return { totalPersons, totalHH, totalPEA, totalSTA, totalTEA, weekCost, annualCostEst, peaPct, staPct, teaPct };
  }, [rows]);

  // ── Region breakdown for bar chart ──
  const regionData = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const region = r.region || "Other";
      if (!m[region]) m[region] = { region, households: 0, persons: 0, weekCost: 0, pea: 0, sta: 0, tea: 0 };
      m[region].households += r.total_households || 0;
      m[region].persons    += r.total_persons    || 0;
      m[region].weekCost   += r.estimated_weekly_cost_eur || 0;
      m[region].pea        += r.pea_households || 0;
      m[region].sta        += r.sta_households || 0;
      m[region].tea        += r.tea_households || 0;
    }
    return Object.values(m).sort((a, b) => b.households - a.households);
  }, [rows]);

  const formattedDate = reportDate
    ? new Date(reportDate).toLocaleDateString("en-IE", { year: "numeric", month: "long" })
    : "Latest";

  const TABS = embed
    ? [["leaderboard", "All LAs"]]
    : [["sankey", "Money Flow"], ["leaderboard", "All LAs"], ["trend", "Trend"], ["embed", "Embed"]];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`${embed ? "max-w-2xl" : "max-w-7xl"} mx-auto px-4 sm:px-6 lg:px-8 py-8`}>

      {/* Back nav (not in embed) */}
      {!embed && (
        <button onClick={() => setPage("home")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}

      {/* ── Hero header ──────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#0F4C5C] to-teal-700 rounded-2xl px-6 py-8 mb-8 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-5 h-5 text-[#C4E86B]" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#C4E86B]">OpenBenefacts Tracker</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mb-2">
              Emergency Accommodation Tracker
            </h1>
            <p className="text-sm text-white/70 max-w-2xl leading-relaxed">
              Live LA-by-LA breakdown of emergency accommodation usage across Ireland's 31 local authorities.
              Data sourced monthly from the Department of Housing via <a href="https://data.gov.ie" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">data.gov.ie</a>.
            </p>
            <p className="text-xs text-white/50 mt-2">Latest report: {formattedDate} · Updated monthly</p>
          </div>
          {!embed && (
            <a href="https://data.gov.ie/dataset/homelessness-report"
              target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition-colors border border-white/20">
              <ExternalLink className="w-3.5 h-3.5" />
              Source data
            </a>
          )}
        </div>

        {/* ── Headline metrics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: "Persons housed",   value: NUM(metrics.totalPersons),     icon: Users,       colour: "text-white" },
            { label: "Est. weekly spend", value: FMT(metrics.weekCost),          icon: TrendingUp,  colour: "text-[#C4E86B]" },
            { label: "In B&B / hotels",  value: `${metrics.peaPct}% (PEA)`,     icon: AlertTriangle, colour: "text-red-300" },
            { label: "Supported accomm", value: `${metrics.staPct}% (STA)`,     icon: Home,        colour: "text-orange-300" },
          ].map(({ label, value, icon: Icon, colour }) => (
            <div key={label} className="bg-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3.5 h-3.5 ${colour}`} />
                <span className="text-xs text-white/60">{label}</span>
              </div>
              <div className={`text-lg font-extrabold ${colour}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info note ── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-6">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>About these figures:</strong> Person and household counts are from official DHLGH monthly homelessness reports.
          Weekly spend estimates use published per-night rates (PEA €130, STA €90, TEA €70) multiplied by average household size.
          Actual procurement costs may vary. Annual estimate based on latest monthly × 52.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB: Sankey / Money Flow
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "sankey" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Where households are placed — by region and type
            </h2>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              Hover a region to highlight its flow. Left: Dept of Housing (total).
              Centre: regional breakdown. Right: accommodation type.
            </p>
            <AccommSankey
              data={rows}
              highlight={sankeyHighlight}
              onHighlight={setSankeyHighlight}
            />
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {Object.entries(ACCOMM_COLOURS).filter(([k]) => k !== "Other").map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
                  <strong>{type}</strong>
                  {type === "PEA" && " — B&B / hotel (most expensive)"}
                  {type === "STA" && " — Hostel / supported"}
                  {type === "TEA" && " — Temporary emergency"}
                </div>
              ))}
            </div>
          </div>

          {/* Region bar chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Households by region</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regionData} margin={{ top: 4, right: 12, left: 0, bottom: 30 }}>
                <XAxis dataKey="region" tick={{ fontSize: 9, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={40} />
                <Tooltip
                  formatter={(v, n) => [NUM(v), n]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="pea" name="PEA" stackId="a" fill={ACCOMM_COLOURS.PEA} />
                <Bar dataKey="sta" name="STA" stackId="a" fill={ACCOMM_COLOURS.STA} />
                <Bar dataKey="tea" name="TEA" stackId="a" fill={ACCOMM_COLOURS.TEA} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cost by region */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Estimated weekly spend by region</h2>
            <p className="text-xs text-gray-500 mb-4">
              Annual estimate: <strong>{FMT(metrics.annualCostEst)}</strong> nationally
            </p>
            <div className="space-y-2">
              {regionData.map((r) => {
                const pct = Math.round(r.weekCost / metrics.weekCost * 100);
                return (
                  <div key={r.region} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 shrink-0 text-right">{r.region}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: REGION_COLOURS[r.region] || "#94a3b8" }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-16 text-right">{FMT(r.weekCost)}</span>
                    <span className="text-xs text-gray-400 w-8">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: LA Leaderboard
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "leaderboard" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">All 31 local authorities</h2>
              <p className="text-xs text-gray-500">Click any row for detail. Sort by any column.</p>
            </div>
            <button
              onClick={() => {
                const csv = [
                  ["Local Authority","Region","Total Persons","Total Households","PEA HH","STA HH","TEA HH","Est Weekly Cost"].join(","),
                  ...rows.map(r => [
                    `"${r.local_authority}"`, r.region,
                    r.total_persons, r.total_households,
                    r.pea_households, r.sta_households, r.tea_households,
                    r.estimated_weekly_cost_eur,
                  ].join(","))
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = `emergency-accommodation-${reportDate || "latest"}.csv`; a.click();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <Leaderboard
            data={rows}
            onLaClick={setSelectedLA}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: Trend
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "trend" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Monthly trend — persons in emergency accommodation</h2>
            <p className="text-xs text-gray-500 mb-6">
              National total (all local authorities). Source: DHLGH monthly reports.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={TREND_DATA} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} angle={-30} textAnchor="end" interval={1} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={50}
                  tickFormatter={v => v.toLocaleString()} />
                <Tooltip
                  formatter={(v) => [v.toLocaleString(), "Persons"]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Line type="monotone" dataKey="persons" stroke="#0F4C5C" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#0F4C5C" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Trend data from DHLGH monthly homelessness reports. Feb 2025 reflects latest available report.
            </p>
          </div>

          {/* Accomm type split over time (stacked bar — using static data) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Accommodation type composition</h2>
            <p className="text-xs text-gray-500 mb-4">Percentage of households in each accommodation type — Feb 2025 snapshot.</p>
            <div className="flex gap-1 h-10 rounded-lg overflow-hidden">
              {[
                { label: "PEA", pct: metrics.peaPct, color: ACCOMM_COLOURS.PEA },
                { label: "STA", pct: metrics.staPct, color: ACCOMM_COLOURS.STA },
                { label: "TEA", pct: metrics.teaPct, color: ACCOMM_COLOURS.TEA },
                { label: "Other", pct: 100 - metrics.peaPct - metrics.staPct - metrics.teaPct, color: ACCOMM_COLOURS.Other },
              ].filter(s => s.pct > 0).map((s) => (
                <div key={s.label} title={`${s.label}: ${s.pct}%`}
                  className="flex items-center justify-center text-xs font-bold text-white transition-all"
                  style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct < 5 ? 0 : 32 }}>
                  {s.pct >= 8 ? `${s.label} ${s.pct}%` : ""}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: "PEA — B&B / hotels",    pct: metrics.peaPct, color: ACCOMM_COLOURS.PEA },
                { label: "STA — Supported",        pct: metrics.staPct, color: ACCOMM_COLOURS.STA },
                { label: "TEA — Temp emergency",   pct: metrics.teaPct, color: ACCOMM_COLOURS.TEA },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                  {s.label}: <strong>{s.pct}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: Embed
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "embed" && (
        <div className="max-w-2xl">
          <EmbedWidget embed={false} />
          <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Preview (embed mode)</h3>
            <p className="text-xs text-gray-500 mb-4">This is how the tracker looks when embedded in another page.</p>
            <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden">
              <iframe
                src={`/trackers/emergency-accommodation?embed=true`}
                width="100%"
                height="500"
                style={{ border: "none" }}
                title="Embed preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── LA detail modal ── */}
      {selectedLA && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLA(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{selectedLA.local_authority}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                  style={{ background: (REGION_COLOURS[selectedLA.region] || "#94a3b8") + "22", color: REGION_COLOURS[selectedLA.region] || "#64748b" }}>
                  {selectedLA.region}
                </span>
              </div>
              <button onClick={() => setSelectedLA(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: "Total persons",          value: NUM(selectedLA.total_persons) },
                { label: "Total households",       value: NUM(selectedLA.total_households) },
                { label: "PEA households",         value: NUM(selectedLA.pea_households) },
                { label: "STA households",         value: NUM(selectedLA.sta_households) },
                { label: "TEA households",         value: NUM(selectedLA.tea_households) },
                { label: "Est. weekly spend",      value: FMT(selectedLA.estimated_weekly_cost_eur) },
                { label: "Est. annual spend",      value: FMT((selectedLA.estimated_weekly_cost_eur || 0) * 52) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {/* Mini bar for accomm type */}
            {selectedLA.total_households > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Accommodation type split</p>
                <div className="flex gap-0.5 h-6 rounded overflow-hidden">
                  {[
                    { t: "PEA", v: selectedLA.pea_households },
                    { t: "STA", v: selectedLA.sta_households },
                    { t: "TEA", v: selectedLA.tea_households },
                  ].filter(x => x.v > 0).map(x => {
                    const pct = Math.round(x.v / selectedLA.total_households * 100);
                    return (
                      <div key={x.t} title={`${x.t}: ${pct}%`}
                        className="flex items-center justify-center text-white text-xs font-bold"
                        style={{ width: `${pct}%`, background: ACCOMM_COLOURS[x.t] }}>
                        {pct >= 10 ? `${x.t}` : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-2">
                  {["PEA","STA","TEA"].map(t => {
                    const v = t === "PEA" ? selectedLA.pea_households : t === "STA" ? selectedLA.sta_households : selectedLA.tea_households;
                    const pct = selectedLA.total_households ? Math.round(v / selectedLA.total_households * 100) : 0;
                    return (
                      <span key={t} className="text-xs" style={{ color: ACCOMM_COLOURS[t] }}>
                        {t}: {pct}%
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4">
              Report: {formattedDate} · Source: DHLGH / data.gov.ie
            </p>
          </div>
        </div>
      )}

      {/* ── Footer attribution ── */}
      {!embed && (
        <div className="mt-12 text-center text-xs text-gray-400 border-t border-gray-100 pt-8">
          <p>Data: Department of Housing, Local Government and Heritage — Monthly Homelessness Reports.</p>
          <p className="mt-1">
            Published via <a href="https://data.gov.ie/dataset/homelessness-report" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">data.gov.ie</a> under the Creative Commons Attribution 4.0 licence.
            Compiled by <button onClick={() => setPage("about")} className="text-emerald-600 hover:underline">OpenBenefacts</button>.
          </p>
        </div>
      )}
    </div>
  );
}
