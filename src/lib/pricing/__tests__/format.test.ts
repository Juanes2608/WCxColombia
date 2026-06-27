import { describe, it, expect } from "vitest";
import { formatGBP, formatPct, formatRatio, formatMonths } from "@/lib/pricing/format";

describe("format", () => {
  it("formats GBP with no decimals", () => {
    expect(formatGBP(79300)).toBe("£79,300");
    expect(formatGBP(0)).toBe("£0");
  });
  it("formats percentages", () => {
    expect(formatPct(0.9724)).toBe("97.2%");
    expect(formatPct(0)).toBe("0.0%");
  });
  it("formats ratios and Infinity", () => {
    expect(formatRatio(128.5)).toBe("128.5×");
    expect(formatRatio(Infinity)).toBe("∞");
  });
  it("formats months and null", () => {
    expect(formatMonths(1.56)).toBe("1.6 months");
    expect(formatMonths(null)).toBe("not yet");
  });
});
