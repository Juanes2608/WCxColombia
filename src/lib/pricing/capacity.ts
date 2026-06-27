// Capacity tiers for the firm's in-house deployment. The engine (the £150k
// platform build) is built ONCE and serves any capacity below. Each tier is a
// deployment size: it costs a one-time DEPLOYMENT (integration/training, scales)
// + an annual MAINTENANCE (servers + AI requests + ops, scales with users and
// requests). No licence, no margin — these are costs.
import { CONSTANTS, type Constants } from "./constants";
import type { CapacityTierId } from "./types";

export interface CapacityTier {
  id: CapacityTierId;
  name: string;
  forWho: string;
  maxUsers: number;
  maxRequestsMonth: number;
  deployment: number; // one-time £
  infraMonthly: number; // run £/mo
  opsMonthly: number; // run £/mo (ops & maintenance labor)
  featured?: boolean;
}

export const CAPACITY_TIERS: CapacityTier[] = [
  {
    id: "pilot",
    name: "Pilot",
    forWho: "One practice group, proving it out.",
    maxUsers: 50,
    maxRequestsMonth: 2500,
    deployment: 15000,
    infraMonthly: 200,
    opsMonthly: 500,
  },
  {
    id: "practice",
    name: "Practice",
    forWho: "A full practice area.",
    maxUsers: 250,
    maxRequestsMonth: 12500,
    deployment: 35000,
    infraMonthly: 400,
    opsMonthly: 600,
  },
  {
    id: "division",
    name: "Division",
    forWho: "Disputes & arbitration — e.g. White & Case.",
    maxUsers: 800,
    maxRequestsMonth: 40000,
    deployment: 70000,
    infraMonthly: 800,
    opsMonthly: 2000,
    featured: true,
  },
  {
    id: "firmwide",
    name: "Firm-wide",
    forWho: "Every lawyer in the firm.",
    maxUsers: 2643,
    maxRequestsMonth: 130000,
    deployment: 120000,
    infraMonthly: 1500,
    opsMonthly: 3000,
  },
];

export interface CapacityCost {
  deployment: number; // one-time
  llmAnnual: number;
  infraAnnual: number;
  opsAnnual: number;
  maintenanceAnnual: number; // at the tier's request cap
}

/** Deployment (one-time) + maintenance (annual, at the tier's request cap). */
export function computeCapacityCost(t: CapacityTier, c: Constants = CONSTANTS): CapacityCost {
  const llmAnnual = t.maxRequestsMonth * 12 * (c.LLM_COST_PER_SCAN.value + c.API_COST_PER_SCAN.value);
  const infraAnnual = t.infraMonthly * 12;
  const opsAnnual = t.opsMonthly * 12;
  return {
    deployment: t.deployment,
    llmAnnual,
    infraAnnual,
    opsAnnual,
    maintenanceAnnual: llmAnnual + infraAnnual + opsAnnual,
  };
}

/** The one-time platform build — the engine, built once for any capacity. */
export function platformBuildTotal(c: Constants = CONSTANTS): number {
  return (
    c.BUILD_GRAPH_INGESTION.value +
    c.BUILD_VERDICT_ENGINE.value +
    c.BUILD_APP.value +
    c.BUILD_QA.value
  );
}
