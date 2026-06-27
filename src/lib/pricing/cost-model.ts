// Bottom-up cost of solving the problem in-house — NOT a hand-wave percentage.
// Implementation = full development (build the engine once) + deployment into the
// firm. Maintenance = the real COGS to keep it running (LLM API + hosting + ops).
// No licence, no margin: this is what it costs the firm, at cost.
import { CONSTANTS, type Constants } from "./constants";
import type {
  CoreBuildBreakdown, DeploymentBreakdown, ImplementationCost, RunCost,
} from "./types";

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

export function computeDeployment(c: Constants = CONSTANTS): DeploymentBreakdown {
  const integration = c.IMPL_INTEGRATION.value;
  const infosec = c.IMPL_INFOSEC.value;
  const training = c.IMPL_TRAINING.value;
  const projectMgmt = c.IMPL_PROJECT.value;
  return {
    integration,
    infosec,
    training,
    projectMgmt,
    total: integration + infosec + training + projectMgmt,
  };
}

/** Full one-time cost: develop the whole solution + deploy it into the firm. */
export function computeImplementation(c: Constants = CONSTANTS): ImplementationCost {
  const coreBuild = computeCoreBuild(c);
  const deployment = computeDeployment(c);
  return { coreBuild, deployment, total: coreBuild.total + deployment.total };
}

export function computeRunCost(
  scansPerYear: number,
  opsMonthly: number,
  c: Constants = CONSTANTS,
): RunCost {
  const llmApiAnnual = scansPerYear * (c.LLM_COST_PER_SCAN.value + c.API_COST_PER_SCAN.value);
  const infraAnnual = c.ENTERPRISE_INFRA_MONTHLY.value * 12;
  const supportAnnual = opsMonthly * 12;
  return {
    llmApiAnnual,
    infraAnnual,
    supportAnnual,
    total: llmApiAnnual + infraAnnual + supportAnnual,
  };
}
