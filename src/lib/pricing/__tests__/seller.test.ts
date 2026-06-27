import { describe, it, expect } from "vitest";
import { computeSellerEconomics, effectiveLicenseMonthly, tierCapacity } from "@/lib/pricing/seller";
import { TIERS } from "@/lib/pricing/constants";
import type { SellerInputs } from "@/lib/pricing/types";

const wc: SellerInputs = {
  tierId: "enterprise",
  seats: 793,
  scansPerSeatMonth: 3,
  billingCycle: "annual",
};

describe("seller — White & Case master example", () => {
  const s = computeSellerEconomics(wc, TIERS.enterprise);
  it("revenue = 793 × £100 = £79,300", () => expect(s.revenueMonthly).toBe(79300));
  it("scans = 2,379 (no clamp)", () => {
    expect(s.scansMonthly).toBe(2379);
    expect(s.capacityClamped).toBe(false);
  });
  it("variable cost = £190.32", () => expect(s.variableCostMonthly).toBeCloseTo(190.32, 2));
  it("contribution = £77,109.68", () => expect(s.contributionMonthly).toBeCloseTo(77109.68, 2));
  it("gross margin ≈ 97.24%", () => expect(s.grossMarginPct).toBeCloseTo(0.9724, 4));
  it("product gross margin ≈ 99.76%", () => expect(s.productGrossMarginPct).toBeCloseTo(0.9976, 4));
  it("CAC payback ≈ 0.52 months", () => expect(s.cacPaybackMonths!).toBeCloseTo(0.519, 2));
  it("LTV = £15,421,936", () => expect(s.ltv!).toBeCloseTo(15421936, 0));
  it("LTV/CAC ≈ 385.5 and meets target", () => {
    expect(s.ltvCacRatio!).toBeCloseTo(385.5, 1);
    expect(s.meetsLtvCacTarget).toBe(true);
  });
  it("minViableSeats = 27 (mid-market floor)", () => expect(s.minViableSeats).toBe(27));
  it("dominant ongoing cost is support", () => expect(s.dominantCost).toBe("support"));
});

describe("seller — edge cases", () => {
  it("contribution <= 0 → break-even Infinity and payback null", () => {
    const broke = computeSellerEconomics(
      { ...wc, seats: 1, scansPerSeatMonth: 3 },
      { ...TIERS.enterprise, supportMonthly: { ...TIERS.enterprise.supportMonthly, value: 5000 } },
    );
    expect(broke.contributionMonthly).toBeLessThanOrEqual(0);
    expect(broke.companyBreakEvenCustomers).toBe(Infinity);
    expect(broke.cacPaybackMonths).toBeNull();
  });
  it("revenue 0 → gross margin 0", () => {
    const zero = computeSellerEconomics({ ...wc, seats: 0 }, TIERS.enterprise);
    expect(zero.revenueMonthly).toBe(0);
    expect(zero.grossMarginPct).toBe(0);
    expect(zero.productGrossMarginPct).toBe(0);
  });
  it("usage over capacity is clamped (junior cap 20)", () => {
    const j = computeSellerEconomics(
      { tierId: "junior", seats: 1, scansPerSeatMonth: 50, billingCycle: "monthly" },
      TIERS.junior,
    );
    expect(j.scansMonthly).toBe(20);
    expect(j.capacityClamped).toBe(true);
  });
  it("churn 0 → LTV Infinity, flagged", () => {
    const noChurn = computeSellerEconomics(wc, {
      ...TIERS.enterprise,
      monthlyChurn: { ...TIERS.enterprise.monthlyChurn, value: 0 },
    });
    expect(noChurn.ltv).toBe(Infinity);
    expect(noChurn.uncertainty.join(" ")).toMatch(/churn/i);
    expect(noChurn.meetsLtvCacTarget).toBe(true);
  });
});

describe("seller — helpers", () => {
  it("enterprise license = seats × price (no annual factor)", () => {
    expect(effectiveLicenseMonthly(TIERS.enterprise, 793, "annual")).toBe(79300);
  });
  it("SMB annual license applies factor", () => {
    expect(effectiveLicenseMonthly(TIERS.chambers, 1, "annual")).toBeCloseTo(232, 5);
  });
  it("enterprise capacity = seats × perSeat", () => {
    expect(tierCapacity(TIERS.enterprise, 793)).toBe(39650);
  });
});
