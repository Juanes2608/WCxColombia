import { CONSTANTS, type Constants } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import type { BuyerEconomics, BuyerInputs, ScenarioSet, SellerEconomics, SellerInputs, Tier } from "./types";

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Buyer: vary the most uncertain lever — automationPct (honesty knob). */
export function buyerScenarios(
  inputs: BuyerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): ScenarioSet<BuyerEconomics> {
  const mk = (mult: number): BuyerEconomics =>
    computeBuyerEconomics(
      { ...inputs, automationPct: clamp(inputs.automationPct * mult, 0.2, 1.0) },
      tier,
      c,
    );
  return { conservative: mk(0.6), base: mk(1.0), optimistic: mk(1.4) };
}

/** Seller: vary the two dominant levers — CAC × churn. */
export function sellerScenarios(
  inputs: SellerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): ScenarioSet<SellerEconomics> {
  const mk = (cacMult: number, churnMult: number): SellerEconomics =>
    computeSellerEconomics(inputs, {
      ...tier,
      cac: { ...tier.cac, value: tier.cac.value * cacMult },
      monthlyChurn: { ...tier.monthlyChurn, value: tier.monthlyChurn.value * churnMult },
    }, c);
  return { conservative: mk(1.4, 2.0), base: mk(1.0, 1.0), optimistic: mk(0.7, 0.5) };
}
