import { describe, it, expect } from "vitest";
import {
  CAPACITY_TIERS, computeCapacityCost, platformBuildTotal,
} from "@/lib/pricing/capacity";
import { CONSTANTS } from "@/lib/pricing/constants";

describe("capacity tiers", () => {
  it("tiers grow in users, requests, deployment and maintenance", () => {
    for (let i = 1; i < CAPACITY_TIERS.length; i++) {
      const prev = CAPACITY_TIERS[i - 1];
      const cur = CAPACITY_TIERS[i];
      expect(cur.maxUsers).toBeGreaterThan(prev.maxUsers);
      expect(cur.maxRequestsMonth).toBeGreaterThan(prev.maxRequestsMonth);
      expect(cur.deployment).toBeGreaterThan(prev.deployment);
      expect(computeCapacityCost(cur).maintenanceAnnual).toBeGreaterThan(
        computeCapacityCost(prev).maintenanceAnnual,
      );
    }
  });

  it("maintenance = LLM (at request cap) + infra + ops", () => {
    const division = CAPACITY_TIERS.find((t) => t.id === "division")!;
    const cost = computeCapacityCost(division);
    expect(cost.llmAnnual).toBeCloseTo(
      division.maxRequestsMonth * 12 * CONSTANTS.LLM_COST_PER_SCAN.value,
      0,
    );
    expect(cost.infraAnnual).toBe(division.infraMonthly * 12);
    expect(cost.opsAnnual).toBe(division.opsMonthly * 12);
    expect(cost.maintenanceAnnual).toBe(cost.llmAnnual + cost.infraAnnual + cost.opsAnnual);
  });

  it("platform build is the one-time engine cost (~£150k)", () => {
    expect(platformBuildTotal()).toBe(
      CONSTANTS.BUILD_GRAPH_INGESTION.value +
        CONSTANTS.BUILD_VERDICT_ENGINE.value +
        CONSTANTS.BUILD_APP.value +
        CONSTANTS.BUILD_QA.value,
    );
    expect(platformBuildTotal()).toBeGreaterThan(100000);
  });
});
