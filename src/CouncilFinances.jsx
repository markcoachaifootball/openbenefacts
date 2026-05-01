import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area,
} from "recharts";
import {
  ArrowLeft, ArrowRight, Building2, TrendingUp, TrendingDown, DollarSign,
  ChevronDown, ChevronUp, MapPin, BarChart3, Layers, AlertTriangle, Info,
  ArrowUpDown, Filter, ChevronRight, ChevronLeft, X, GitCompare, Eye,
  Scale, PieChart as PieIcon, Minus, Plus, Hash, Percent, Calendar, Landmark,
} from "lucide-react";
import { supabase } from "./supabase.js";

/* ── Division → Org Sector Mapping ── */
const DIVISION_SECTOR_MAP = {
  A: ["Social Services"],                                          // Housing & Building
  B: ["Social Services", "Culture, Recreation"],                   // Roads — community/transport safety
  C: ["Environment"],                                              // Water Services
  D: ["Philanthropy", "Social Services"],                          // Development Management
  E: ["Environment"],                                              // Environmental Services
  F: ["Culture, Recreation"],                                      // Recreation & Amenity
  G: ["Education, Research", "Health"],                            // Agriculture, Education, Health & Welfare
  H: null,                                                         // Miscellaneous → show ALL orgs in county
};

/* ── Council slug → county mapping ── */
const COUNCIL_COUNTY_MAP = {
  // Multiple Dublin councils all map to Dublin county
  dublin_city: "Dublin", dun_laoghaire_rathdown: "Dublin", fingal: "Dublin", south_dublin: "Dublin",
  // City councils
  cork_city: "Cork", galway_city: "Galway", limerick: "Limerick", waterford: "Waterford",
  // City-and-county councils already match their county name
};

function councilToCounty(council) {
  // Try slug-based lookup first
  if (council?.slug && COUNCIL_COUNTY_MAP[council.slug]) return COUNCIL_COUNTY_MAP[council.slug];
  // Extract from name: "Cork County Council" → "Cork", "Galway City and County Council" → "Galway"
  const name = council?.name || "";
  return name
    .replace(/ County Council$/i, "")
    .replace(/ City Council$/i, "")
    .replace(/ City and County Council$/i, "")
    .trim() || null;
}

/* ── Colours ── */
const EMERALD = "#059669";
const TEAL = "#0d9488";
const COLORS = ["#059669","#0d9488","#0891b2","#2563eb","#7c3aed","#db2777","#ea580c","#ca8a04"];
const DIV_COLORS = {
  A: "#dc2626", B: "#ea580c", C: "#0891b2", D: "#7c3aed",
  E: "#059669", F: "#db2777", G: "#ca8a04", H: "#475569",
};

/* ── Formatters ── */
const fmt = (n) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n.toLocaleString()}`;
};
const fmtFull = (n) => (n == null ? "—" : `€${n.toLocaleString()}`);
const pctStr = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const yoyChange = (curr, prev) => {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
};

/* ── Reusable Components ── */
function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-6 ${onClick ? "cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all" : ""} ${className}`}
      onClick={onClick}
    >{children}</div>
  );
}

function StatCard({ label, value, sub, trend, icon: Icon, onClick }) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${trend === "up" ? "bg-emerald-50" : trend === "down" ? "bg-red-50" : "bg-gray-50"}`}>
          {Icon && <Icon className={`w-5 h-5 ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-gray-400"}`} />}
        </div>
      </div>
    </Card>
  );
}

function DataQualityBadge({ status, isOcr }) {
  const bg = status === "OK" ? "bg-emerald-100 text-emerald-700" : status === "PARTIAL" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bg}`}>{status}</span>
      {isOcr && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500" title="Parsed from scanned PDF via OCR">OCR</span>}
    </span>
  );
}

function ChangeIndicator({ value }) {
  if (value == null) return null;
  const num = Number(value);
  const isUp = num > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-amber-600" : "text-emerald-600"}`}>
      {isUp ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
      {Math.abs(num)}%
    </span>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-4 py-3 text-sm z-50">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-600">
          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: p.color }} />
          {p.name}: {fmtFull(p.value)}
        </p>
      ))}
    </div>
  );
}

function MiniBar({ value, max, color = EMERALD }) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="w-16 bg-gray-100 rounded-full h-1.5 inline-block ml-2 align-middle">
      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   NUMBER DETAIL POPOVER
   Shows full figure, YoY change, % of total, national rank
   ──────────────────────────────────────────────────────────── */
function NumberPopover({ value, label, prevValue, totalValue, rank, totalCouncils, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const change = yoyChange(value, prevValue);
  const diff = value != null && prevValue != null ? value - prevValue : null;
  return (
    <div ref={ref} className="absolute z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64 text-sm" style={{ top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "4px" }}>
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500"><X className="w-3.5 h-3.5" /></button>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 mb-3">{fmtFull(value)}</p>
      <div className="space-y-2">
        {change && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Year-on-Year</span>
            <span className="inline-flex items-center gap-1">
              <ChangeIndicator value={change} />
              <span className="text-xs text-gray-400">({diff > 0 ? "+" : ""}{fmtFull(diff)})</span>
            </span>
          </div>
        )}
        {prevValue != null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Previous Year</span>
            <span className="tabular-nums">{fmtFull(prevValue)}</span>
          </div>
        )}
        {totalValue != null && value != null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">% of Total</span>
            <span className="tabular-nums">{pctStr(value, totalValue)}</span>
          </div>
        )}
        {rank != null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">National Rank</span>
            <span className="inline-flex items-center gap-1 font-medium">
              <Hash className="w-3 h-3 text-gray-400" aria-hidden="true" />{rank} of {totalCouncils}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Clickable number cell ── */
function ClickableNumber({ value, label, prevValue, totalValue, rank, totalCouncils, isNeg }) {
  const [open, setOpen] = useState(false);
  if (value == null) return <span>—</span>;
  return (
    <span className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`tabular-nums hover:underline decoration-dotted underline-offset-2 cursor-pointer font-medium ${isNeg ? "text-red-600 hover:text-red-700" : "text-gray-900 hover:text-emerald-700"}`}
      >
        {fmt(value)}
      </button>
      {open && (
        <NumberPopover
          value={value} label={label} prevValue={prevValue}
          totalValue={totalValue} rank={rank} totalCouncils={totalCouncils}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   INCOME SOURCE BREAKDOWN (expandable within a year row)
   ──────────────────────────────────────────────────────────── */
function IncomeBreakdown({ row, prevRow }) {
  const sources = [
    { label: "Commercial Rates", key: "rates", icon: Landmark },
    { label: "Local Property Tax", key: "local_property_tax", icon: Building2 },
    { label: "Other Income", key: null },
  ];
  const otherIncome = (row.total_income || 0) - (row.rates || 0) - (row.local_property_tax || 0);
  const otherIncomePrev = prevRow ? (prevRow.total_income || 0) - (prevRow.rates || 0) - (prevRow.local_property_tax || 0) : null;

  const items = [
    { label: "Commercial Rates", value: row.rates, prev: prevRow?.rates, color: "#2563eb" },
    { label: "Local Property Tax", value: row.local_property_tax, prev: prevRow?.local_property_tax, color: "#7c3aed" },
    { label: "Other Income (Grants, Charges, etc.)", value: otherIncome > 0 ? otherIncome : null, prev: otherIncomePrev > 0 ? otherIncomePrev : null, color: "#0891b2" },
  ];

  const pieData = items.filter(i => i.value).map(i => ({ name: i.label, value: i.value }));
  const pieColors = items.filter(i => i.value).map(i => i.color);

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Income Sources — {row.year}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {items.map((item) => {
            if (item.value == null) return null;
            const share = row.total_income ? (item.value / row.total_income) * 100 : 0;
            const ch = yoyChange(item.value, item.prev);
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700">{item.label}</span>
                  <span className="inline-flex items-center gap-2">
                    {ch && <ChangeIndicator value={ch} />}
                    <span className="font-medium tabular-nums">{fmt(item.value)}</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${share}%`, backgroundColor: item.color }} />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-xs text-gray-400">{share.toFixed(1)}% of income</span>
                  {item.prev && <span className="text-xs text-gray-400">Prev: {fmt(item.prev)}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {pieData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={60} innerRadius={30} dataKey="value" fontSize={10}
                  label={({ name, percent }) => `${name.split(" ")[0]} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtFull(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {/* Surplus/Deficit flow */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Surplus/Deficit Flow</p>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
            <span className="text-gray-500 text-xs">Before Transfers</span>
            <p className={`font-medium tabular-nums ${(row.surplus_deficit_before_transfers || 0) < 0 ? "text-red-600" : ""}`}>
              {fmt(row.surplus_deficit_before_transfers)}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" aria-hidden="true" />
          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
            <span className="text-gray-500 text-xs">Transfers</span>
            <p className="font-medium tabular-nums">{fmt(row.transfers_from_to_reserves)}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" aria-hidden="true" />
          <div className={`rounded-lg px-3 py-1.5 ${(row.overall_surplus_deficit || 0) < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
            <span className="text-gray-500 text-xs">Overall</span>
            <p className={`font-bold tabular-nums ${(row.overall_surplus_deficit || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {fmt(row.overall_surplus_deficit)}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" aria-hidden="true" />
          <div className="bg-blue-50 rounded-lg px-3 py-1.5">
            <span className="text-gray-500 text-xs">Reserve Opening → Closing</span>
            <p className="font-medium tabular-nums text-blue-700">{fmt(row.general_reserve_opening)} → {fmt(row.general_reserve_closing)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   EXPANDABLE YEAR ROW
   Click → division breakdown + income sources
   Division cards are clickable → opens division drill-down
   ──────────────────────────────────────────────────────────── */
function ExpandableYearRow({ row, prevRow, divs, allCouncilIe, isExpanded, onToggle, maxSpend, onDivisionClick }) {
  const [showIncome, setShowIncome] = useState(false);

  const yearDivs = divs
    .filter((d) => d.year === row.year && d.gross_expenditure)
    .sort((a, b) => (b.gross_expenditure || 0) - (a.gross_expenditure || 0));

  // Prev year divisions for YoY per division
  const prevYearDivMap = {};
  divs.filter(d => d.year === row.year - 1).forEach(d => { prevYearDivMap[d.division_code] = d; });

  // National rank for gross expenditure this year
  const sameYearIe = allCouncilIe.filter(r => r.year === row.year && r.total_gross_expenditure);
  const sorted = [...sameYearIe].sort((a, b) => (b.total_gross_expenditure || 0) - (a.total_gross_expenditure || 0));
  const rank = sorted.findIndex(r => r.council_id === row.council_id) + 1;

  return (
    <>
      <tr
        className={`border-b border-gray-50 cursor-pointer transition-colors ${isExpanded ? "bg-emerald-50/40" : "hover:bg-emerald-50/20"}`}
        onClick={onToggle}
      >
        <td className="py-2.5 px-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
            {row.year}
          </span>
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.total_gross_expenditure} label={`Gross Expenditure ${row.year}`}
            prevValue={prevRow?.total_gross_expenditure}
            rank={rank || null} totalCouncils={sameYearIe.length} />
          <MiniBar value={row.total_gross_expenditure} max={maxSpend} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.total_income} label={`Total Income ${row.year}`}
            prevValue={prevRow?.total_income} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.total_net_expenditure} label={`Net Expenditure ${row.year}`}
            prevValue={prevRow?.total_net_expenditure} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.rates} label={`Commercial Rates ${row.year}`}
            prevValue={prevRow?.rates} totalValue={row.total_income} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.local_property_tax} label={`Local Property Tax ${row.year}`}
            prevValue={prevRow?.local_property_tax} totalValue={row.total_income} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.overall_surplus_deficit} label={`Surplus/Deficit ${row.year}`}
            prevValue={prevRow?.overall_surplus_deficit} isNeg={row.overall_surplus_deficit < 0} />
        </td>
        <td className="text-right py-2.5 px-2">
          <ClickableNumber value={row.general_reserve_closing} label={`General Reserve ${row.year}`}
            prevValue={prevRow?.general_reserve_closing} />
        </td>
        <td className="text-center py-2.5 px-2"><DataQualityBadge status={row.source_status} isOcr={row.is_ocr} /></td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50/60 px-4 py-4">
            {/* Toggle buttons for sub-sections */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={(e) => { e.stopPropagation(); setShowIncome(false); }}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${!showIncome ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500 hover:bg-gray-100"}`}
              >
                Service Areas ({yearDivs.length})
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowIncome(true); }}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${showIncome ? "bg-blue-100 text-blue-700" : "bg-white text-gray-500 hover:bg-gray-100"}`}
              >
                Income Sources & Surplus Flow
              </button>
            </div>

            {!showIncome && yearDivs.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Service Area Breakdown — {row.year}
                  <span className="text-gray-400 font-normal ml-2">Click a division for year-over-year detail</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {yearDivs.map((d) => {
                    const totalDiv = yearDivs.reduce((s, x) => s + (x.gross_expenditure || 0), 0);
                    const share = totalDiv ? (d.gross_expenditure / totalDiv) * 100 : 0;
                    const prevDiv = prevYearDivMap[d.division_code];
                    const ch = yoyChange(d.gross_expenditure, prevDiv?.gross_expenditure);
                    return (
                      <div
                        key={d.division_code}
                        className="flex flex-col bg-white rounded-lg px-3 py-2.5 border border-gray-100 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all"
                        onClick={(e) => { e.stopPropagation(); onDivisionClick(d); }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DIV_COLORS[d.division_code] || EMERALD }} />
                          <span className="text-sm text-gray-700 font-medium flex-1 truncate">{d.division_name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                        </div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-gray-500">Gross: <span className="font-medium text-gray-900">{fmt(d.gross_expenditure)}</span></span>
                          <span className="text-gray-500">Net: <span className="font-medium text-gray-900">{fmt(d.net_expenditure)}</span></span>
                          <span className="text-gray-500">Income: <span className="font-medium text-gray-900">{fmt(d.income)}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${share}%`, backgroundColor: DIV_COLORS[d.division_code] || EMERALD }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{share.toFixed(0)}%</span>
                          {ch && <ChangeIndicator value={ch} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Stacked colour bar */}
                <div className="mt-2 flex gap-0.5 rounded-full overflow-hidden">
                  {yearDivs.map((d) => {
                    const totalDiv = yearDivs.reduce((s, x) => s + (x.gross_expenditure || 0), 0);
                    const share = totalDiv ? (d.gross_expenditure / totalDiv) * 100 : 0;
                    return (
                      <div
                        key={d.division_code}
                        className="h-3 cursor-pointer hover:h-4 transition-all"
                        style={{ width: `${share}%`, backgroundColor: DIV_COLORS[d.division_code] || EMERALD, minWidth: "4px" }}
                        title={`${d.division_name}: ${fmt(d.gross_expenditure)} (${share.toFixed(1)}%)`}
                        onClick={(e) => { e.stopPropagation(); onDivisionClick(d); }}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {showIncome && <IncomeBreakdown row={row} prevRow={prevRow} />}
          </td>
        </tr>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   DIVISION DRILL-DOWN
   Full history for a single division within a council
   ──────────────────────────────────────────────────────────── */
function DivisionDrillDown({ division, allDivs, onClose, council, onOrgClick }) {
  const [matchedOrgs, setMatchedOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState(null);
  const [showOrgs, setShowOrgs] = useState(true);
  const [orgSort, setOrgSort] = useState("total_grant_amount");
  const [orgSortDir, setOrgSortDir] = useState("desc");
  const panelRef = useRef(null);

  // Scroll into view when panel opens
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [division.division_code]);

  // Fetch matching orgs on mount (auto-load)
  // null sectors = show all orgs in county; array = filter by those sectors
  useEffect(() => {
    const county = councilToCounty(council);
    if (!county) return;
    const sectors = DIVISION_SECTOR_MAP[division.division_code]; // null = all, [] would mean none

    setOrgsLoading(true);
    setMatchedOrgs([]);
    setOrgsError(null);
    (async () => {
      try {
        let query = supabase
          .from("org_summary")
          .select("id,name,sector,county,gross_income,gross_expenditure,total_grant_amount,employees")
          .eq("county", county)
          .order("total_grant_amount", { ascending: false, nullsFirst: false })
          .limit(100);
        // If sectors is an array, filter; if null, show all orgs in the county
        if (Array.isArray(sectors) && sectors.length > 0) {
          query = query.in("sector", sectors);
        }
        const { data, error } = await query;
        if (error) throw error;
        setMatchedOrgs(data || []);
      } catch (e) {
        setOrgsError(e.message);
      } finally {
        setOrgsLoading(false);
      }
    })();
  }, [division.division_code, council]);

  const sortedOrgs = useMemo(() => {
    return [...matchedOrgs].sort((a, b) => {
      const va = a[orgSort] ?? -Infinity;
      const vb = b[orgSort] ?? -Infinity;
      return orgSortDir === "desc" ? vb - va : va - vb;
    });
  }, [matchedOrgs, orgSort, orgSortDir]);
  const divHistory = allDivs
    .filter((d) => d.division_code === division.division_code)
    .sort((a, b) => a.year - b.year);

  const trendData = divHistory.map((d) => ({
    year: d.year,
    "Gross Expenditure": d.gross_expenditure,
    "Net Expenditure": d.net_expenditure,
    "Income": d.income,
  }));

  const latest = divHistory[divHistory.length - 1];
  const first = divHistory[0];
  const prev = divHistory[divHistory.length - 2];
  const change = yoyChange(latest?.gross_expenditure, prev?.gross_expenditure);

  // Total change over whole period
  const totalChange = yoyChange(latest?.gross_expenditure, first?.gross_expenditure);

  // Cost recovery ratio
  const recoveryRate = latest?.income && latest?.gross_expenditure
    ? ((latest.income / latest.gross_expenditure) * 100).toFixed(1)
    : null;

  return (
    <div ref={panelRef} className="bg-white rounded-xl border-2 border-emerald-200 shadow-lg p-6 mb-6 relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: DIV_COLORS[division.division_code] || EMERALD }} />
        <h4 className="text-lg font-semibold text-gray-900">{division.division_name}</h4>
        {change && <ChangeIndicator value={change} />}
        <span className="text-xs text-gray-400">({divHistory.length} years)</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Latest Gross Exp.</p>
          <p className="text-lg font-bold">{fmt(latest?.gross_expenditure)}</p>
          <p className="text-xs text-gray-400">{latest?.year}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Latest Net Exp.</p>
          <p className="text-lg font-bold">{fmt(latest?.net_expenditure)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Latest Income</p>
          <p className="text-lg font-bold">{fmt(latest?.income)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Cost Recovery</p>
          <p className="text-lg font-bold">{recoveryRate ? `${recoveryRate}%` : "—"}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Change ({first?.year}–{latest?.year})</p>
          <p className="text-lg font-bold">{totalChange ? `${totalChange > 0 ? "+" : ""}${totalChange}%` : "—"}</p>
        </div>
      </div>

      {trendData.length > 1 && (
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="year" fontSize={12} />
              <YAxis tickFormatter={fmt} fontSize={12} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="Gross Expenditure" fill={DIV_COLORS[division.division_code] || EMERALD} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Income" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 px-2 text-gray-500 font-medium">Year</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Gross Exp.</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Income</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Net Exp.</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Recovery %</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">YoY</th>
            </tr>
          </thead>
          <tbody>
            {divHistory.map((d, i) => {
              const prevRow = divHistory[i - 1];
              const ch = yoyChange(d.gross_expenditure, prevRow?.gross_expenditure);
              const recovery = d.income && d.gross_expenditure ? ((d.income / d.gross_expenditure) * 100).toFixed(1) : null;
              return (
                <tr key={d.year} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-2 font-medium">{d.year}</td>
                  <td className="text-right py-2 px-2 tabular-nums font-medium">{fmt(d.gross_expenditure)}</td>
                  <td className="text-right py-2 px-2 tabular-nums">{fmt(d.income)}</td>
                  <td className="text-right py-2 px-2 tabular-nums">{fmt(d.net_expenditure)}</td>
                  <td className="text-right py-2 px-2 tabular-nums">{recovery ? `${recovery}%` : "—"}</td>
                  <td className="text-right py-2 px-2">{ch ? <ChangeIndicator value={ch} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Organisations in this area ── */}
      {councilToCounty(council) && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowOrgs(!showOrgs)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            {showOrgs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Building2 className="w-4 h-4" />
            Organisations Receiving Funding in {councilToCounty(council)}
          </button>
          <p className="text-xs text-gray-400 mt-1 ml-10">
            {DIVISION_SECTOR_MAP[division.division_code] === null
              ? `All nonprofits in ${councilToCounty(council)} — this division covers diverse spending areas`
              : `Nonprofits in ${councilToCounty(council)} classified under ${(DIVISION_SECTOR_MAP[division.division_code] || []).join(", ")}`
            }
          </p>

          {showOrgs && (
            <div className="mt-4">
              {orgsLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  Loading organisations...
                </div>
              )}
              {orgsError && (
                <p className="text-sm text-amber-600 py-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {orgsError}
                </p>
              )}
              {!orgsLoading && !orgsError && sortedOrgs.length === 0 && (
                <p className="text-sm text-gray-400 py-3">No matching organisations found in {councilToCounty(council)}.</p>
              )}
              {!orgsLoading && sortedOrgs.length > 0 && (
                <>
                  <div className="text-xs text-gray-500 mb-2">{sortedOrgs.length} organisation{sortedOrgs.length !== 1 ? "s" : ""} found</div>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Organisation</th>
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Sector</th>
                          {[["total_grant_amount", "Gov. Funding"], ["gross_income", "Income"], ["gross_expenditure", "Expenditure"], ["employees", "Staff"]].map(([key, label]) => (
                            <th
                              key={key}
                              className="text-right py-2 px-3 text-gray-500 font-medium cursor-pointer hover:text-gray-700"
                              onClick={() => { if (orgSort === key) setOrgSortDir(d => d === "desc" ? "asc" : "desc"); else { setOrgSort(key); setOrgSortDir("desc"); } }}
                            >
                              <span className="inline-flex items-center gap-1">{label}
                                {orgSort === key ? (orgSortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedOrgs.map((org) => (
                          <tr
                            key={org.id}
                            className="border-b border-gray-50 hover:bg-emerald-50/30 cursor-pointer transition-colors"
                            onClick={() => onOrgClick && onOrgClick(org)}
                          >
                            <td className="py-2 px-3 font-medium text-gray-900">
                              <span className="inline-flex items-center gap-1.5">
                                {org.name}
                                {onOrgClick && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-500 text-xs">{org.sector}</td>
                            <td className="text-right py-2 px-3 tabular-nums font-medium">{fmt(org.total_grant_amount)}</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmt(org.gross_income)}</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmt(org.gross_expenditure)}</td>
                            <td className="text-right py-2 px-3 tabular-nums text-gray-500">{org.employees ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedOrgs.length >= 100 && (
                    <p className="text-xs text-gray-400 mt-2">Showing top 100 results. View full list on the Organisations page.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   EXPANDABLE BALANCE SHEET ROW
   ──────────────────────────────────────────────────────────── */
function ExpandableBSRow({ row, prevRow, isExpanded, onToggle }) {
  const netCurrent = (row.current_assets_total || 0) - (row.current_liabilities_total || 0);

  return (
    <>
      <tr
        className={`border-b border-gray-50 cursor-pointer transition-colors ${isExpanded ? "bg-emerald-50/40" : "hover:bg-emerald-50/20"}`}
        onClick={onToggle}
      >
        <td className="py-2.5 px-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
            {row.year}
          </span>
        </td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.fixed_assets_total} label="Fixed Assets" prevValue={prevRow?.fixed_assets_total} /></td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.current_assets_total} label="Current Assets" prevValue={prevRow?.current_assets_total} /></td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.current_liabilities_total} label="Current Liabilities" prevValue={prevRow?.current_liabilities_total} /></td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.loans_payable} label="Loans Payable" prevValue={prevRow?.loans_payable} /></td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.net_assets} label="Net Assets" prevValue={prevRow?.net_assets} /></td>
        <td className="text-right py-2.5 px-2"><ClickableNumber value={row.total_reserves} label="Total Reserves" prevValue={prevRow?.total_reserves} /></td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-gray-50/60 px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Fixed Assets Breakdown */}
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Fixed Assets Breakdown</p>
                <div className="space-y-2">
                  {[
                    ["Operational", row.fixed_assets_operational, prevRow?.fixed_assets_operational],
                    ["Infrastructural", row.fixed_assets_infrastructural, prevRow?.fixed_assets_infrastructural],
                    ["Community", row.fixed_assets_community, prevRow?.fixed_assets_community],
                    ["Non-Operational", row.fixed_assets_non_operational, prevRow?.fixed_assets_non_operational],
                  ].map(([label, val, prev]) => {
                    const ch = yoyChange(val, prev);
                    const share = row.fixed_assets_total ? (val || 0) / row.fixed_assets_total * 100 : 0;
                    return val != null ? (
                      <div key={label}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{label}</span>
                          <span className="inline-flex items-center gap-2">
                            {ch && <ChangeIndicator value={ch} />}
                            <span className="tabular-nums font-medium">{fmt(val)}</span>
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-0.5">
                          <div className="h-1 rounded-full bg-purple-400" style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    ) : null;
                  })}
                  <div className="flex justify-between border-t border-gray-100 pt-2 text-sm font-semibold">
                    <span>Total Fixed Assets</span>
                    <span className="tabular-nums">{fmt(row.fixed_assets_total)}</span>
                  </div>
                </div>
                {row.work_in_progress != null && (
                  <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between text-sm">
                    <span className="text-gray-500">Work in Progress</span>
                    <span className="tabular-nums">{fmt(row.work_in_progress)}</span>
                  </div>
                )}
                {row.long_term_debtors != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Long Term Debtors</span>
                    <span className="tabular-nums">{fmt(row.long_term_debtors)}</span>
                  </div>
                )}
              </div>

              {/* Working Capital */}
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Working Capital</p>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current Assets</span>
                    <span className="inline-flex items-center gap-2">
                      {yoyChange(row.current_assets_total, prevRow?.current_assets_total) && <ChangeIndicator value={yoyChange(row.current_assets_total, prevRow?.current_assets_total)} />}
                      <span className="tabular-nums font-medium text-emerald-700">{fmt(row.current_assets_total)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current Liabilities</span>
                    <span className="inline-flex items-center gap-2">
                      {yoyChange(row.current_liabilities_total, prevRow?.current_liabilities_total) && <ChangeIndicator value={yoyChange(row.current_liabilities_total, prevRow?.current_liabilities_total)} />}
                      <span className="tabular-nums font-medium text-red-600">({fmt(row.current_liabilities_total)})</span>
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-2 text-sm font-semibold">
                    <span>Net Current Assets</span>
                    <span className={`tabular-nums ${netCurrent < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {fmt(row.net_current_assets || netCurrent)}
                    </span>
                  </div>
                  {/* Ratio */}
                  {row.current_assets_total && row.current_liabilities_total && (
                    <div className="bg-gray-50 rounded-lg p-2 mt-2">
                      <p className="text-xs text-gray-500">Current Ratio</p>
                      <p className="text-lg font-bold">
                        {(row.current_assets_total / row.current_liabilities_total).toFixed(2)}x
                      </p>
                      <p className="text-xs text-gray-400">{row.current_assets_total / row.current_liabilities_total >= 1 ? "Assets cover liabilities" : "Liabilities exceed assets"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Long-term Financing & Reserves */}
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Financing & Reserves</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Loans Payable</span>
                      <span className="tabular-nums font-medium">{fmt(row.loans_payable)}</span>
                    </div>
                    {row.loans_payable && prevRow?.loans_payable && (
                      <div className="text-xs text-gray-400 text-right">
                        {Number(yoyChange(row.loans_payable, prevRow.loans_payable)) < 0 ? "Reducing" : "Increasing"} · <ChangeIndicator value={yoyChange(row.loans_payable, prevRow.loans_payable)} />
                      </div>
                    )}
                  </div>
                  {row.creditors_long_term_total != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Other Long-term Creditors</span>
                      <span className="tabular-nums">{fmt(row.creditors_long_term_total)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-semibold">
                    <span>Net Assets</span>
                    <span className="tabular-nums">{fmt(row.net_assets)}</span>
                  </div>

                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Financed By</p>
                    {row.capitalisation_account != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Capitalisation Account</span>
                        <span className="tabular-nums">{fmt(row.capitalisation_account)}</span>
                      </div>
                    )}
                    {row.general_revenue_reserve != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Revenue Reserves</span>
                        <span className="tabular-nums">{fmt(row.general_revenue_reserve)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1 mt-1">
                      <span>Total Reserves</span>
                      <span className="tabular-nums">{fmt(row.total_reserves)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Balance sheet identity check */}
            {row.net_assets != null && row.total_reserves != null && (
              <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${row.net_assets === row.total_reserves ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {row.net_assets === row.total_reserves
                  ? "✓ Balance sheet balances: Net Assets = Total Reserves"
                  : `⚠ Imbalance: Net Assets (${fmtFull(row.net_assets)}) ≠ Reserves (${fmtFull(row.total_reserves)}) — difference of ${fmtFull(Math.abs(row.net_assets - row.total_reserves))}`
                }
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPARE PANEL
   ──────────────────────────────────────────────────────────── */
function ComparePanel({ councils, ieData, compareIds, onRemove, onClose }) {
  const compareCouncils = councils.filter((c) => compareIds.includes(c.id));
  const latestByCouncil = useMemo(() => {
    const map = {};
    ieData.forEach((r) => {
      const cid = r.council_id;
      if (compareIds.includes(cid) && (!map[cid] || r.year > map[cid].year)) map[cid] = r;
    });
    return map;
  }, [ieData, compareIds]);

  const metrics = [
    ["total_gross_expenditure", "Gross Expenditure"],
    ["total_income", "Total Income"],
    ["total_net_expenditure", "Net Expenditure"],
    ["rates", "Commercial Rates"],
    ["local_property_tax", "Local Property Tax"],
    ["general_reserve_closing", "General Reserve"],
    ["overall_surplus_deficit", "Surplus/Deficit"],
  ];

  const shortName = (c) => c.name.replace(" County Council", "").replace(" City Council", " City").replace(" City and County Council", "");

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-lg p-6 mb-6 relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      <div className="flex items-center gap-2 mb-6">
        <GitCompare className="w-5 h-5 text-blue-600" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-gray-900">Council Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-gray-500 font-medium w-44">Metric</th>
              {compareCouncils.map((c) => (
                <th key={c.id} className="text-right py-3 px-2 font-medium text-gray-900">
                  <span className="inline-flex items-center gap-1">
                    {shortName(c)}
                    <button onClick={() => onRemove(c.id)} className="text-gray-300 hover:text-red-400 ml-1"><X className="w-3 h-3" /></button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([key, label]) => {
              const vals = compareCouncils.map((c) => latestByCouncil[c.id]?.[key]);
              const maxVal = Math.max(...vals.filter(Boolean).map(Math.abs));
              const bestIdx = vals.indexOf(Math.max(...vals.filter((v) => v != null)));
              return (
                <tr key={key} className="border-b border-gray-50">
                  <td className="py-3 px-2 text-gray-600 font-medium">{label}</td>
                  {compareCouncils.map((c, i) => {
                    const v = latestByCouncil[c.id]?.[key];
                    const isBest = i === bestIdx && vals.filter(Boolean).length > 1;
                    return (
                      <td key={c.id} className={`text-right py-3 px-2 tabular-nums ${isBest ? "font-bold text-emerald-700" : ""} ${key === "overall_surplus_deficit" && v < 0 ? "text-red-600" : ""}`}>
                        {fmtFull(v)}
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                          <div className="h-1 rounded-full bg-blue-400" style={{ width: `${maxVal ? (Math.abs(v || 0) / maxVal) * 100 : 0}%` }} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW PAGE
   ═══════════════════════════════════════════════════════════════ */
function CouncilOverview({ councils, ieData, setSelectedCouncil }) {
  const [sortField, setSortField] = useState("total_gross_expenditure");
  const [sortDir, setSortDir] = useState("desc");
  const [filterType, setFilterType] = useState("all");
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const latestByCouncil = useMemo(() => {
    const map = {};
    ieData.forEach((r) => { if (!map[r.council_id] || r.year > map[r.council_id].year) map[r.council_id] = r; });
    return map;
  }, [ieData]);

  const rows = useMemo(() => {
    return councils
      .filter((c) => filterType === "all" || c.council_type === filterType)
      .filter((c) => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map((c) => ({ ...c, latest: latestByCouncil[c.id] || {} }))
      .sort((a, b) => {
        const va = a.latest[sortField] ?? -Infinity;
        const vb = b.latest[sortField] ?? -Infinity;
        return sortDir === "desc" ? vb - va : va - vb;
      });
  }, [councils, latestByCouncil, sortField, sortDir, filterType, searchTerm]);

  const totals = useMemo(() => {
    const vals = Object.values(latestByCouncil);
    return {
      councils: councils.length,
      totalSpend: vals.reduce((s, r) => s + (r.total_gross_expenditure || 0), 0),
      totalIncome: vals.reduce((s, r) => s + (r.total_income || 0), 0),
      avgReserve: vals.filter((r) => r.general_reserve_closing).length
        ? vals.reduce((s, r) => s + (r.general_reserve_closing || 0), 0) / vals.filter((r) => r.general_reserve_closing).length
        : 0,
    };
  }, [councils, latestByCouncil]);

  const barData = useMemo(() => {
    return rows
      .filter((r) => r.latest.total_gross_expenditure)
      .slice(0, 15)
      .map((r) => ({
        name: r.name.replace(" County Council", "").replace(" City Council", " City").replace(" City and County Council", ""),
        spend: r.latest.total_gross_expenditure,
        income: r.latest.total_income,
        id: r.id,
        _council: r,
      }));
  }, [rows]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const toggleCompare = (id) => {
    setCompareIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  const handleBarClick = (data) => {
    if (data?.activePayload?.[0]?.payload?._council) setSelectedCouncil(data.activePayload[0].payload._council);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Local Authorities" value={totals.councils} icon={Building2} />
        <StatCard label="Total Gross Expenditure" value={fmt(totals.totalSpend)} sub="Latest year per council" icon={DollarSign} trend="up" />
        <StatCard label="Total Income" value={fmt(totals.totalIncome)} icon={TrendingUp} trend="up" />
        <StatCard label="Avg General Reserve" value={fmt(totals.avgReserve)} icon={Layers} />
      </div>

      {compareIds.length >= 2 && (
        <ComparePanel councils={councils} ieData={ieData} compareIds={compareIds}
          onRemove={(id) => toggleCompare(id)} onClose={() => { setCompareIds([]); setCompareMode(false); }} />
      )}

      <Card className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Gross Expenditure by Council (Latest Year)</h3>
          <span className="text-xs text-gray-400">Click a bar to view details →</span>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 120, right: 20 }} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={fmt} fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={11} width={120} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="spend" name="Gross Expenditure" fill={EMERALD} radius={[0, 4, 4, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">All Councils</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" placeholder="Search councils..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 text-gray-400" aria-hidden="true" />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                <option value="all">All types</option>
                <option value="county">County</option>
                <option value="city">City</option>
                <option value="city_and_county">City & County</option>
              </select>
            </div>
            <button onClick={() => { setCompareMode(!compareMode); if (compareMode) setCompareIds([]); }}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${compareMode ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />{compareMode ? `Compare (${compareIds.length}/4)` : "Compare"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {compareMode && <th className="py-3 px-2 w-8" />}
                <th className="text-left py-3 px-2 text-gray-500 font-medium">Council</th>
                {[["total_gross_expenditure","Gross Exp."],["total_income","Income"],["total_net_expenditure","Net Exp."],["general_reserve_closing","Reserve"]].map(([key, label]) => (
                  <th key={key} className="text-right py-3 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-700" onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center gap-1">{label}
                      {sortField === key ? (sortDir === "desc" ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronUp className="w-3 h-3" aria-hidden="true" />) : <ArrowUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />}
                    </span>
                  </th>
                ))}
                <th className="text-center py-3 px-2 text-gray-500 font-medium">Year</th>
                <th className="text-center py-3 px-2 text-gray-500 font-medium">Quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isComparing = compareIds.includes(r.id);
                return (
                  <tr key={r.id}
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${isComparing ? "bg-blue-50/40" : "hover:bg-emerald-50/30"}`}
                    onClick={() => compareMode ? toggleCompare(r.id) : setSelectedCouncil(r)}>
                    {compareMode && (
                      <td className="py-3 px-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isComparing ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
                          {isComparing && <span className="text-white text-xs">✓</span>}
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-2 font-medium text-gray-900">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5 text-right tabular-nums">{idx + 1}.</span>
                        <MapPin className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                        <span className="hover:text-emerald-700 transition-colors">
                          {r.name.replace(" County Council", "").replace(" City Council", " City").replace(" City and County Council", "")}
                        </span>
                        {!compareMode && <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto flex-shrink-0" aria-hidden="true" />}
                      </span>
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums">{fmt(r.latest.total_gross_expenditure)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{fmt(r.latest.total_income)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{fmt(r.latest.total_net_expenditure)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{fmt(r.latest.general_reserve_closing)}</td>
                    <td className="text-center py-3 px-2 text-gray-500">{r.latest.year || "—"}</td>
                    <td className="text-center py-3 px-2"><DataQualityBadge status={r.latest.source_status} isOcr={r.latest.is_ocr} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="text-center text-gray-400 py-8">No councils match your search.</p>}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COUNCIL DETAIL PAGE
   ═══════════════════════════════════════════════════════════════ */
function CouncilDetail({ council, councils, ieData, bsData, divData, onBack, onNavigate, setPage }) {
  const [tab, setTab] = useState("overview");
  const [expandedYear, setExpandedYear] = useState(null);
  const [expandedBSYear, setExpandedBSYear] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(null);

  const ie = useMemo(() => ieData.filter((r) => r.council_id === council.id).sort((a, b) => a.year - b.year), [ieData, council]);
  const bs = useMemo(() => bsData.filter((r) => r.council_id === council.id).sort((a, b) => a.year - b.year), [bsData, council]);
  const divs = useMemo(() => divData.filter((r) => r.council_id === council.id), [divData, council]);

  const latest = ie[ie.length - 1] || {};
  const prev = ie[ie.length - 2] || {};
  const yoySpend = yoyChange(latest.total_gross_expenditure, prev.total_gross_expenditure);
  const maxSpend = Math.max(...ie.map((r) => r.total_gross_expenditure || 0));

  // Build previous-row map for quick lookup
  const ieMap = {};
  ie.forEach((r, i) => { ieMap[r.year] = { row: r, prev: ie[i - 1] || null }; });
  const bsMap = {};
  bs.forEach((r, i) => { bsMap[r.year] = { row: r, prev: bs[i - 1] || null }; });

  const trendData = ie.map((r) => ({ year: r.year, "Gross Expenditure": r.total_gross_expenditure, "Income": r.total_income, "Net Expenditure": r.total_net_expenditure }));
  const reserveData = ie.map((r) => ({ year: r.year, "Opening": r.general_reserve_opening, "Closing": r.general_reserve_closing }));

  const latestDivs = useMemo(() => {
    if (!ie.length) return [];
    return divs.filter((d) => d.year === latest.year && d.gross_expenditure).sort((a, b) => (b.gross_expenditure || 0) - (a.gross_expenditure || 0));
  }, [divs, latest, ie]);

  const divPieData = latestDivs.map((d) => ({ name: d.division_name.replace(/^[A-H]\.\s*/, ""), value: d.gross_expenditure || 0, code: d.division_code, _raw: d }));

  const divTrendData = useMemo(() => {
    const years = [...new Set(divs.map((d) => d.year))].sort();
    return years.map((y) => { const row = { year: y }; divs.filter((d) => d.year === y).forEach((d) => { row[d.division_name.replace(/^[A-H]\.\s*/, "")] = d.net_expenditure; }); return row; });
  }, [divs]);
  const divNames = [...new Set(divs.map((d) => d.division_name.replace(/^[A-H]\.\s*/, "")))];

  const bsTrendData = bs.map((r) => ({ year: r.year, "Fixed Assets": r.fixed_assets_total, "Net Assets": r.net_assets, "Loans Payable": r.loans_payable, "Reserves": r.total_reserves }));

  // Prev/Next council navigation
  const sortedCouncils = [...councils].sort((a, b) => a.name.localeCompare(b.name));
  const councilIdx = sortedCouncils.findIndex(c => c.id === council.id);
  const prevCouncil = councilIdx > 0 ? sortedCouncils[councilIdx - 1] : null;
  const nextCouncil = councilIdx < sortedCouncils.length - 1 ? sortedCouncils[councilIdx + 1] : null;

  const shortName = (c) => c.name.replace(" County Council", "").replace(" City Council", " City").replace(" City and County Council", "");

  return (
    <div>
      {/* Header with prev/next navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All councils
        </button>
        <div className="flex items-center gap-2">
          {prevCouncil && (
            <button onClick={() => onNavigate(prevCouncil)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50">
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> {shortName(prevCouncil)}
            </button>
          )}
          {nextCouncil && (
            <button onClick={() => onNavigate(nextCouncil)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50">
              {shortName(nextCouncil)} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{council.name}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {ie.length} years of data ({ie[0]?.year}–{latest.year})
            {latest.source_status && <> · <DataQualityBadge status={latest.source_status} isOcr={latest.is_ocr} /></>}
          </p>
        </div>
        {yoySpend && (
          <div className={`text-sm font-medium px-3 py-1.5 rounded-full ${Number(yoySpend) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {Number(yoySpend) > 0 ? "↑" : "↓"} {Math.abs(Number(yoySpend))}% spend YoY
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Gross Expenditure" value={fmt(latest.total_gross_expenditure)} sub={`${latest.year}`} icon={DollarSign} trend="up" onClick={() => setTab("overview")} />
        <StatCard label="Total Income" value={fmt(latest.total_income)} sub={`${latest.year}`} icon={TrendingUp} trend="up" onClick={() => setTab("overview")} />
        <StatCard label="Service Areas" value={`${latestDivs.length} divisions`} sub="Click to explore" icon={PieIcon} onClick={() => setTab("divisions")} />
        <StatCard label="Net Assets" value={fmt(bs[bs.length - 1]?.net_assets)} sub={`${bs[bs.length - 1]?.year || ""}`} icon={Scale} onClick={() => setTab("balance")} />
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {[["overview", "Spending Trends"], ["divisions", "Service Areas"], ["balance", "Balance Sheet"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Income & Expenditure Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" fontSize={12} /><YAxis tickFormatter={fmt} fontSize={12} />
                  <Tooltip content={<ChartTooltip />} /><Legend />
                  <Line type="monotone" dataKey="Gross Expenditure" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Income" stroke={EMERALD} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Net Expenditure" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">General Revenue Reserve</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reserveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" fontSize={12} /><YAxis tickFormatter={fmt} fontSize={12} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Closing" stroke={EMERALD} fill="#059669" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Year-by-Year Detail</h3>
              <span className="text-xs text-gray-400">Click any row or number for more detail</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Year</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Gross Exp.</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Income</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Net Exp.</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Rates</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">LPT</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Surplus/Deficit</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Reserve</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {ie.map((r, i) => (
                    <ExpandableYearRow
                      key={r.year}
                      row={r}
                      prevRow={ie[i - 1] || null}
                      divs={divs}
                      allCouncilIe={ieData}
                      isExpanded={expandedYear === r.year}
                      onToggle={() => setExpandedYear(expandedYear === r.year ? null : r.year)}
                      maxSpend={maxSpend}
                      onDivisionClick={(d) => { setSelectedDivision(d); setTab("divisions"); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── DIVISIONS TAB ── */}
      {tab === "divisions" && (
        <div className="space-y-6">
          {selectedDivision && (
            <DivisionDrillDown
              division={selectedDivision}
              allDivs={divs}
              onClose={() => setSelectedDivision(null)}
              council={council}
              onOrgClick={(org) => { if (setPage) setPage(`org:${org.id}`); }}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Spending by Service Area ({latest.year})</h3>
                <span className="text-xs text-gray-400">Click a slice →</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={divPieData} cx="50%" cy="50%" outerRadius={100} dataKey="value"
                      label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={10} cursor="pointer"
                      onClick={(data) => { if (data?._raw) setSelectedDivision(data._raw); }}>
                      {divPieData.map((d, i) => (
                        <Cell key={i} fill={DIV_COLORS[d.code] || COLORS[i]}
                          stroke={selectedDivision?.division_code === d.code ? "#000" : "none"}
                          strokeWidth={selectedDivision?.division_code === d.code ? 2 : 0} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtFull(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Service Area Breakdown ({latest.year})</h3>
                <span className="text-xs text-gray-400">Click for trend</span>
              </div>
              <div className="space-y-2">
                {latestDivs.map((d) => {
                  const total = latestDivs.reduce((s, x) => s + (x.gross_expenditure || 0), 0);
                  const share = total ? (d.gross_expenditure / total) * 100 : 0;
                  const isActive = selectedDivision?.division_code === d.division_code;
                  const prevYearDiv = divs.find((x) => x.division_code === d.division_code && x.year === latest.year - 1);
                  const ch = yoyChange(d.gross_expenditure, prevYearDiv?.gross_expenditure);
                  const recovery = d.income && d.gross_expenditure ? ((d.income / d.gross_expenditure) * 100).toFixed(0) : null;
                  return (
                    <div key={d.division_code}
                      className={`rounded-lg p-2.5 cursor-pointer transition-all ${isActive ? "bg-emerald-50 ring-2 ring-emerald-300" : "hover:bg-gray-50"}`}
                      onClick={() => setSelectedDivision(isActive ? null : d)}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: DIV_COLORS[d.division_code] || EMERALD }} />
                          {d.division_name}
                          <ChevronRight className="w-3 h-3 text-gray-300" aria-hidden="true" />
                        </span>
                        <span className="inline-flex items-center gap-2">
                          {ch && <ChangeIndicator value={ch} />}
                          <span className="text-gray-900 tabular-nums font-medium">{fmt(d.gross_expenditure)}</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: DIV_COLORS[d.division_code] || EMERALD }} />
                      </div>
                      <div className="flex justify-between mt-0.5 text-xs text-gray-400">
                        <span>{share.toFixed(1)}% of total</span>
                        <span>Net: {fmt(d.net_expenditure)} · Recovery: {recovery ? `${recovery}%` : "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {divTrendData.length > 1 && (
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Area Net Expenditure Over Time</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={divTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" fontSize={12} /><YAxis tickFormatter={fmt} fontSize={12} />
                    <Tooltip content={<ChartTooltip />} /><Legend />
                    {divNames.map((name, i) => (
                      <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={Object.values(DIV_COLORS)[i]} fill={Object.values(DIV_COLORS)[i]} fillOpacity={0.6} cursor="pointer" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* All Years × All Divisions matrix */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">All Years × All Divisions</h3>
            <p className="text-xs text-gray-400 mb-3">Click any division row for its full history</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-1.5 text-gray-500 font-medium sticky left-0 bg-white z-10">Division</th>
                    {[...new Set(divs.map((d) => d.year))].sort().map((y) => (
                      <th key={y} className="text-right py-2 px-1.5 text-gray-500 font-medium">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(divs.map((d) => d.division_code))].sort().map((code) => {
                    const codeDivs = divs.filter((d) => d.division_code === code);
                    const years = [...new Set(divs.map((d) => d.year))].sort();
                    const name = codeDivs[0]?.division_name || code;
                    const isActive = selectedDivision?.division_code === code;
                    return (
                      <tr key={code}
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${isActive ? "bg-emerald-50/40" : "hover:bg-gray-50"}`}
                        onClick={() => setSelectedDivision(isActive ? null : codeDivs[0])}>
                        <td className="py-1.5 px-1.5 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap z-10">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DIV_COLORS[code] || EMERALD }} />
                            {name}
                          </span>
                        </td>
                        {years.map((y) => {
                          const d = codeDivs.find((x) => x.year === y);
                          return <td key={y} className="text-right py-1.5 px-1.5 tabular-nums text-gray-600">{d ? fmt(d.gross_expenditure) : "—"}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── BALANCE SHEET TAB ── */}
      {tab === "balance" && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Balance Sheet Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bsTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" fontSize={12} /><YAxis tickFormatter={fmt} fontSize={12} />
                  <Tooltip content={<ChartTooltip />} /><Legend />
                  <Line type="monotone" dataKey="Fixed Assets" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Net Assets" stroke={EMERALD} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Loans Payable" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Reserves" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Balance Sheet Detail</h3>
              <span className="text-xs text-gray-400">Click a year for full breakdown with ratios</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Year</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Fixed Assets</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Current Assets</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Current Liabilities</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Loans</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Net Assets</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Reserves</th>
                  </tr>
                </thead>
                <tbody>
                  {bs.map((r, i) => (
                    <ExpandableBSRow key={r.year} row={r} prevRow={bs[i - 1] || null}
                      isExpanded={expandedBSYear === r.year}
                      onToggle={() => setExpandedBSYear(expandedBSYear === r.year ? null : r.year)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function CouncilFinancesPage({ setPage }) {
  const [councils, setCouncils] = useState([]);
  const [ieData, setIeData] = useState([]);
  const [bsData, setBsData] = useState([]);
  const [divData, setDivData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCouncil, setSelectedCouncil] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [cRes, ieRes, bsRes, divRes] = await Promise.all([
          supabase.from("councils").select("*").order("name"),
          supabase.from("council_income_expenditure").select("*"),
          supabase.from("council_balance_sheet").select("*"),
          supabase.from("council_division_expenditure").select("*"),
        ]);
        if (cRes.error) throw cRes.error;
        if (ieRes.error) throw ieRes.error;
        setCouncils(cRes.data || []);
        setIeData(ieRes.data || []);
        setBsData(bsRes.data || []);
        setDivData(divRes.data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading council finances...</p>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Card><div className="flex items-center gap-3 text-red-600"><AlertTriangle className="w-5 h-5" aria-hidden="true" /><p>Error loading data: {error}</p></div></Card>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Council Finances</h1>
        <p className="text-gray-500 mt-2">Annual Financial Statements from {councils.length} Irish local authorities · Parsed from official AFS PDFs</p>
        <div className="flex items-center gap-2 mt-3">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
            <Info className="w-3 h-3" aria-hidden="true" /> {ieData.length} council-year records · {divData.length} division records
          </span>
        </div>
      </div>

      {selectedCouncil ? (
        <CouncilDetail
          council={selectedCouncil}
          councils={councils}
          ieData={ieData}
          bsData={bsData}
          divData={divData}
          onBack={() => setSelectedCouncil(null)}
          onNavigate={(c) => { setSelectedCouncil(c); window.scrollTo(0, 0); }}
          setPage={setPage}
        />
      ) : (
        <CouncilOverview councils={councils} ieData={ieData} setSelectedCouncil={setSelectedCouncil} />
      )}
    </div>
  );
}
