// The firm's total cost of ownership for solving the AI-citation problem in-house.
// We are NOT a vendor with a margin: this shows what it costs the firm to BUILD the
// solution (full development, one-time) and SUSTAIN it (maintenance, annual), at
// cost, scaled to their capacity. Measured against the only quantifiable benefit —
// review time saved. Sanction/reputational risk is narrative, never priced.
import { CONSTANTS, TIERS, type Constants } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import { toBuyerInputs, toSellerInputs } from "./inputs";
import { computeImplementation, computeRunCost } from "./cost-model";
import type { BusinessCase, CalculatorInputs } from "./types";

export function computeBusinessCase(
  inputs: CalculatorInputs,
  c: Constants = CONSTANTS,
): BusinessCase {
  const tier = TIERS[inputs.tier];
  const buyer = computeBuyerEconomics(toBuyerInputs(inputs), tier, c);
  const seller = computeSellerEconomics(toSellerInputs(inputs), tier, c);

  const requestsPerYear = seller.scansMonthly * 12;

  // Cost to the firm, at cost: full development (one-time) + maintenance (annual).
  const implementation = computeImplementation(c);
  const implementationOneTime = implementation.total;
  const runCost = computeRunCost(requestsPerYear, tier.supportMonthly.value, c);
  const maintenanceAnnual = runCost.total;
  const year1Cost = implementationOneTime + maintenanceAnnual;
  const ongoingAnnualCost = maintenanceAnnual;

  const firmRevenueGBP =
    (c.WC_TOTAL_LAWYERS.value * c.WC_RPL_USD.value) / c.FX_USD_PER_GBP.value;
  const year1CostPctOfFirmRevenue = firmRevenueGBP > 0 ? year1Cost / firmRevenueGBP : 0;

  // Savings — review time only. Risk is narrative, never a number here.
  const timeSavedAnnual = buyer.realizedTimeValueMonthly * 12;
  const totalSavedAnnual = timeSavedAnnual;

  const year1Net = totalSavedAnnual - year1Cost;
  const monthlySaved = totalSavedAnnual / 12;
  const paybackMonths = monthlySaved > 0 ? year1Cost / monthlySaved : null;
  const roiYear1Pct = year1Cost > 0 ? year1Net / year1Cost : null;
  const threeYearNet = totalSavedAnnual * 3 - (implementationOneTime + maintenanceAnnual * 3);

  return {
    seats: toSellerInputs(inputs).seats,
    scansMonthly: seller.scansMonthly,
    requestsPerYear,
    implementation,
    implementationOneTime,
    runCost,
    maintenanceAnnual,
    year1Cost,
    ongoingAnnualCost,
    year1CostPctOfFirmRevenue,
    timeSavedAnnual,
    totalSavedAnnual,
    year1Net,
    paybackMonths,
    roiYear1Pct,
    threeYearNet,
    sanctionDirectCost: c.DIRECT_WASTED_COSTS_PER_INCIDENT.value,
  };
}
