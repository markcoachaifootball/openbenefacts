import { describe, it, expect } from "vitest";
import { getOverriddenSector } from "../sectorOverrides.js";

describe("getOverriddenSector", () => {
  // ── Direct Matches ─────────────────────────────────────────

  it("overrides known hospitals to Health", () => {
    expect(getOverriddenSector("St Vincent's University Hospital", "Unclassified")).toBe("Health");
    expect(getOverriddenSector("BEAUMONT HOSPITAL", "Other")).toBe("Health");
    expect(getOverriddenSector("Mater Misericordiae University Hospital", null)).toBe("Health");
  });

  it("overrides disability services to Social Services", () => {
    expect(getOverriddenSector("St John of God Community Services", "")).toBe("Social Services");
    expect(getOverriddenSector("ENABLE IRELAND", "Philanthropy")).toBe("Social Services");
    expect(getOverriddenSector("Central Remedial Clinic", null)).toBe("Social Services");
  });

  it("overrides homelessness organisations", () => {
    expect(getOverriddenSector("Focus Ireland", null)).toBe("Social Services");
    expect(getOverriddenSector("PETER MCVERRY TRUST", "")).toBe("Social Services");
    expect(getOverriddenSector("Dublin Simon Community", "Unclassified")).toBe("Social Services");
  });

  // ── Suffix Stripping ───────────────────────────────────────

  it("strips CLG suffix for matching", () => {
    expect(getOverriddenSector("St John of God Community Services CLG", null)).toBe("Social Services");
  });

  it("strips Ltd/Limited suffix for matching", () => {
    expect(getOverriddenSector("Rehab Group Limited", null)).toBe("Social Services");
  });

  // ── Passthrough Behaviour ──────────────────────────────────

  it("returns original sector when no override matches", () => {
    expect(getOverriddenSector("Some Random Org", "Education")).toBe("Education");
    expect(getOverriddenSector("Unknown Charity Ltd", "Health")).toBe("Health");
  });

  it("returns 'Unclassified' when no match and no original", () => {
    expect(getOverriddenSector("Some Random Org", null)).toBe("Unclassified");
    expect(getOverriddenSector("Some Random Org", "")).toBe("Unclassified");
    expect(getOverriddenSector(null, null)).toBe("Unclassified");
  });

  it("handles null/undefined org names gracefully", () => {
    expect(getOverriddenSector(null, "Health")).toBe("Health");
    expect(getOverriddenSector(undefined, "Education")).toBe("Education");
    expect(getOverriddenSector("", "Social Services")).toBe("Social Services");
  });

  // ── Apostrophe Normalisation ───────────────────────────────

  it("handles curly apostrophes", () => {
    // The override map uses straight apostrophes; input may have curly ones
    expect(getOverriddenSector("St Vincent’s University Hospital", "Other")).toBe("Health");
  });

  // ── Case Insensitivity ─────────────────────────────────────

  it("matches regardless of case", () => {
    expect(getOverriddenSector("beaumont hospital", null)).toBe("Health");
    expect(getOverriddenSector("BEAUMONT HOSPITAL", null)).toBe("Health");
    expect(getOverriddenSector("Beaumont Hospital", null)).toBe("Health");
  });

  // ── Keyword Fallback Classifier ────────────────────────────

  it("classifies unknown hospitals via keyword fallback", () => {
    expect(getOverriddenSector("Portiuncula University Hospital", null)).toBe("Health");
    expect(getOverriddenSector("Some Regional Clinic Ltd", "Unclassified")).toBe("Health");
  });

  it("classifies unknown schools via keyword fallback", () => {
    expect(getOverriddenSector("St Mary's Secondary School", null)).toBe("Education, Research");
    expect(getOverriddenSector("ABC Institute of Technology", "")).toBe("Education, Research");
  });

  it("classifies housing bodies via keyword fallback", () => {
    expect(getOverriddenSector("Northwest Housing Association", null)).toBe("Social Services");
  });

  it("classifies sports clubs via keyword fallback", () => {
    expect(getOverriddenSector("Ballymun Rugby Club", null)).toBe("Culture, Recreation");
  });

  it("does not apply keyword fallback when original sector is valid", () => {
    // Keyword fallback only fires when no manual match; original sector takes precedence after
    expect(getOverriddenSector("Some Random Hospital", "International")).toBe("Health");
    // But a totally unknown non-keyword org keeps its original
    expect(getOverriddenSector("XYZ Foundation", "Philanthropy")).toBe("Philanthropy");
  });
});
