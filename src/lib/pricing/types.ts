// TraceIt pricing engine — types (single source of truth).
// Every figure that reaches the UI is computed from these shapes.

export type Provenance = "VERIFIED" | "ASSUMPTION";

/** A constant that carries its own provenance so the UI/chatbot can label it. */
export interface Sourced<T> {
  value: T;
  unit: string; // "GBP/mo", "scans/mo", "ratio", "%", "USD"
  provenance: Provenance;
  source: string; // citation+URL, or "internal estimate"
  asOf: string; // ISO date "2026-06-27"
  editable: boolean; // true for adjustable ASSUMPTION
  note?: string;
}

export type TierId = "junior" | "chambers" | "firm" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type CapacityTierId = "pilot" | "practice" | "division" | "firmwide";

export interface Tier {
  id: TierId;
  name: string;
  forWho: string;
  priceMonthly: Sourced<number> | null; // SMB tiers
  pricePerSeatMonthly: Sourced<number> | null; // enterprise
  annualFactor: Sourced<number>; // 1.0 for enterprise (already net)
  scanCapacity: Sourced<number> | null; // absolute cap (SMB)
  scanCapacityPerSeat: Sourced<number> | null; // per-seat cap (enterprise)
  implementationCost: Sourced<number>;
  cac: Sourced<number>;
  monthlyChurn: Sourced<number>;
  supportMonthly: Sourced<number>;
  featured?: boolean;
}

export interface BuyerInputs {
  tierId: TierId;
  seats: number; // SMB: 1; enterprise: lawyers using the tool
  filingsPerSeatMonth: number;
  hoursPerFiling: number;
  blendedRate: number; // £/h
  automationPct: number; // 0..1 honesty knob
  valueRealizationPct: number; // 0..1 saved hours that become £
  includeRiskEV: boolean;
  billingCycle: BillingCycle;
}

export interface SellerInputs {
  tierId: TierId;
  seats: number;
  scansPerSeatMonth: number;
  billingCycle: BillingCycle;
}

/**
 * Raw calculator state in slider units (percentages as 0..100). Single source of
 * truth for the sliders and the ONLY surface the LLM may write to. Maps to
 * BuyerInputs/SellerInputs via the helpers in inputs.ts.
 */
export interface CalculatorInputs {
  capacityTier: CapacityTierId; // deployment size (cards) — drives cost
  seats: number; // lawyers using it (≤ tier.maxUsers)
  filingsPerMonth: number; // per lawyer; also scans/lawyer/mo
  hoursPerFiling: number;
  blendedRate: number; // £/h
  automationPct: number; // 20..100 (honesty knob)
  valueRealizationPct: number; // 0..100 (saved hours that become £)
}

export interface NumericBound {
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string;
}

/** A documented "time captured" posture that sets both honesty knobs at once. */
export interface CaptureStance {
  id: "conservative" | "realistic" | "optimistic";
  label: string;
  automationPct: number; // % of manual review time removed
  valueRealizationPct: number; // % of freed hours that become billed money
  note: string;
}

export interface BuyerPerSeat {
  valueMonthly: number; // realized
  costMonthly: number;
  roiPct: number | null;
}

export interface BuyerEconomics {
  effectiveLicenseMonthly: number;
  valuePerFiling: number;
  hoursSavedMonthly: number;
  timeValueMonthly: number;
  realizedTimeValueMonthly: number;
  riskEVMonthly: number;
  netBenefitMonthly: number;
  buyerRoiPct: number | null; // null if license 0
  buyerBreakEvenFilings: number; // Infinity if value/filing <= 0
  perSeat: BuyerPerSeat;
  uncertainty: string[];
}

export type DominantCost = "infra" | "llm" | "support" | "cac";

export interface SellerEconomics {
  revenueMonthly: number;
  variableCostPerScan: number;
  scansMonthly: number; // after capacity clamp
  capacityClamped: boolean;
  variableCostMonthly: number;
  costToServeMonthly: number;
  contributionMonthly: number;
  grossMarginPct: number; // 0 if revenue 0
  productGrossMarginPct: number; // ex-support
  companyBreakEvenCustomers: number; // Infinity if contribution <= 0
  cacPaybackMonths: number | null; // null if contribution <= 0
  ltv: number | null; // Infinity if churn 0 (flagged)
  ltvCacRatio: number | null;
  meetsLtvCacTarget: boolean; // >= 3
  minViableSeats: number; // seats for LTV/CAC >= 3 (mid-market floor); Infinity if N/A
  dominantCost: DominantCost;
  uncertainty: string[];
}

export interface ScenarioSet<T> {
  conservative: T;
  base: T;
  optimistic: T;
}

/** Core product build — bottom-up, fixed (you build the engine once). */
export interface CoreBuildBreakdown {
  graphIngestion: number; // legislation.gov.uk ingestion + Neo4j graph
  verdictEngine: number; // deterministic checks + LLM extraction
  app: number; // backend + frontend
  qaHardening: number; // testing + security
  total: number;
}

/** Total one-time cost to develop AND deploy the solution at a given capacity. */
export interface ImplementationCost {
  coreBuild: CoreBuildBreakdown; // the engine — built once
  deployment: number; // rollout into the firm — scales with capacity tier
  total: number; // coreBuild.total + deployment
}

/** Annual cost to keep it running (servers + AI requests + ops), bottom-up. */
export interface RunCost {
  llmApiAnnual: number; // Anthropic per-scan × volume
  infraAnnual: number; // Neo4j + hosting + CDN
  opsAnnual: number; // ops/maintenance labor
  total: number;
}

/**
 * The firm's total cost of ownership for solving the AI-citation problem in-house:
 * full development (one-time) + maintenance (annual), AT COST — no licence, no
 * margin. Measured against the only quantifiable benefit: review time saved.
 * Sanction/reputational risk is narrative, never priced. All figures are computed
 * deterministically from CalculatorInputs.
 */
export interface BusinessCase {
  seats: number;
  scansMonthly: number;
  requestsPerYear: number;
  // cost to the firm (TCO, no margin)
  implementation: ImplementationCost; // full development, one-time
  implementationOneTime: number; // = implementation.total
  runCost: RunCost; // maintenance detail
  maintenanceAnnual: number; // = runCost.total
  year1Cost: number; // implementationOneTime + maintenanceAnnual
  ongoingAnnualCost: number; // maintenanceAnnual
  year1CostPctOfFirmRevenue: number;
  // savings — only what we can measure
  timeSavedAnnual: number;
  totalSavedAnnual: number; // = timeSavedAnnual (risk is not priced)
  // net
  year1Net: number;
  paybackMonths: number | null;
  roiYear1Pct: number | null;
  threeYearNet: number;
  // narrative-only (cited, never multiplied into totals)
  sanctionDirectCost: number; // Ayinde wasted costs, for the "why now"
}

export interface ModelSnapshot {
  asOf: string;
  capacityTier: CapacityTierId; // current deployment size
  inputs: CalculatorInputs; // current calculator state the LLM may adjust
  bounds: Record<string, NumericBound>; // valid min/max/step per numeric input
  captureStances: CaptureStance[]; // named postures for the two honesty knobs
  businessCase: BusinessCase; // firm TCO (build + run, at cost) vs time saved
  constants: Record<string, Sourced<number>>;
  disclaimer: string;
}
