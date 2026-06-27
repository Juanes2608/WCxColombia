// The firm's total cost of ownership for solving the AI-citation problem in-house.
// We are NOT a vendor with a margin: this shows what it costs the firm to BUILD the
// solution (full development, one-time) and SUSTAIN it (maintenance, annual), at
// cost, scaled to the chosen capacity tier. Measured against the only quantifiable
// benefit — review time saved. Sanction/reputational risk is narrative, never priced.
import { CONSTANTS, type Constants } from "./constants";
import { CAPACITY_TIERS } from "./capacity";
import { computeImplementation, computeRunCost } from "./cost-model";
import type { BusinessCase, CalculatorInputs } from "./types";

export function computeBusinessCase(
  inputs: CalculatorInputs,
  c: Constants = CONSTANTS,
): BusinessCase {
  const tier = CAPACITY_TIERS.find((t) => t.id === inputs.capacityTier) ?? CAPACITY_TIERS[0];
  const seats = Math.min(inputs.seats, tier.maxUsers);

  // Savings — review time only (tier-independent). Risk is narrative, never priced.
  const hoursSavedMonthly =
    seats * inputs.filingsPerMonth * inputs.hoursPerFiling * (inputs.automationPct / 100);
  const timeSavedAnnual =
    hoursSavedMonthly * inputs.blendedRate * (inputs.valueRealizationPct / 100) * 12;
  const totalSavedAnnual = timeSavedAnnual;

  // Usage / scale, clamped to the tier's request capacity.
  const requestedScansMonthly = seats * inputs.filingsPerMonth;
  const scansMonthly = Math.min(requestedScansMonthly, tier.maxRequestsMonth);
  const requestsPerYear = scansMonthly * 12;

  // Cost to the firm, at cost: build once + deploy at this capacity + run it.
  const implementation = computeImplementation(tier.deployment, c);
  const implementationOneTime = implementation.total;
  const runCost = computeRunCost(requestsPerYear, tier.infraMonthly, tier.opsMonthly, c);
  const maintenanceAnnual = runCost.total;
  const year1Cost = implementationOneTime + maintenanceAnnual;
  const ongoingAnnualCost = maintenanceAnnual;

  const firmRevenueGBP =
    (c.WC_TOTAL_LAWYERS.value * c.WC_RPL_USD.value) / c.FX_USD_PER_GBP.value;
  const year1CostPctOfFirmRevenue = firmRevenueGBP > 0 ? year1Cost / firmRevenueGBP : 0;

  const year1Net = totalSavedAnnual - year1Cost;
  const monthlySaved = totalSavedAnnual / 12;
  const paybackMonths = monthlySaved > 0 ? year1Cost / monthlySaved : null;
  const roiYear1Pct = year1Cost > 0 ? year1Net / year1Cost : null;
  const threeYearNet = totalSavedAnnual * 3 - (implementationOneTime + maintenanceAnnual * 3);

  return {
    seats,
    scansMonthly,
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
