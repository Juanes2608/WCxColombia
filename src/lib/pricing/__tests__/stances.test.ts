import { describe, it, expect } from "vitest";
import { CAPTURE_STANCES, effectiveCapturePct, matchStance } from "@/lib/pricing/stances";

describe("capture stances", () => {
  it("realistic stance equals the model's base-case defaults (keeps pitch numbers stable)", () => {
    const realistic = CAPTURE_STANCES.find((s) => s.id === "realistic")!;
    expect(realistic.automationPct).toBe(65);
    expect(realistic.valueRealizationPct).toBe(50);
  });

  it("stances are ordered conservative < realistic < optimistic on both knobs", () => {
    const [c, r, o] = CAPTURE_STANCES;
    expect(c.automationPct).toBeLessThan(r.automationPct);
    expect(r.automationPct).toBeLessThan(o.automationPct);
    expect(c.valueRealizationPct).toBeLessThan(r.valueRealizationPct);
    expect(r.valueRealizationPct).toBeLessThan(o.valueRealizationPct);
  });

  it("effectiveCapturePct multiplies the two knobs", () => {
    expect(effectiveCapturePct(65, 50)).toBeCloseTo(0.325);
    expect(effectiveCapturePct(100, 100)).toBe(1);
  });

  it("matchStance identifies a named stance and falls back to custom", () => {
    expect(matchStance(65, 50)).toBe("realistic");
    expect(matchStance(50, 30)).toBe("conservative");
    expect(matchStance(60, 45)).toBe("custom");
  });
});
