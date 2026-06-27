import { describe, it, expect } from "vitest";
import { computeBuyerEconomics } from "@/lib/pricing/buyer";
import { CONSTANTS, TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs } from "@/lib/pricing/types";

const wc: BuyerInputs = {
  tierId: "enterprise",
  seats: 793,
  filingsPerSeatMonth: 3,
  hoursPerFiling: 2.5,
  blendedRate: 600,
  automationPct: 0.65,
  valueRealizationPct: 0.5,
  includeRiskEV: false,
  billingCycle: "annual",
};

describe("buyer — White & Case master example", () => {
  const b = computeBuyerEconomics(wc, TIERS.enterprise);
  it("value per filing = £975", () => expect(b.valuePerFiling).toBeCloseTo(975, 5));
  it("hours saved = 3,865.875", () => expect(b.hoursSavedMonthly).toBeCloseTo(3865.875, 3));
  it("time value = £2,319,525", () => expect(b.timeValueMonthly).toBeCloseTo(2319525, 0));
  it("realized time value = £1,159,762.50", () =>
    expect(b.realizedTimeValueMonthly).toBeCloseTo(1159762.5, 2));
  it("effective license = £79,300", () => expect(b.effectiveLicenseMonthly).toBe(79300));
  it("net benefit = £1,080,462.50", () => expect(b.netBenefitMonthly).toBeCloseTo(1080462.5, 2));
  it("ROI ≈ 13.6×", () => expect(b.buyerRoiPct!).toBeCloseTo(13.625, 3));
  it("per-seat realized value £1,462.50 vs £100 cost", () => {
    expect(b.perSeat.valueMonthly).toBeCloseTo(1462.5, 2);
    expect(b.perSeat.costMonthly).toBeCloseTo(100, 5);
    expect(b.perSeat.roiPct!).toBeCloseTo(13.625, 3);
  });
});

describe("buyer — risk EV and edges", () => {
  it("risk EV adds a separate, positive expected value when enabled", () => {
    const withRisk = computeBuyerEconomics({ ...wc, includeRiskEV: true }, TIERS.enterprise);
    // legacy per-citation EV (gated off in the UI); reference the constant so it
    // stays correct if the reputational figure changes. The business case uses the
    // defensible incident-frequency model instead.
    const reputational = CONSTANTS.REPUTATIONAL_EXPOSURE_PER_INCIDENT.value;
    expect(withRisk.riskEVMonthly).toBeCloseTo(793 * 3 * 15 * 0.17 * 0.05 * (13500 + reputational), 0);
    expect(withRisk.netBenefitMonthly).toBeGreaterThan(
      computeBuyerEconomics(wc, TIERS.enterprise).netBenefitMonthly,
    );
  });
  it("license 0 → ROI null", () => {
    const free = computeBuyerEconomics({ ...wc, seats: 0 }, TIERS.enterprise);
    expect(free.effectiveLicenseMonthly).toBe(0);
    expect(free.buyerRoiPct).toBeNull();
  });
  it("value per filing <= 0 → break-even Infinity", () => {
    const noValue = computeBuyerEconomics({ ...wc, automationPct: 0 }, TIERS.enterprise);
    expect(noValue.buyerBreakEvenFilings).toBe(Infinity);
  });
});
