// TraceIt — backend response contract (§3 of the master prompt)

export interface HealthStatus {
  status: "ok";
  neo4j: "connected" | "unavailable (Layer 2 degraded)";
  legislation_gov_uk: string;
}

export type AuthenticityVerdict = "FABRICATED" | "MISAPPLIED" | "VERIFIED";
export type GoodLawVerdict =
  | "OVERRULED"
  | "DISTINGUISHED"
  | "GOOD_LAW"
  | "UNAVAILABLE"
  | "NOT_CHECKED";

export interface TreatmentRef {
  citing_case: string;
  year: number;
  court: string;
  context: string;
}

export interface Layer1 {
  verdict: AuthenticityVerdict;
  confidence: number; // 0.0–1.0
  node_id: string | null; // null when FABRICATED
  proposition_cited: string | null;
  proposition_actual: string | null;
  explanation: string;
  llm_explanation: string | null; // advisory only
}

export interface Layer2 {
  verdict: GoodLawVerdict;
  overruled_by: TreatmentRef[];
  distinguished_by: TreatmentRef[];
  source: "neo4j" | "csv" | "not_checked" | "not_applicable" | "agent";
}

export interface Statutory {
  act: string;
  year: number;
  section: string;
  exists: boolean | null; // null = timeout (could not verify)
  api_status: number | null;
  excerpt: string | null;
  source_url: string;
}

export interface CorpusSource {
  node_id: string;
  citation: string;
  short_name: string;
  court: string;
  domain: string;
  bailii_url: string | null;
  status: string;
}

export interface BriefPointer {
  sentence: string;
  paragraph_hint: string | null;
  char_position: number;
}

export interface JudgmentPointer {
  para_no: number;
  excerpt: string;
  is_holding: boolean;
}

export interface AmendmentSuggestion {
  citation: string;
  short_name: string;
  proposition: string;
  rationale: string;
}

export interface HoldingAnalysis {
  case_summary: string | null;
  verdict_reasoning: string | null;
  brief_pointer: BriefPointer | null;
  judgment_pointers: JudgmentPointer[];
  amendments: AmendmentSuggestion[];
  confidence: number;
  holding_found: boolean;
  analysis_mode: "full" | "degraded" | "none";
  agent_model: string;
}

export interface CitationResult {
  raw_text: string;
  corpus_source?: CorpusSource;
  layer1: Layer1;
  layer2: Layer2;
  statutory: Statutory | null;
  holding_analysis?: HoldingAnalysis;
  document_context?: string;
  document_char_pos?: number;
}

export interface Transparency {
  method: string;
  verdict_source: string;
  corpus_size: number;
  limitations: string[];
}

export interface ProofPanel {
  matter_id: string;
  citation_index: number;
  raw_citation: string;
  verdict: AuthenticityVerdict;
  confidence: number;
  document_context: string;
  document_char_pos: number;
  document_claim: string;
  corpus_proposition: string;
  key_paragraph: string | null;
  good_law_status: GoodLawVerdict;
  overruled_by: TreatmentRef[];
  distinguished_by: TreatmentRef[];
  bailii_url: string | null;
  llm_explanation: string | null;
  static_explanation: string;
  transparency: Transparency;
}

export interface DocumentCitation {
  idx: number;
  raw_text: string;
  char_pos: number;
  verdict: AuthenticityVerdict;
}

export interface DocumentView {
  matter_id: string;
  text: string;
  char_count: number;
  citations: DocumentCitation[];
}

export interface FinancialSummary {
  n_fabricated: number;
  n_misapplied: number;
  n_overruled: number;
  n_verified: number;
  flag_rate: number; // 0.0–1.0
  savings_gbp: number;
  risk_ev_gbp: number;
  baseline_hallucination_rate: number; // 0.43 (Stanford)
}

export interface VerifyResult {
  matter_id: string;
  total_citations: number;
  results: CitationResult[];
  financial: FinancialSummary;
  processing_ms: number;
  audit_trail_hash: string; // SHA-256 hex, 64 chars
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; status: string }>;
  edges: Array<{ source: string; target: string; type: string }>;
}