import { describe, it, expect } from "vitest";
import { computeBusinessCase } from "@/lib/pricing/business-case";
import { computeCoreBuild } from "@/lib/pricing/cost-model";
import { CAPACITY_TIERS } from "@/lib/pricing/capacity";
import { CONSTANTS } from "@/lib/pricing/constants";
import type { CalculatorInputs } from "@/lib/pricing/types";

// White & Case disputes land: 793 lawyers, the Division capacity tier, conservative.
const wc: CalculatorInputs = {
  capacityTier: "division",
  seats: 793,
  filingsPerMonth: 2,
  hoursPerFiling: 1.5,
  blendedRate: 600,
  automationPct: 50,
  valueRealizationPct: 30,
};

describe("business case (White & Case) — total cost of ownership, no margin", () => {
  const bc = computeBusinessCase(wc);
  const division = CAPACITY_TIERS.find((t) => t.id === "division")!;

  it("cost = build once + deploy at this capacity + maintenance, at cost", () => {
    expect(bc.implementation.coreBuild.total).toBe(computeCoreBuild().total);
    expect(bc.implementation.deployment).toBe(division.deployment);
    expect(bc.implementation.total).toBe(bc.implementation.coreBuild.total + division.deployment);
    expect(bc.maintenanceAnnual).toBe(bc.runCost.total);
    expect(bc.year1Cost).toBe(bc.implementationOneTime + bc.maintenanceAnnual);
  });

  it("there is no licence/margin line — cost is build + run only", () => {
    expect(bc).not.toHaveProperty("licenseAnnual");
    expect(bc.implementation.coreBuild.total).toBeGreaterThan(bc.maintenanceAnnual);
  });

  it("maintenance = real COGS (LLM scans + tier infra + tier ops)", () => {
    expect(bc.runCost.llmApiAnnual).toBeCloseTo(
      bc.requestsPerYear * CONSTANTS.LLM_COST_PER_SCAN.value,
      0,
    );
    expect(bc.runCost.infraAnnual).toBe(division.infraMonthly * 12);
    expect(bc.runCost.opsAnnual).toBe(division.opsMonthly * 12);
  });

  it("savings = review time ONLY, computed from the inputs", () => {
    const expected = 793 * 2 * 1.5 * 0.5 * 600 * 0.3 * 12;
    expect(bc.timeSavedAnnual).toBeCloseTo(expected, 0);
    expect(bc.totalSavedAnnual).toBe(bc.timeSavedAnnual);
    expect(bc.sanctionDirectCost).toBe(CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT.value);
  });

  it("seats are clamped to the tier's user cap", () => {
    const over = computeBusinessCase({ ...wc, capacityTier: "pilot", seats: 999 });
    const pilot = CAPACITY_TIERS.find((t) => t.id === "pilot")!;
    expect(over.seats).toBe(pilot.maxUsers);
  });

  it("net, payback and ROI are coherent", () => {
    expect(bc.year1Net).toBeCloseTo(bc.totalSavedAnnual - bc.year1Cost, 0);
    expect(bc.paybackMonths).not.toBeNull();
    expect(bc.paybackMonths!).toBeCloseTo(bc.year1Cost / (bc.totalSavedAnnual / 12), 1);
    expect(bc.roiYear1Pct!).toBeCloseTo(bc.year1Net / bc.year1Cost, 4);
  });

  it("year-1 cost is a tiny fraction of firm revenue", () => {
    expect(bc.year1CostPctOfFirmRevenue).toBeGreaterThan(0);
    expect(bc.year1CostPctOfFirmRevenue).toBeLessThan(0.01);
  });
});
