import { describe, it, expect } from "vitest";
import {
  DEFAULT_INPUTS, applyAction, clampInputs, parseInputsAction,
  toBuyerInputs, toSellerInputs, describeChanges, changedKeys,
} from "@/lib/pricing/inputs";
import type { CalculatorInputs } from "@/lib/pricing/types";

const base: CalculatorInputs = { ...DEFAULT_INPUTS, tier: "enterprise" };

describe("clampInputs", () => {
  it("clamps numbers above max and snaps to step", () => {
    const out = clampInputs({ ...base, seats: 999999, blendedRate: 401 });
    expect(out.seats).toBe(2643); // max
    expect(out.blendedRate).toBe(400); // snapped to step 10
  });
  it("clamps below min and out-of-range percentages", () => {
    const out = clampInputs({ ...base, seats: -5, automationPct: 200, valueRealizationPct: -10 });
    expect(out.seats).toBe(1); // min
    expect(out.automationPct).toBe(100); // max %
    expect(out.valueRealizationPct).toBe(0); // min %
  });
});

describe("applyAction", () => {
  it("merges only provided keys over current inputs and clamps", () => {
    const next = applyAction(base, { seats: 200, blendedRate: 400, tier: "enterprise" });
    expect(next.seats).toBe(200);
    expect(next.blendedRate).toBe(400);
    expect(next.filingsPerMonth).toBe(base.filingsPerMonth); // untouched
  });
  it("can switch tier and billing", () => {
    const next = applyAction(base, { tier: "firm", billingCycle: "monthly" });
    expect(next.tier).toBe("firm");
    expect(next.billingCycle).toBe("monthly");
  });
});

describe("toBuyerInputs / toSellerInputs", () => {
  it("forces SMB tiers to a single seat and converts percentages to ratios", () => {
    const smb = toBuyerInputs({ ...base, tier: "chambers", seats: 50, automationPct: 65, valueRealizationPct: 50 });
    expect(smb.seats).toBe(1);
    expect(smb.automationPct).toBeCloseTo(0.65);
    expect(smb.valueRealizationPct).toBeCloseTo(0.5);
  });
  it("keeps enterprise seats and maps filings to scans", () => {
    const ent = toSellerInputs({ ...base, tier: "enterprise", seats: 300, filingsPerMonth: 4 });
    expect(ent.seats).toBe(300);
    expect(ent.scansPerSeatMonth).toBe(4);
  });
});

describe("parseInputsAction", () => {
  it("extracts a fenced set_inputs block, strips it from the text, validates", () => {
    const reply = [
      "Sure — switching to enterprise with 200 lawyers.",
      "```json",
      '{"action":"set_inputs","inputs":{"tier":"enterprise","seats":200,"blendedRate":"400"}}',
      "```",
    ].join("\n");
    const { text, action } = parseInputsAction(reply);
    expect(text).toBe("Sure — switching to enterprise with 200 lawyers.");
    expect(action).toEqual({ tier: "enterprise", seats: 200, blendedRate: 400 }); // "400" coerced
  });
  it("ignores unknown keys and returns null action when nothing valid remains", () => {
    const reply = '```json\n{"action":"set_inputs","inputs":{"bogus":1}}\n```';
    expect(parseInputsAction(reply).action).toBeNull();
  });
  it("returns null action for plain prose", () => {
    const { text, action } = parseInputsAction("The gross margin is 97.2% (VERIFIED).");
    expect(action).toBeNull();
    expect(text).toBe("The gross margin is 97.2% (VERIFIED).");
  });
});

describe("diff helpers", () => {
  it("describeChanges and changedKeys report only what moved", () => {
    const next = applyAction(base, { seats: 200, tier: "enterprise" });
    expect(changedKeys(base, next)).toEqual(["seats"]);
    expect(describeChanges(base, next)).toEqual(["Lawyers (seats) 793 → 200"]);
  });
});
