import { describe, it, expect } from "vitest";
import { buildSnapshot, buildSystemPrompt } from "@/lib/pricing/chat-context";
import type { CalculatorInputs } from "@/lib/pricing/types";

const inputs: CalculatorInputs = {
  tier: "enterprise",
  billingCycle: "annual",
  seats: 793,
  filingsPerMonth: 3,
  hoursPerFiling: 2.5,
  blendedRate: 600,
  automationPct: 65,
  valueRealizationPct: 50,
};

const snap = buildSnapshot(inputs);

describe("chat context", () => {
  it("snapshot carries computed numbers, current inputs, bounds and disclaimer", () => {
    expect(snap.tier).toBe("enterprise");
    expect(snap.seller.revenueMonthly).toBe(79300);
    expect(snap.inputs.seats).toBe(793);
    expect(snap.bounds.seats.max).toBe(2643);
    expect(snap.disclaimer.length).toBeGreaterThan(0);
    expect(snap.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("snapshot includes provenance-labeled constants", () => {
    expect(snap.constants.WC_TOTAL_LAWYERS.provenance).toBe("VERIFIED");
  });
  it("system prompt forbids inventing numbers, documents the action, and embeds the snapshot", () => {
    const prompt = buildSystemPrompt(snap);
    expect(prompt).toMatch(/MODEL_SNAPSHOT/);
    expect(prompt.toLowerCase()).toMatch(/never invent|do not invent/);
    expect(prompt).toMatch(/set_inputs/);
    expect(prompt).toContain("79300"); // a real computed figure is present
  });
});
