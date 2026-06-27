import { describe, it, expect } from "vitest";
import {
  DEFAULT_INPUTS, applyAction, clampInputs, parseInputsAction,
  describeChanges, changedKeys,
} from "@/lib/pricing/inputs";
import type { CalculatorInputs } from "@/lib/pricing/types";

const base: CalculatorInputs = { ...DEFAULT_INPUTS };

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
    const next = applyAction(base, { seats: 200, blendedRate: 400 });
    expect(next.seats).toBe(200);
    expect(next.blendedRate).toBe(400);
    expect(next.filingsPerMonth).toBe(base.filingsPerMonth); // untouched
  });
  it("can switch the capacity tier", () => {
    const next = applyAction(base, { capacityTier: "firmwide" });
    expect(next.capacityTier).toBe("firmwide");
  });
});

describe("parseInputsAction", () => {
  it("extracts a fenced set_inputs block, strips it from the text, validates", () => {
    const reply = [
      "Sure — modelling firm-wide with 200 lawyers.",
      "```json",
      '{"action":"set_inputs","inputs":{"capacityTier":"firmwide","seats":200,"blendedRate":"400"}}',
      "```",
    ].join("\n");
    const { text, action } = parseInputsAction(reply);
    expect(text).toBe("Sure — modelling firm-wide with 200 lawyers.");
    expect(action).toEqual({ capacityTier: "firmwide", seats: 200, blendedRate: 400 }); // "400" coerced
  });
  it("ignores unknown keys and returns null action when nothing valid remains", () => {
    const reply = '```json\n{"action":"set_inputs","inputs":{"bogus":1}}\n```';
    expect(parseInputsAction(reply).action).toBeNull();
  });
  it("returns null action for plain prose", () => {
    const { text, action } = parseInputsAction("The payback is 1.2 months (deterministic).");
    expect(action).toBeNull();
    expect(text).toBe("The payback is 1.2 months (deterministic).");
  });
});

describe("diff helpers", () => {
  it("describeChanges and changedKeys report only what moved", () => {
    const next = applyAction(base, { seats: 200 });
    expect(changedKeys(base, next)).toEqual(["seats"]);
    expect(describeChanges(base, next)).toEqual(["Lawyers 793 → 200"]);
  });
});
