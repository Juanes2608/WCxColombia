// Bottom-up cost of solving the problem in-house — NOT a hand-wave percentage.
// Implementation = full development (build the engine once) + deployment at the
// chosen capacity. Maintenance = the real COGS to keep it running (LLM API +
// hosting + ops). No licence, no margin: this is what it costs the firm, at cost.
import { CONSTANTS, type Constants } from "./constants";
import type { CoreBuildBreakdown, ImplementationCost, RunCost } from "./types";

export function computeCoreBuild(c: Constants = CONSTANTS): CoreBuildBreakdown {
  const graphIngestion = c.BUILD_GRAPH_INGESTION.value;
  const verdictEngine = c.BUILD_VERDICT_ENGINE.value;
  const app = c.BUILD_APP.value;
  const qaHardening = c.BUILD_QA.value;
  return {
    graphIngestion,
    verdictEngine,
    app,
    qaHardening,
    total: graphIngestion + verdictEngine + app + qaHardening,
  };
}

/** Full one-time cost: build the engine once + deploy it at this capacity. */
export function computeImplementation(
  deployment: number,
  c: Constants = CONSTANTS,
): ImplementationCost {
  const coreBuild = computeCoreBuild(c);
  return { coreBuild, deployment, total: coreBuild.total + deployment };
}

export function computeRunCost(
  scansPerYear: number,
  infraMonthly: number,
  opsMonthly: number,
  c: Constants = CONSTANTS,
): RunCost {
  const llmApiAnnual = scansPerYear * (c.LLM_COST_PER_SCAN.value + c.API_COST_PER_SCAN.value);
  const infraAnnual = infraMonthly * 12;
  const opsAnnual = opsMonthly * 12;
  return {
    llmApiAnnual,
    infraAnnual,
    opsAnnual,
    total: llmApiAnnual + infraAnnual + opsAnnual,
  };
}
