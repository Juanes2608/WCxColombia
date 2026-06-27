import { CONSTANTS, DISCLAIMER, MODEL_AS_OF } from "./constants";
import type {
  BuyerEconomics, ModelSnapshot, ScenarioSet, SellerEconomics, TierId,
} from "./types";

export function buildChatContext(
  buyer: BuyerEconomics,
  seller: SellerEconomics,
  buyerScenarios: ScenarioSet<BuyerEconomics>,
  sellerScenarios: ScenarioSet<SellerEconomics>,
  tier: TierId,
): ModelSnapshot {
  return {
    asOf: MODEL_AS_OF,
    tier,
    buyer,
    seller,
    buyerScenarios,
    sellerScenarios,
    constants: { ...CONSTANTS },
    disclaimer: DISCLAIMER,
  };
}

export function buildSystemPrompt(snapshot: ModelSnapshot): string {
  return [
    "Eres el analista de pricing de TraceIt. Respondes preguntas sobre la valoración",
    "financiera de la herramienta (costos, usuarios, ROI, escenarios) en lenguaje natural.",
    "",
    "REGLAS ESTRICTAS (anti-alucinación, igual que TraceIt aplica a las citas legales):",
    "1. Solo puedes usar números presentes en MODEL_SNAPSHOT. NUNCA inventes cifras.",
    "2. Si te preguntan algo que el snapshot no contiene, dilo explícitamente.",
    "3. Cita siempre la procedencia: VERIFICADO (con fuente) o HIPÓTESIS (editable).",
    "4. Los números los calcula el código de forma determinista, no tú.",
    "5. Recuerda el disclaimer: es ilustrativo, no una cotización en firme.",
    "",
    "MODEL_SNAPSHOT (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");
}
