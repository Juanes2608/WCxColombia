import { CONSTANTS, type Constants } from "./constants";
import { effectiveLicenseMonthly } from "./seller";
import type { BuyerEconomics, BuyerInputs, Tier } from "./types";

export function computeBuyerEconomics(
  inputs: BuyerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): BuyerEconomics {
  const uncertainty: string[] = [];

  const effective = effectiveLicenseMonthly(tier, inputs.seats, inputs.billingCycle);
  const valuePerFiling = inputs.hoursPerFiling * inputs.automationPct * inputs.blendedRate;
  const hoursSavedMonthly =
    inputs.seats * inputs.filingsPerSeatMonth * inputs.hoursPerFiling * inputs.automationPct;
  const timeValueMonthly = hoursSavedMonthly * inputs.blendedRate;
  const realizedTimeValueMonthly = timeValueMonthly * inputs.valueRealizationPct;

  let riskEVMonthly = 0;
  if (inputs.includeRiskEV) {
    riskEVMonthly =
      inputs.seats *
      inputs.filingsPerSeatMonth *
      c.CITATIONS_PER_FILING.value *
      c.LEGAL_RAG_HALLUCINATION_RATE.value *
      c.P_REACHES_COURT.value *
      (c.DIRECT_WASTED_COSTS_PER_INCIDENT.value + c.REPUTATIONAL_EXPOSURE_PER_INCIDENT.value);
    uncertainty.push("riesgo EV: directo £13.5k (Ayinde, V) + reputacional editable (H); citas/filing y P(corte) son H");
  }

  const netBenefitMonthly = realizedTimeValueMonthly + riskEVMonthly - effective;
  const buyerRoiPct = effective > 0 ? netBenefitMonthly / effective : null;

  const valueContributionPerFiling = valuePerFiling * inputs.valueRealizationPct;
  const buyerBreakEvenFilings =
    valueContributionPerFiling > 0 ? Math.ceil(effective / valueContributionPerFiling) : Infinity;

  const seatDivisor = inputs.seats > 0 ? inputs.seats : 1;
  const perSeatCost = effective / seatDivisor;
  const perSeatValue = (realizedTimeValueMonthly + riskEVMonthly) / seatDivisor;
  const perSeatRoi = perSeatCost > 0 ? (perSeatValue - perSeatCost) / perSeatCost : null;

  uncertainty.push("valor de tiempo descontado por valueRealizationPct (horas → £ solo si se re-facturan)");

  return {
    effectiveLicenseMonthly: effective,
    valuePerFiling,
    hoursSavedMonthly,
    timeValueMonthly,
    realizedTimeValueMonthly,
    riskEVMonthly,
    netBenefitMonthly,
    buyerRoiPct,
    buyerBreakEvenFilings,
    perSeat: { valueMonthly: perSeatValue, costMonthly: perSeatCost, roiPct: perSeatRoi },
    uncertainty,
  };
}
