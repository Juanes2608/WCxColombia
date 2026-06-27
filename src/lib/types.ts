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
  source: "neo4j" | "csv" | "not_checked" | "not_applicable";
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

export interface CitationResult {
  raw_text: string;
  layer1: Layer1;
  layer2: Layer2;
  statutory: Statutory | null;
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