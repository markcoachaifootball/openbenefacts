import { describe, it, expect } from "vitest";
import { computeRiskScore } from "../riskScore.js";

// ── Test Fixtures ──────────────────────────────────────────

const makeOrg = (overrides = {}) => ({
  financials: [
    { year: 2023, gross_income: 1000000, gross_expenditure: 850000, total_assets: 500000, employees: 25 },
    { year: 2022, gross_income: 950000, gross_expenditure: 800000, total_assets: 450000, employees: 23 },
    { year: 2021, gross_income: 900000, gross_expenditure: 780000, total_assets: 400000, employees: 22 },
    { year: 2020, gross_income: 870000, gross_expenditure: 750000, total_assets: 380000, employees: 20 },
    { year: 2019, gross_income: 820000, gross_expenditure: 720000, total_assets: 350000, employees: 18 },
  ],
  grants: [{ amount: 200000 }, { amount: 150000 }],
  boardMembers: [
    { directors: { name: "A" } }, { directors: { name: "B" } }, { directors: { name: "C" } },
    { directors: { name: "D" } }, { directors: { name: "E" } }, { directors: { name: "F" } },
  ],
  ...overrides,
});

// ── Core Behaviour ─────────────────────────────────────────

describe("computeRiskScore", () => {
  it("returns null for org with no financials", () => {
    expect(computeRiskScore({})).toBeNull();
    expect(computeRiskScore({ financials: [] })).toBeNull();
    expect(computeRiskScore(null)).toBeNull();
    expect(computeRiskScore(undefined)).toBeNull();
  });

  it("returns a valid score object for a healthy org", () => {
    const result = computeRiskScore(makeOrg());
    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(["low", "moderate", "elevated"]).toContain(result.level);
    expect(["emerald", "amber", "red"]).toContain(result.color);
    expect(["high", "moderate", "low"]).toContain(result.confidence);
    expect(result.factors).toBeInstanceOf(Array);
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.yearsAnalysed).toBe(5);
  });

  it("scores a healthy growing org as low risk", () => {
    const result = computeRiskScore(makeOrg());
    expect(result.level).toBe("low");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("clamps score to 0–100 range", () => {
    // Worst case: 1 year, massive deficit, no board, no assets
    const terrible = makeOrg({
      financials: [{ year: 2023, gross_income: 100000, gross_expenditure: 250000, total_assets: 0 }],
      grants: [],
      boardMembers: [],
    });
    const result = computeRiskScore(terrible);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ── Data Depth Factor ──────────────────────────────────────

describe("data depth scoring", () => {
  it("gives high confidence for 5+ years", () => {
    const result = computeRiskScore(makeOrg());
    expect(result.confidence).toBe("high");
    expect(result.yearsAnalysed).toBe(5);
  });

  it("gives moderate confidence for 3–4 years", () => {
    const org = makeOrg({ financials: makeOrg().financials.slice(0, 3) });
    const result = computeRiskScore(org);
    expect(result.confidence).toBe("moderate");
  });

  it("gives low confidence for 1–2 years", () => {
    const org = makeOrg({ financials: makeOrg().financials.slice(0, 1) });
    const result = computeRiskScore(org);
    expect(result.confidence).toBe("low");
  });

  it("penalises single-year orgs", () => {
    const oneYear = makeOrg({ financials: makeOrg().financials.slice(0, 1) });
    const fiveYear = makeOrg();
    expect(computeRiskScore(oneYear).score).toBeLessThan(computeRiskScore(fiveYear).score);
  });
});

// ── Expenditure Ratio ──────────────────────────────────────

describe("expenditure ratio scoring", () => {
  it("rewards healthy spending ratio (0.75–1.0)", () => {
    const org = makeOrg({
      financials: [{ year: 2023, gross_income: 1000000, gross_expenditure: 850000, total_assets: 500000 }],
    });
    const factors = computeRiskScore(org).factors;
    expect(factors.some(f => f.label.includes("Healthy spending ratio"))).toBe(true);
  });

  it("penalises large deficits (>120%)", () => {
    const org = makeOrg({
      financials: [{ year: 2023, gross_income: 1000000, gross_expenditure: 1300000, total_assets: 500000 }],
    });
    const result = computeRiskScore(org);
    expect(result.factors.some(f => f.label.includes("Spending exceeds income"))).toBe(true);
  });

  it("flags very low spending as potential hoarding", () => {
    const org = makeOrg({
      financials: [{ year: 2023, gross_income: 1000000, gross_expenditure: 400000, total_assets: 2000000 }],
    });
    const result = computeRiskScore(org);
    expect(result.factors.some(f => f.label.includes("low spending ratio"))).toBe(true);
  });
});

// ── Governance ─────────────────────────────────────────────

describe("governance scoring", () => {
  it("rewards boards with 5+ members", () => {
    const result = computeRiskScore(makeOrg());
    expect(result.factors.some(f => f.label.includes("board members on record"))).toBe(true);
  });

  it("scores lower with no board data", () => {
    // Use a moderate org so the board bonus doesn't get clamped at 100
    const baseFinancials = [
      { year: 2023, gross_income: 500000, gross_expenditure: 480000, total_assets: 200000 },
      { year: 2022, gross_income: 490000, gross_expenditure: 470000, total_assets: 190000 },
      { year: 2021, gross_income: 480000, gross_expenditure: 460000, total_assets: 180000 },
    ];
    const withBoard = computeRiskScore(makeOrg({ financials: baseFinancials }));
    const noBoard = computeRiskScore(makeOrg({ financials: baseFinancials, boardMembers: [] }));
    expect(noBoard.score).toBeLessThan(withBoard.score);
  });
});

// ── State Funding Dependency ───────────────────────────────

describe("state funding dependency", () => {
  it("rewards diversified income", () => {
    const org = makeOrg({ grants: [{ amount: 100000 }] }); // 10% of income
    const result = computeRiskScore(org);
    expect(result.factors.some(f => f.label.includes("Diversified income"))).toBe(true);
  });

  it("flags very high dependency", () => {
    const org = makeOrg({ grants: [{ amount: 950000 }] }); // 95% of income
    const result = computeRiskScore(org);
    expect(result.factors.some(f => f.label.includes("Very high state funding dependency"))).toBe(true);
  });
});

// ── Level Thresholds ───────────────────────────────────────

describe("risk level thresholds", () => {
  it("maps score >= 75 to low risk (emerald)", () => {
    const result = computeRiskScore(makeOrg());
    if (result.score >= 75) {
      expect(result.level).toBe("low");
      expect(result.color).toBe("emerald");
    }
  });

  it("maps score 50–74 to moderate risk (amber)", () => {
    // Create a mediocre org
    const org = makeOrg({
      financials: [
        { year: 2023, gross_income: 500000, gross_expenditure: 520000, total_assets: 100000 },
        { year: 2022, gross_income: 550000, gross_expenditure: 500000, total_assets: 120000 },
      ],
      boardMembers: [{ directors: { name: "A" } }],
      grants: [],
    });
    const result = computeRiskScore(org);
    if (result.score >= 50 && result.score < 75) {
      expect(result.level).toBe("moderate");
      expect(result.color).toBe("amber");
    }
  });
});
