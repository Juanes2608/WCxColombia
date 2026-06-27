import { describe, it, expect } from "vitest";
import { buildSnapshot, buildSystemPrompt } from "@/lib/pricing/chat-context";
import type { CalculatorInputs } from "@/lib/pricing/types";

const inputs: CalculatorInputs = {
  capacityTier: "division",
  seats: 793,
  filingsPerMonth: 2,
  hoursPerFiling: 1.5,
  blendedRate: 600,
  automationPct: 50,
  valueRealizationPct: 30,
};

const snap = buildSnapshot(inputs);

describe("chat context", () => {
  it("snapshot carries current inputs, bounds, capacity tier and disclaimer", () => {
    expect(snap.capacityTier).toBe("division");
    expect(snap.inputs.seats).toBe(793);
    expect(snap.bounds.seats.max).toBe(2643);
    expect(snap.disclaimer.length).toBeGreaterThan(0);
    expect(snap.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("snapshot carries the firm TCO (build + maintenance, time-only savings)", () => {
    expect(snap.businessCase.implementation.coreBuild.total).toBeGreaterThan(0);
    expect(snap.businessCase.year1Cost).toBe(
      snap.businessCase.implementationOneTime + snap.businessCase.maintenanceAnnual,
    );
    expect(snap.businessCase.totalSavedAnnual).toBe(snap.businessCase.timeSavedAnnual);
    expect(snap.businessCase.paybackMonths).not.toBeNull();
  });
  it("snapshot includes provenance-labeled constants", () => {
    expect(snap.constants.WC_TOTAL_LAWYERS.provenance).toBe("VERIFIED");
  });
  it("system prompt forbids inventing numbers, documents the action, and embeds the snapshot", () => {
    const prompt = buildSystemPrompt(snap);
    expect(prompt).toMatch(/MODEL_SNAPSHOT/);
    expect(prompt.toLowerCase()).toMatch(/never invent|do not invent/);
    expect(prompt).toMatch(/set_inputs/);
    expect(prompt).toMatch(/capacityTier/);
  });
});
