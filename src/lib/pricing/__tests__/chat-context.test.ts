import { describe, it, expect } from "vitest";
import { buildChatContext, buildSystemPrompt } from "@/lib/pricing/chat-context";
import { computeBuyerEconomics } from "@/lib/pricing/buyer";
import { computeSellerEconomics } from "@/lib/pricing/seller";
import { buyerScenarios, sellerScenarios } from "@/lib/pricing/scenarios";
import { TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing/types";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

const snap = buildChatContext(
  computeBuyerEconomics(b, TIERS.enterprise),
  computeSellerEconomics(s, TIERS.enterprise),
  buyerScenarios(b, TIERS.enterprise),
  sellerScenarios(s, TIERS.enterprise),
  "enterprise",
);

describe("chat context", () => {
  it("snapshot carries computed numbers and disclaimer", () => {
    expect(snap.tier).toBe("enterprise");
    expect(snap.seller.revenueMonthly).toBe(79300);
    expect(snap.disclaimer.length).toBeGreaterThan(0);
    expect(snap.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("snapshot includes provenance-labeled constants", () => {
    expect(snap.constants.WC_TOTAL_LAWYERS.provenance).toBe("VERIFICADO");
  });
  it("system prompt forbids inventing numbers and embeds the snapshot", () => {
    const prompt = buildSystemPrompt(snap);
    expect(prompt).toMatch(/MODEL_SNAPSHOT/);
    expect(prompt.toLowerCase()).toMatch(/nunca inventes|no inventes/);
    expect(prompt).toContain("79300"); // a real computed figure is present
  });
});
