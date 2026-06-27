// TraceIt pricing engine — types (single source of truth).
// Every figure that reaches the UI is computed from these shapes.

export type Provenance = "VERIFICADO" | "HIPOTESIS";

/** A constant that carries its own provenance so the UI/chatbot can label it. */
export interface Sourced<T> {
  value: T;
  unit: string; // "GBP/mes", "scans/mes", "ratio", "%", "USD"
  provenance: Provenance;
  source: string; // citation+URL, or "estimación interna"
  asOf: string; // ISO date "2026-06-27"
  editable: boolean; // true for adjustable HIPOTESIS
  note?: string;
}

export type TierId = "junior" | "chambers" | "firm" | "enterprise";
export type BillingCycle = "monthly" | "annual";

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

export interface ModelSnapshot {
  asOf: string;
  tier: TierId;
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
  constants: Record<string, Sourced<number>>;
  disclaimer: string;
}
