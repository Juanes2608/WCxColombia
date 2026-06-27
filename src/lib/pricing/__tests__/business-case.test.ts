import { describe, it, expect } from "vitest";
import { computeBusinessCase } from "@/lib/pricing/business-case";
import { computeImplementation } from "@/lib/pricing/cost-model";
import { CONSTANTS } from "@/lib/pricing/constants";
import type { CalculatorInputs } from "@/lib/pricing/types";

// White & Case disputes land: 793 lawyers, enterprise, annual, conservative.
const wc: CalculatorInputs = {
  tier: "enterprise",
  billingCycle: "annual",
  seats: 793,
  filingsPerMonth: 2,
  hoursPerFiling: 1.5,
  blendedRate: 600,
  automationPct: 50,
  valueRealizationPct: 30,
};

describe("business case (White & Case) — total cost of ownership, no margin", () => {
  const bc = computeBusinessCase(wc);

  it("cost = full development (one-time) + maintenance (annual), at cost", () => {
    expect(bc.implementationOneTime).toBe(computeImplementation().total);
    expect(bc.implementation.total).toBe(
      bc.implementation.coreBuild.total + bc.implementation.deployment.total,
    );
    expect(bc.maintenanceAnnual).toBe(bc.runCost.total);
    expect(bc.year1Cost).toBe(bc.implementationOneTime + bc.maintenanceAnnual);
    expect(bc.ongoingAnnualCost).toBe(bc.maintenanceAnnual);
  });

  it("there is no licence/margin line — cost is build + run only", () => {
    expect(bc).not.toHaveProperty("licenseAnnual");
    // the from-scratch build dominates year-1 cost
    expect(bc.implementation.coreBuild.total).toBeGreaterThan(bc.maintenanceAnnual);
  });

  it("maintenance = real COGS (LLM scans + hosting + ops)", () => {
    expect(bc.runCost.total).toBeGreaterThan(0);
    expect(bc.runCost.llmApiAnnual).toBeCloseTo(
      bc.requestsPerYear * CONSTANTS.LLM_COST_PER_SCAN.value,
      0,
    );
  });

  it("savings = review time ONLY — risk is never priced", () => {
    expect(bc.totalSavedAnnual).toBe(bc.timeSavedAnnual);
    expect(bc.timeSavedAnnual).toBeGreaterThan(0);
    expect(bc.sanctionDirectCost).toBe(CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT.value);
  });

  it("net, payback and ROI are coherent", () => {
    expect(bc.year1Net).toBeCloseTo(bc.totalSavedAnnual - bc.year1Cost, 0);
    expect(bc.paybackMonths).not.toBeNull();
    expect(bc.paybackMonths!).toBeCloseTo(bc.year1Cost / (bc.totalSavedAnnual / 12), 1);
    expect(bc.roiYear1Pct!).toBeCloseTo(bc.year1Net / bc.year1Cost, 4);
  });

  it("year-1 cost is a tiny fraction of firm revenue", () => {
    expect(bc.year1CostPctOfFirmRevenue).toBeGreaterThan(0);
    expect(bc.year1CostPctOfFirmRevenue).toBeLessThan(0.01); // < 1%
  });

  it("scale exposes the request volume", () => {
    expect(bc.seats).toBe(793);
    expect(bc.requestsPerYear).toBe(bc.scansMonthly * 12);
  });
});
