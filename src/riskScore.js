/**
 * riskScore.js
 * ============================================================
 * Pure-function risk scoring algorithm for Irish nonprofits.
 * Extracted from App.jsx to enable unit testing.
 *
 * Score starts at 65 (neutral) and adjusts ±based on:
 *   1. Data depth (filing years)
 *   2. Expenditure ratio
 *   3. Multi-year income trend
 *   4. Expenditure vs income growth
 *   5. Reserve trend
 *   6. State funding dependency
 *   7. Governance (board size)
 *
 * Returns { score, level, color, factors, confidence, yearsAnalysed }
 * ============================================================
 */

export function computeRiskScore(org) {
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
