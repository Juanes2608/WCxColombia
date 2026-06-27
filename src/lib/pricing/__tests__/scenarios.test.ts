import { describe, it, expect } from "vitest";
import { buyerScenarios, sellerScenarios } from "@/lib/pricing/scenarios";
import { TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing/types";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

describe("scenarios", () => {
  it("buyer: optimistic net >= base >= conservative", () => {
    const sc = buyerScenarios(b, TIERS.enterprise);
    expect(sc.optimistic.netBenefitMonthly).toBeGreaterThanOrEqual(sc.base.netBenefitMonthly);
    expect(sc.base.netBenefitMonthly).toBeGreaterThanOrEqual(sc.conservative.netBenefitMonthly);
  });
  it("buyer: automation stays clamped within [0.20, 1.0]", () => {
    const hi: BuyerInputs = { ...b, automationPct: 0.9 };
    const sc = buyerScenarios(hi, TIERS.enterprise);
    // optimistic 0.9×1.4 = 1.26 → clamps to 1.0 → hoursSaved = seats×filings×hours×1.0
    expect(sc.optimistic.hoursSavedMonthly).toBeCloseTo(793 * 3 * 2.5 * 1.0, 3);
  });
  it("seller: LTV/CAC improves conservative <= base <= optimistic (CAC×churn levers genuinely move it)", () => {
    const sc = sellerScenarios(s, TIERS.enterprise);
    expect(sc.conservative.ltvCacRatio!).toBeLessThanOrEqual(sc.base.ltvCacRatio!);
    expect(sc.base.ltvCacRatio!).toBeLessThanOrEqual(sc.optimistic.ltvCacRatio!);
    expect(sc.optimistic.ltvCacRatio!).toBeGreaterThan(sc.conservative.ltvCacRatio!);
  });
  it("seller: coherence — contribution === revenue − costToServe in every scenario", () => {
    const sc = sellerScenarios(s, TIERS.enterprise);
    for (const k of ["conservative", "base", "optimistic"] as const) {
      const e = sc[k];
      expect(e.contributionMonthly).toBeCloseTo(e.revenueMonthly - e.costToServeMonthly, 6);
    }
  });
});
