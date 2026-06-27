import { describe, it, expect } from "vitest";
import { computeCoreBuild, computeImplementation, computeRunCost } from "@/lib/pricing/cost-model";
import { CONSTANTS } from "@/lib/pricing/constants";

describe("cost model (bottom-up, at cost)", () => {
  it("core build = sum of the engine line items (fixed, one-time)", () => {
    const core = computeCoreBuild();
    expect(core.total).toBe(core.graphIngestion + core.verdictEngine + core.app + core.qaHardening);
    expect(core.total).toBeGreaterThan(0);
  });

  it("implementation = core build + the capacity's deployment", () => {
    const impl = computeImplementation(70000);
    expect(impl.deployment).toBe(70000);
    expect(impl.total).toBe(impl.coreBuild.total + 70000);
    // the from-scratch build dominates a single-deployment implementation
    expect(impl.coreBuild.total).toBeGreaterThan(impl.deployment);
  });

  it("run cost = LLM scans + hosting + ops, scaling with volume", () => {
    const scans = 19_032; // 793 lawyers × 2 scans/mo × 12 (conservative)
    const run = computeRunCost(scans, 800, 2000);
    expect(run.llmApiAnnual).toBeCloseTo(
      scans * (CONSTANTS.LLM_COST_PER_SCAN.value + CONSTANTS.API_COST_PER_SCAN.value),
      0,
    );
    expect(run.infraAnnual).toBe(800 * 12);
    expect(run.opsAnnual).toBe(2000 * 12);
    expect(run.total).toBeCloseTo(run.llmApiAnnual + run.infraAnnual + run.opsAnnual, 0);
  });
});
