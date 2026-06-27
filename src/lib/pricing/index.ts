export * from "./types";
export { CONSTANTS, TIERS, TIERS_LIST, MODEL_AS_OF, DISCLAIMER } from "./constants";
export { computeBuyerEconomics } from "./buyer";
export { computeSellerEconomics, effectiveLicenseMonthly, tierCapacity } from "./seller";
export { buyerScenarios, sellerScenarios } from "./scenarios";
export { buildChatContext, buildSystemPrompt } from "./chat-context";
export { formatGBP, formatPct, formatRatio, formatMonths } from "./format";

import { TIERS } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import { buyerScenarios, sellerScenarios } from "./scenarios";
import type {
  BuyerEconomics, BuyerInputs, ScenarioSet, SellerEconomics, SellerInputs,
} from "./types";

export interface Model {
  tier: BuyerInputs["tierId"];
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
}

export function computeModel(buyerInputs: BuyerInputs, sellerInputs: SellerInputs): Model {
  const tier = TIERS[buyerInputs.tierId];
  const sellerTier = TIERS[sellerInputs.tierId];
  return {
    tier: buyerInputs.tierId,
    buyer: computeBuyerEconomics(buyerInputs, tier),
    seller: computeSellerEconomics(sellerInputs, sellerTier),
    buyerScenarios: buyerScenarios(buyerInputs, tier),
    sellerScenarios: sellerScenarios(sellerInputs, sellerTier),
  };
}
