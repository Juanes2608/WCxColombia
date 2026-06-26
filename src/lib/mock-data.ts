// CitationGuard — deterministic-feeling mock report generator.
// Produces a realistic VerifyResult that exercises every UI state.

import type { CitationResult, VerifyResult } from "./types";

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

function uuid(): string {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

const SAMPLE_CITATIONS: CitationResult[] = [
  {
    raw_text: "Carlisle v Rookwood Holdings Ltd [2021] EWHC 4412 (Comm)",
    layer1: {
      verdict: "FABRICATED",
      confidence: 1.0,
      node_id: null,
      proposition_cited:
        "A director owes no fiduciary duty where the company is solvent.",
      proposition_actual: null,
      explanation:
        "Citation not found in the England & Wales corpus. No neutral citation [2021] EWHC 4412 (Comm) exists. This verdict is deterministic, not LLM-generated.",
      llm_explanation:
        "The cited neutral citation number falls outside the range issued by the Commercial Court in 2021; the case name returns no corpus match.",
    },
    layer2: {
      verdict: "NOT_CHECKED",
      overruled_by: [],
      distinguished_by: [],
      source: "not_applicable",
    },
    statutory: null,
  },
  {
    raw_text: "Pepper (Inspector of Taxes) v Hart [1992] UKHL 3",
    layer1: {
      verdict: "MISAPPLIED",
      confidence: 0.74,
      node_id: "node:UKHL:1992:3",
      proposition_cited:
        "Hansard may be consulted for any question of statutory interpretation.",
      proposition_actual:
        "Hansard may be consulted only where legislation is ambiguous or obscure, the material relied on is a ministerial statement, and that statement is clear.",
      explanation:
        "The authority exists and is good law, but the proposition advanced is broader than the ratio. The Pepper v Hart conditions are cumulative and narrow.",
      llm_explanation:
        "The skeleton states the rule without its three limiting conditions, overstating the scope of permissible reference to Hansard.",
    },
    layer2: {
      verdict: "GOOD_LAW",
      overruled_by: [],
      distinguished_by: [],
      source: "neo4j",
    },
    statutory: null,
  },
  {
    raw_text: "Anns v Merton London Borough Council [1978] AC 728",
    layer1: {
      verdict: "VERIFIED",
      confidence: 0.97,
      node_id: "node:AC:1978:728",
      proposition_cited:
        "A two-stage test governs the existence of a duty of care.",
      proposition_actual:
        "A two-stage test governs the existence of a duty of care.",
      explanation:
        "The authority exists and the proposition is faithfully stated. However, see good-law status.",
      llm_explanation: null,
    },
    layer2: {
      verdict: "OVERRULED",
      overruled_by: [
        {
          citing_case: "Murphy v Brentwood DC",
          year: 1991,
          court: "House of Lords",
          context:
            "The Anns two-stage test was expressly departed from; Caparo's incremental approach now governs.",
        },
      ],
      distinguished_by: [],
      source: "neo4j",
    },
    statutory: null,
  },
  {
    raw_text: "Caparo Industries plc v Dickman [1990] UKHL 2",
    layer1: {
      verdict: "VERIFIED",
      confidence: 0.99,
      node_id: "node:UKHL:1990:2",
      proposition_cited:
        "Foreseeability, proximity and fairness establish a duty of care.",
      proposition_actual:
        "Foreseeability, proximity and that it be fair, just and reasonable establish a duty of care.",
      explanation:
        "The authority exists and the proposition is faithfully stated. No adverse treatment found.",
      llm_explanation: null,
    },
    layer2: {
      verdict: "GOOD_LAW",
      overruled_by: [],
      distinguished_by: [],
      source: "neo4j",
    },
    statutory: null,
  },
  {
    raw_text: "R v Secretary of State, ex p Smith [1996] QB 517",
    layer1: {
      verdict: "VERIFIED",
      confidence: 0.88,
      node_id: "node:QB:1996:517",
      proposition_cited:
        "The threshold for irrationality rises with the seriousness of the issue.",
      proposition_actual:
        "The threshold for irrationality rises with the seriousness of the issue.",
      explanation:
        "The authority exists and the proposition is faithfully stated.",
      llm_explanation: null,
    },
    layer2: {
      verdict: "DISTINGUISHED",
      overruled_by: [],
      distinguished_by: [
        {
          citing_case: "R (Daly) v SSHD",
          year: 2001,
          court: "House of Lords",
          context:
            "Distinguished on the basis that proportionality, not Wednesbury, applies to Convention rights.",
        },
      ],
      source: "neo4j",
    },
    statutory: null,
  },
  {
    raw_text: "Human Rights Act 1998, s.3",
    layer1: {
      verdict: "VERIFIED",
      confidence: 0.95,
      node_id: "node:STAT:HRA1998",
      proposition_cited:
        "Legislation must be read compatibly with Convention rights so far as possible.",
      proposition_actual:
        "Legislation must be read compatibly with Convention rights so far as possible.",
      explanation: "Statutory provision verified against legislation.gov.uk.",
      llm_explanation: null,
    },
    layer2: {
      verdict: "NOT_CHECKED",
      overruled_by: [],
      distinguished_by: [],
      source: "not_applicable",
    },
    statutory: {
      act: "Human Rights Act",
      year: 1998,
      section: "3",
      exists: true,
      api_status: 200,
      excerpt:
        "So far as it is possible to do so, primary legislation and subordinate legislation must be read and given effect in a way which is compatible with the Convention rights.",
      source_url: "https://www.legislation.gov.uk/ukpga/1998/42/section/3",
    },
  },
  {
    raw_text: "Senior Courts Act 1981, s.31A",
    layer1: {
      verdict: "VERIFIED",
      confidence: 0.82,
      node_id: "node:STAT:SCA1981",
      proposition_cited: "Provides for the transfer of judicial review applications.",
      proposition_actual: "Provides for the transfer of judicial review applications.",
      explanation:
        "Statutory lookup timed out; the provision could not be verified against legislation.gov.uk.",
      llm_explanation: null,
    },
    layer2: {
      verdict: "NOT_CHECKED",
      overruled_by: [],
      distinguished_by: [],
      source: "not_applicable",
    },
    statutory: {
      act: "Senior Courts Act",
      year: 1981,
      section: "31A",
      exists: null,
      api_status: null,
      excerpt: null,
      source_url: "https://www.legislation.gov.uk/ukpga/1981/54/section/31A",
    },
  },
];

export function buildMockResult(_file: File): VerifyResult {
  const results = SAMPLE_CITATIONS;
  const n_fabricated = results.filter((r) => r.layer1.verdict === "FABRICATED").length;
  const n_misapplied = results.filter((r) => r.layer1.verdict === "MISAPPLIED").length;
  const n_overruled = results.filter((r) => r.layer2.verdict === "OVERRULED").length;
  const n_verified = results.filter((r) => r.layer1.verdict === "VERIFIED").length;
  const flagged = results.filter((r) => r.layer1.verdict !== "VERIFIED").length;

  return {
    matter_id: uuid(),
    total_citations: results.length,
    results,
    financial: {
      n_fabricated,
      n_misapplied,
      n_overruled,
      n_verified,
      flag_rate: flagged / results.length,
      savings_gbp: 1180.0,
      risk_ev_gbp: n_fabricated * 62000,
      baseline_hallucination_rate: 0.43,
    },
    processing_ms: 3870 + Math.floor(Math.random() * 900),
    audit_trail_hash: randomHex(64),
  };
}