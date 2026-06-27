import { describe, it, expect } from "vitest";
import {
  computeCoreBuild, computeDeployment, computeImplementation, computeRunCost,
} from "@/lib/pricing/cost-model";
import { CONSTANTS } from "@/lib/pricing/constants";

describe("cost model (bottom-up, at cost)", () => {
  it("core build = sum of the engine line items (fixed, one-time)", () => {
    const core = computeCoreBuild();
    expect(core.total).toBe(core.graphIngestion + core.verdictEngine + core.app + core.qaHardening);
    expect(core.total).toBeGreaterThan(0);
  });

  it("deployment = sum of the rollout line items", () => {
    const dep = computeDeployment();
    expect(dep.total).toBe(dep.integration + dep.infosec + dep.training + dep.projectMgmt);
  });

  it("implementation = full development (core build + deployment)", () => {
    const impl = computeImplementation();
    expect(impl.total).toBe(impl.coreBuild.total + impl.deployment.total);
    // core build dominates a from-scratch implementation
    expect(impl.coreBuild.total).toBeGreaterThan(impl.deployment.total);
  });

  it("run cost = LLM scans + hosting + ops, scaling with volume", () => {
    const scans = 19_032; // 793 seats × 2 scans/mo × 12 (conservative)
    const run = computeRunCost(scans, 2000);
    expect(run.llmApiAnnual).toBeCloseTo(
      scans * (CONSTANTS.LLM_COST_PER_SCAN.value + CONSTANTS.API_COST_PER_SCAN.value),
      0,
    );
    expect(run.infraAnnual).toBe(CONSTANTS.ENTERPRISE_INFRA_MONTHLY.value * 12);
    expect(run.supportAnnual).toBe(2000 * 12);
    expect(run.total).toBeCloseTo(run.llmApiAnnual + run.infraAnnual + run.supportAnnual, 0);
  });
});
