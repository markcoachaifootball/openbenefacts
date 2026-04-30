import { describe, it, expect } from "vitest";
import { getOverriddenCounty } from "../countyOverrides.js";

describe("getOverriddenCounty", () => {
  // ── Only Overrides Unknown/Empty ───────────────────────────

  it("keeps the original county when it is already set", () => {
    expect(getOverriddenCounty("Beaumont Hospital", "Cork")).toBe("Cork");
    expect(getOverriddenCounty("Focus Ireland", "Galway")).toBe("Galway");
  });

  it("overrides when original county is 'Unknown'", () => {
    expect(getOverriddenCounty("Beaumont Hospital", "Unknown")).toBe("Dublin");
    expect(getOverriddenCounty("Focus Ireland", "Unknown")).toBe("Dublin");
  });

  it("overrides when original county is empty or null", () => {
    expect(getOverriddenCounty("Beaumont Hospital", "")).toBe("Dublin");
    expect(getOverriddenCounty("Beaumont Hospital", null)).toBe("Dublin");
    expect(getOverriddenCounty("Beaumont Hospital", undefined)).toBe("Dublin");
  });

  // ── Dublin Hospitals ───────────────────────────────────────

  it("maps Dublin hospitals correctly", () => {
    expect(getOverriddenCounty("St James's Hospital", "Unknown")).toBe("Dublin");
    expect(getOverriddenCounty("MATER MISERICORDIAE UNIVERSITY HOSPITAL", null)).toBe("Dublin");
    expect(getOverriddenCounty("Tallaght University Hospital", "Unknown")).toBe("Dublin");
    expect(getOverriddenCounty("Rotunda Hospital", null)).toBe("Dublin");
  });

  // ── Regional Hospitals ─────────────────────────────────────

  it("maps regional hospitals to correct counties", () => {
    expect(getOverriddenCounty("Cork University Hospital", "Unknown")).toBe("Cork");
    expect(getOverriddenCounty("University Hospital Limerick", null)).toBe("Limerick");
    expect(getOverriddenCounty("University Hospital Galway", "Unknown")).toBe("Galway");
    expect(getOverriddenCounty("Letterkenny University Hospital", null)).toBe("Donegal");
    expect(getOverriddenCounty("Sligo University Hospital", "Unknown")).toBe("Sligo");
  });

  // ── Disability Services ────────────────────────────────────

  it("maps disability orgs correctly", () => {
    expect(getOverriddenCounty("Cope Foundation", "Unknown")).toBe("Cork");
    expect(getOverriddenCounty("Brothers of Charity Services Clare", null)).toBe("Clare");
    expect(getOverriddenCounty("Sunbeam House Services", "Unknown")).toBe("Wicklow");
    expect(getOverriddenCounty("Western Care Association", null)).toBe("Mayo");
  });

  // ── Passthrough ────────────────────────────────────────────

  it("returns 'Unknown' for unrecognised orgs with no original", () => {
    expect(getOverriddenCounty("Some Random Charity", null)).toBe("Unknown");
    expect(getOverriddenCounty("Some Random Charity", "")).toBe("Unknown");
  });

  it("returns original county for unrecognised orgs", () => {
    expect(getOverriddenCounty("Some Random Charity", "Dublin")).toBe("Dublin");
    expect(getOverriddenCounty("Some Random Charity", "Kerry")).toBe("Kerry");
  });

  // ── Edge Cases ─────────────────────────────────────────────

  it("handles null/undefined org names", () => {
    expect(getOverriddenCounty(null, "Dublin")).toBe("Dublin");
    expect(getOverriddenCounty(undefined, "Unknown")).toBe("Unknown");
    expect(getOverriddenCounty("", null)).toBe("Unknown");
  });

  it("handles case insensitivity", () => {
    expect(getOverriddenCounty("beaumont hospital", "Unknown")).toBe("Dublin");
    expect(getOverriddenCounty("COPE FOUNDATION", null)).toBe("Cork");
  });

  it("strips CLG suffix", () => {
    expect(getOverriddenCounty("St John of God Community Services CLG", "Unknown")).toBe("Dublin");
  });
});
