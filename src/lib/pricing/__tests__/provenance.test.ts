import { describe, it, expect } from "vitest";
import { CONSTANTS, TIERS_LIST } from "@/lib/pricing/constants";
import type { Sourced } from "@/lib/pricing/types";

const allSourced = (): Sourced<number>[] => {
  const fromConsts = Object.values(CONSTANTS);
  const fromTiers = TIERS_LIST.flatMap((t) =>
    [
      t.priceMonthly,
      t.pricePerSeatMonthly,
      t.annualFactor,
      t.scanCapacity,
      t.scanCapacityPerSeat,
      t.implementationCost,
      t.cac,
      t.monthlyChurn,
      t.supportMonthly,
    ].filter((s): s is Sourced<number> => s !== null),
  );
  return [...fromConsts, ...fromTiers];
};

describe("provenance", () => {
  it("every VERIFICADO constant has a non-empty source", () => {
    for (const s of allSourced()) {
      if (s.provenance === "VERIFICADO") {
        expect(s.source.length, `source for ${s.unit}/${s.value}`).toBeGreaterThan(0);
      }
    }
  });
  it("every HIPOTESIS constant is editable", () => {
    for (const s of allSourced()) {
      if (s.provenance === "HIPOTESIS") {
        expect(s.editable, `editable for ${s.unit}/${s.value}`).toBe(true);
      }
    }
  });
  it("every constant has an asOf date", () => {
    for (const s of allSourced()) {
      expect(s.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
