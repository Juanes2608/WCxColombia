import { describe, it, expect } from "vitest";
import { computeModel, TIERS } from "@/lib/pricing";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

describe("computeModel", () => {
  it("bundles buyer + seller + scenarios for the tier", () => {
    const m = computeModel(b, s);
    expect(m.tier).toBe("enterprise");
    expect(m.buyer.effectiveLicenseMonthly).toBe(79300);
    expect(m.seller.revenueMonthly).toBe(79300);
    expect(m.buyerScenarios.base.netBenefitMonthly).toBeCloseTo(m.buyer.netBenefitMonthly, 6);
  });
  it("exposes TIERS", () => expect(TIERS.enterprise.id).toBe("enterprise"));
});
