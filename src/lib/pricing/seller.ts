import { CONSTANTS, type Constants } from "./constants";
import type { BillingCycle, DominantCost, SellerEconomics, SellerInputs, Tier } from "./types";

export function effectiveLicenseMonthly(tier: Tier, seats: number, cycle: BillingCycle): number {
  if (tier.pricePerSeatMonthly) {
    return seats * tier.pricePerSeatMonthly.value; // enterprise: annual factor = 1
  }
  if (tier.priceMonthly) {
    const factor = cycle === "annual" ? tier.annualFactor.value : 1;
    return tier.priceMonthly.value * factor;
  }
  return 0;
}

export function tierCapacity(tier: Tier, seats: number): number {
  if (tier.scanCapacity) return tier.scanCapacity.value;
  if (tier.scanCapacityPerSeat) return seats * tier.scanCapacityPerSeat.value;
  return Infinity;
}

export function computeSellerEconomics(
  inputs: SellerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): SellerEconomics {
  const uncertainty: string[] = [];

  const revenueMonthly = effectiveLicenseMonthly(tier, inputs.seats, inputs.billingCycle);
  const variableCostPerScan = c.LLM_COST_PER_SCAN.value + c.API_COST_PER_SCAN.value;

  const capacity = tierCapacity(tier, inputs.seats);
  const requestedScans = inputs.seats * inputs.scansPerSeatMonth;
  const scansMonthly = Math.min(requestedScans, capacity);
  const capacityClamped = requestedScans > capacity;
  if (capacityClamped) uncertainty.push("uso recortado al tope de capacidad del tier (clamp)");

  const variableCostMonthly = scansMonthly * variableCostPerScan;
  const supportMonthly = tier.supportMonthly.value;
  const costToServeMonthly = variableCostMonthly + supportMonthly;
  const contributionMonthly = revenueMonthly - costToServeMonthly;

  const grossMarginPct = revenueMonthly > 0 ? contributionMonthly / revenueMonthly : 0;
  const productGrossMarginPct =
    revenueMonthly > 0 ? (revenueMonthly - variableCostMonthly) / revenueMonthly : 0;

  const fixed = c.FIXED_PLATFORM_MONTHLY.value;
  const companyBreakEvenCustomers =
    contributionMonthly > 0 ? Math.ceil(fixed / contributionMonthly) : Infinity;

  const cac = tier.cac.value;
  const cacPaybackMonths = contributionMonthly > 0 ? cac / contributionMonthly : null;

  const churn = tier.monthlyChurn.value;
  let ltv: number | null;
  if (churn > 0) {
    ltv = contributionMonthly / churn;
  } else if (contributionMonthly > 0) {
    ltv = Infinity;
    uncertainty.push("churn = 0 → LTV infinito (hipótesis irreal, ajustar churn)");
  } else {
    ltv = null;
  }

  const ltvCacRatio =
    ltv === null || cac <= 0 ? null : ltv === Infinity ? Infinity : ltv / cac;
  const meetsLtvCacTarget = ltvCacRatio !== null && ltvCacRatio >= 3;

  // Cuello de botella real: comparar costos mensuales (CAC amortizado por vida ≈ 1/churn).
  const costs: Record<DominantCost, number> = {
    infra: fixed,
    llm: variableCostMonthly,
    support: supportMonthly,
    cac: cac * churn,
  };
  const dominantCost = (Object.keys(costs) as DominantCost[]).reduce((a, b) =>
    costs[a] >= costs[b] ? a : b,
  );

  // Asientos mínimos para LTV/CAC >= 3 (piso mid-market). Solo significativo para tiers por-asiento.
  const perSeatPrice = tier.pricePerSeatMonthly?.value ?? 0;
  const perSeatMarginal = perSeatPrice - inputs.scansPerSeatMonth * variableCostPerScan;
  const minViableSeats =
    perSeatMarginal > 0
      ? Math.ceil((3 * cac * churn + supportMonthly) / perSeatMarginal)
      : Infinity;

  for (const s of [tier.cac, tier.monthlyChurn, tier.supportMonthly, c.LLM_COST_PER_SCAN]) {
    if (s.provenance === "HIPOTESIS") uncertainty.push(`HIPÓTESIS: ${s.source}`);
  }

  return {
    revenueMonthly,
    variableCostPerScan,
    scansMonthly,
    capacityClamped,
    variableCostMonthly,
    costToServeMonthly,
    contributionMonthly,
    grossMarginPct,
    productGrossMarginPct,
    companyBreakEvenCustomers,
    cacPaybackMonths,
    ltv,
    ltvCacRatio,
    meetsLtvCacTarget,
    minViableSeats,
    dominantCost,
    uncertainty,
  };
}
