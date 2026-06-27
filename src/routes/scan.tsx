import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { Loader2, UploadCloud, FileText, AlertCircle, Star, ClipboardPaste } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import {
  verifyCitations,
  ApiError,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/api-client";
import type { AuthenticityVerdict, DocumentView, VerifyResult } from "@/lib/types";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "TraceIt — Citation integrity for skeleton arguments" },
      {
        name: "description",
        content:
          "Verify every legal citation in a High Court skeleton argument: does it exist, is it applied correctly, is it still good law? Deterministic corpus lookup — never an LLM.",
      },
      { property: "og:title", content: "TraceIt" },
      {
        property: "og:description",
        content: "Because the AI invents. The corpus doesn't.",
      },
    ],
  }),
  component: Index,
});

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO: VerifyResult = {
  matter_id: "c19bc393-3a58-4905-a95c-98253433560e",
  total_citations: 11,
  processing_ms: 123602,
  audit_trail_hash: "f08641cd24d75ea94911c0439013cd9acffc0b0fc6e6b8fcd5b75f6c9a5c04fd",
  financial: { n_fabricated: 2, n_misapplied: 2, n_overruled: 0, n_verified: 7, flag_rate: 0.36, savings_gbp: 0, risk_ev_gbp: 0, baseline_hallucination_rate: 0.43 },
  results: [
    {
      raw_text: "Lumley v Gye (1853) 2 E&B 216",
      corpus_source: { node_id: "lumley-v-gye", citation: "Lumley v Gye (1853) 2 El & Bl 216", short_name: "Lumley v Gye", court: "QB", domain: "tort", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "Lumley v Gye establishes that inducing breach of contract is an actionable tort requiring knowledge and intent, precisely as cited in the skeleton; the case remains GOOD_LAW." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Lumley v Gye establishes that an action lies for maliciously procuring a breach of contract, specifically where a defendant knowingly induces a third party to break their contractual obligations.",
        verdict_reasoning: "The skeleton's citation to Lumley v Gye is correctly applied. The judgment confirms this is the core holding: an action lies for maliciously procuring a breach of contract to give exclusive personal services for a time certain.",
        brief_pointer: { sentence: "The tort is that in Lumley v Gye (1853) 2 E&B 216, as restated for the modern law of economic torts in OBG Ltd v Allan [2007] UKHL 21.", paragraph_hint: "Ground 1 — Inducing breach of contract", char_position: 314 },
        judgment_pointers: [
          { para_no: 2, excerpt: "Held, by Wightman, Erle and Crompton Js., that the counts were all good, and that an action lies for maliciously procuri", is_holding: true },
          { para_no: 2, excerpt: "Semble, by the same Judges, that the action would lie for the malicious procurement of the breach of any contract, thoug", is_holding: true },
        ],
        amendments: [], confidence: 0.92, holding_found: true, analysis_mode: "full", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 1 — Inducing breach of contract\n1. The defendant knowingly induced the claimant's supplier to breach its exclusive supply agreement.\nThe tort is that in Lumley v Gye (1853) 2 E&B 216",
      document_char_pos: 314,
    },
    {
      raw_text: "OBG Ltd v Allan [2007] UKHL 21",
      corpus_source: { node_id: "obg-ltd-v-allan", citation: "OBG Ltd v Allan [2007] UKHL 21", short_name: "OBG Ltd v Allan", court: "UKHL", domain: "tort", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "OBG Ltd v Allan [2007] UKHL 21 is good law and correctly cited as the modern restatement of the tort of inducing breach of contract." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "OBG Ltd v Allan establishes that intentional interference with trade by unlawful means requires the defendant to target the claimant using means that are unlawful as against a third party.",
        verdict_reasoning: "The skeleton argument cites OBG Ltd v Allan broadly to establish the legal framework for the economic tort of inducing breach of contract, restating it from Lumley v Gye. The citation is relevant and correct.",
        brief_pointer: { sentence: "The tort is that in Lumley v Gye (1853) 2 E&B 216, as restated for the modern law of economic torts in OBG Ltd v Allan [2007] UKHL 21.", paragraph_hint: null, char_position: 397 },
        judgment_pointers: [],
        amendments: [], confidence: 0.6, holding_found: true, analysis_mode: "degraded", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 1 — Inducing breach of contract\nThe tort is that in Lumley v Gye (1853) 2 E&B 216, as restated for the modern law of economic torts in OBG Ltd v Allan [2007] UKHL 21.",
      document_char_pos: 397,
    },
    {
      raw_text: "Caparo Industries plc v Dickman [1990] 2 AC 605",
      corpus_source: { node_id: "caparo-industries-plc-v-dickman", citation: "Caparo Industries plc v Dickman [1990] 2 AC 605", short_name: "Caparo Industries plc v Dickman", court: "UKHL", domain: "tort", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "Caparo Industries plc v Dickman [1990] 2 AC 605 is a foundational House of Lords decision establishing the three-part test for duty of care, correctly cited and applied." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Caparo Industries plc v Dickman established the three-stage test for determining whether a duty of care exists in negligence: (1) foreseeability of damage, (2) proximity between the parties, and (3) whether it is fair, just and reasonable to impose a duty.",
        verdict_reasoning: "The skeleton argument correctly cites Caparo for the three-stage test applicable to duty of care in respect of economic loss.",
        brief_pointer: { sentence: "The defendant also owed the claimant a duty of care. The applicable framework is the three-stage test in Caparo Industries plc v Dickman [1990] 2 AC 605.", paragraph_hint: "Ground 2 — Duty of care in respect of economic loss", char_position: 589 },
        judgment_pointers: [
          { para_no: 6, excerpt: "The appellants are a well-known firm of chartered accountants. At all times material to this appeal, they were the audit", is_holding: false },
        ],
        amendments: [], confidence: 0.45, holding_found: false, analysis_mode: "full", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 2 — Duty of care in respect of economic loss\n2. The defendant also owed the claimant a duty of care. The applicable framework is the three-stage test in Caparo Industries plc v Dickman [1990] 2 AC 605.",
      document_char_pos: 589,
    },
    {
      raw_text: "Anns v Merton London Borough Council [1978] AC 728",
      corpus_source: { node_id: "anns-v-merton-lbc", citation: "Anns v Merton London Borough Council [1978] AC 728", short_name: "Anns v Merton LBC", court: "UKHL", domain: "tort", bailii_url: null, status: "OVERRULED" },
      layer1: { verdict: "MISAPPLIED", confidence: 0.9, node_id: null, proposition_cited: "Two-stage test for duty of care: proximity relationship plus no policy reasons to limit liability", proposition_actual: "Local authority not liable in negligence for pure economic loss caused by defective foundations — Anns two-stage test overruled", explanation: "The case exists but was cited for the wrong legal proposition." },
      layer2: { verdict: "OVERRULED", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Anns v Merton LBC established a two-stage test for duty of care in negligence: whether there is a proximate relationship between the parties and whether policy reasons exist to limit liability.",
        verdict_reasoning: "The citation appears only in the TABLE OF AUTHORITIES with no substantive textual claim made about its holding. Without an actual claim being made in the skeleton text, consistency cannot be assessed against the substantive proposition.",
        brief_pointer: null,
        judgment_pointers: [],
        amendments: [
          { citation: "Caparo Industries plc v Dickman [1990] 2 AC 605", short_name: "Caparo Industries plc v Dickman", proposition: "Three-part test for duty of care: foreseeability of harm; proximity of relationship; fair just and reasonable to impose duty", rationale: "Establishes the modern three-part test which replaced the Anns two-stage approach" },
          { citation: "Murphy v Brentwood District Council [1991] 1 AC 398", short_name: "Murphy v Brentwood DC", proposition: "Local authority not liable in negligence for pure economic loss caused by defective foundations — Anns two-stage test overruled", rationale: "Directly overruled Anns; confirms the two-stage test no longer represents good law" },
        ],
        confidence: 0.25, holding_found: false, analysis_mode: "degraded", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "TABLE OF AUTHORITIES\n•  Anns v Merton London Borough Council [1978] AC 728",
      document_char_pos: 1836,
    },
    {
      raw_text: "Anglia Television Ltd v Reed [1972] 1 QB 60",
      corpus_source: { node_id: "anglia-television-v-reed", citation: "Anglia Television Ltd v Reed [1972] 1 QB 60", short_name: "Anglia Television v Reed", court: "EWCA", domain: "contract", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "MISAPPLIED", confidence: 0.9, node_id: null, proposition_cited: "Recovery of lost future profits (expectation damages) on the contract.", proposition_actual: "Recovery of pre-contract expenditure wasted as a result of defendant's breach (reliance damages only); does not establish expectation damages.", explanation: "Anglia Television v Reed establishes recovery of wasted pre-contract reliance expenditure, not expectation damages or lost future profits; Robinson v Harman is the correct authority for recovery of lost profits." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "A claimant may recover pre-contract expenditure wasted as a result of the defendant's breach, as an alternative measure of damages to lost profits.",
        verdict_reasoning: "The skeleton cites Anglia Television Ltd v Reed for the proposition that the claimant is entitled to recover 'lost future profits'. However, the case stands for recovery of pre-contract wasted expenditure, not lost future profits. These are distinct damage measures.",
        brief_pointer: { sentence: "The claimant is entitled to the profits it would have earned on the contract, for which it relies on Anglia Television Ltd v Reed [1972] 1 QB 60 as authority for the recovery of lost future profits.", paragraph_hint: null, char_position: 921 },
        judgment_pointers: [],
        amendments: [
          { citation: "Robinson v Harman (1848) 1 Ex 850", short_name: "Robinson v Harman", proposition: "Expectation damages: the claimant is entitled to be put in the same position as if the contract had been performed — recovery of lost profits", rationale: "Establishes expectation damages: the claimant is entitled to be put in the same position as if the contract had been performed — recovery of lost profits" },
          { citation: "Attorney General v Blake [2001] 1 AC 268", short_name: "Attorney General v Blake", proposition: "Account of profits available as exceptional remedy for breach of contract where just in all circumstances", rationale: "Account of profits available as exceptional remedy for breach of contract where just in all circumstances" },
          { citation: "Transfield Shipping Inc v Mercator Shipping Inc (The Achilleas) [2008] UKHL 48", short_name: "The Achilleas", proposition: "Remoteness: defendant only liable for losses within scope of assumed contractual responsibility", rationale: "Remoteness: defendant only liable for losses within scope of assumed contractual responsibility" },
        ],
        confidence: 0.72, holding_found: true, analysis_mode: "degraded", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 3 — Quantum\n3. The claimant is entitled to the profits it would have earned on the contract, for which it relies on Anglia Television Ltd v Reed [1972] 1 QB 60 as authority for the recovery of lost future profits.",
      document_char_pos: 921,
    },
    {
      raw_text: "Hadley v Baxendale (1854) 9 Ex 341",
      corpus_source: { node_id: "hadley-v-baxendale", citation: "Hadley v Baxendale (1854) 9 Ex 341", short_name: "Hadley v Baxendale", court: "Exchequer", domain: "contract", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "The case exists, is good law, and is correctly applied." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Hadley v Baxendale established that damages for breach of contract are limited to losses that were reasonably foreseeable at the time the contract was made as a natural consequence of the breach, or losses that were in the reasonable contemplation of both parties.",
        verdict_reasoning: "The skeleton's citation of Hadley v Baxendale in the 'Quantum' section correctly invokes this case as authority limiting the recoverability of damages. The skeleton states: 'Recoverability is bounded by Hadley v Baxendale (1854) 9 Ex 341.' This accurately reflects the holding.",
        brief_pointer: { sentence: "Recoverability is bounded by Hadley v Baxendale (1854) 9 Ex 341.", paragraph_hint: "Ground 3 — Quantum", char_position: 1048 },
        judgment_pointers: [
          { para_no: 8, excerpt: "and by reason of the several premises, the completing of the said new shaft was delayed for five days, and the plaintiff", is_holding: true },
        ],
        amendments: [], confidence: 0.78, holding_found: true, analysis_mode: "full", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 3 — Quantum\nRecoverability is bounded by Hadley v Baxendale (1854) 9 Ex 341.",
      document_char_pos: 1048,
    },
    {
      raw_text: "Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798",
      corpus_source: { node_id: "wrotham-park-v-parkside-homes", citation: "Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798", short_name: "Wrotham Park v Parkside Homes", court: "EWHC", domain: "equity", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "Case is found in corpus, holds GOOD_LAW status, and is a leading authority on gain-based damages for breach of covenant." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Wrotham Park establishes the principle that damages for breach of covenant can be assessed by reference to the hypothetical price the defendant would have had to pay to obtain release from the covenant, calculated as a percentage of the defendant's gains from the breach.",
        verdict_reasoning: "The citation to Wrotham Park appears only in the Table of Authorities with no substantive claim made about it in the skeleton text itself.",
        brief_pointer: { sentence: "Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798 appears only in the Table of Authorities.", paragraph_hint: null, char_position: 1975 },
        judgment_pointers: [],
        amendments: [], confidence: 0.75, holding_found: false, analysis_mode: "degraded", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "TABLE OF AUTHORITIES\n•  Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798",
      document_char_pos: 1975,
    },
    {
      raw_text: "Rookes v Barnard [1964] AC 1129",
      corpus_source: { node_id: "rookes-v-barnard", citation: "Rookes v Barnard [1964] AC 1129", short_name: "Rookes v Barnard", court: "UKHL", domain: "tort", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "The case exists, is good law, and is correctly applied." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "Rookes v Barnard held that the respondents' actions constituted the tort of wrongful inducement of breach of contract, and established the three categories in which exemplary damages may be awarded.",
        verdict_reasoning: "The skeleton cites Rookes v Barnard for the proposition that it identifies categories within which exemplary damages may be awarded. The citation is correctly applied.",
        brief_pointer: { sentence: "The claimant additionally seeks gain-based relief by reference to Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798, and exemplary damages within the categories identified in Rookes v Barnard [1964] AC 1129.", paragraph_hint: "Ground 3 — Quantum, paragraph 3", char_position: 1274 },
        judgment_pointers: [
          { para_no: 2, excerpt: "It is Ordered and Adjudged, by the Lords Spiritual and Temporal in the Court of Parliament of Her Majesty the Queen asse", is_holding: true },
        ],
        amendments: [], confidence: 0.45, holding_found: true, analysis_mode: "full", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 3 — Quantum\nThe claimant additionally seeks gain-based relief by reference to Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798, and exemplary damages within the categories identified in Rookes v Barnard [1964] AC 1129.",
      document_char_pos: 1274,
    },
    {
      raw_text: "American Cyanamid Co v Ethicon Ltd [1975] AC 396",
      corpus_source: { node_id: "american-cyanamid-v-ethicon", citation: "American Cyanamid Co v Ethicon Ltd [1975] AC 396", short_name: "American Cyanamid v Ethicon", court: "UKHL", domain: "equity", bailii_url: null, status: "GOOD_LAW" },
      layer1: { verdict: "VERIFIED", confidence: 0.9, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "American Cyanamid v Ethicon is correctly cited as the controlling authority for the test governing interim injunctions and is good law." },
      layer2: { verdict: "GOOD_LAW", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: {
        case_summary: "American Cyanamid established the three-stage test for granting interim injunctions: (1) whether there is a serious question to be tried; (2) whether damages would be an adequate remedy; and (3) where the balance of convenience lies.",
        verdict_reasoning: "The skeleton cites American Cyanamid but does not fully articulate the three-stage test. Instead, it uses the citation to introduce discussion of 'irreparable harm' in the context of supplier displacement. This is a partial invocation of the proposition.",
        brief_pointer: { sentence: "The claimant seeks interim relief on the test in American Cyanamid Co v Ethicon Ltd [1975] AC 396. The displacement of a long-term exclusive supplier constitutes irreparable harm.", paragraph_hint: null, char_position: 2078 },
        judgment_pointers: [],
        amendments: [], confidence: 0.62, holding_found: true, analysis_mode: "degraded", agent_model: "claude-haiku-4-5-20251001",
      },
      document_context: "Ground 4 — Interim injunction\n4. The claimant seeks interim relief on the test in American Cyanamid Co v Ethicon Ltd [1975] AC 396.",
      document_char_pos: 2078,
    },
    {
      raw_text: "Calderwood Shipping Ltd v Astra Bulk Carriers SA [2021] EWHC 1180",
      corpus_source: undefined,
      layer1: { verdict: "FABRICATED", confidence: 1.0, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "The case citation does not exist in the verified UK case law database." },
      layer2: { verdict: "NOT_CHECKED", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: undefined,
      document_context: "Ground 4 — Interim injunction\nirreparable harm, as held in Calderwood Shipping Ltd v Astra Bulk Carriers SA [2021] EWHC 1180 (Comm)",
      document_char_pos: 1531,
    },
    {
      raw_text: "Pemberton Aerospace Systems Ltd v Delta Global Ventures Inc [2023] EWHC 892",
      corpus_source: undefined,
      layer1: { verdict: "FABRICATED", confidence: 1.0, node_id: null, proposition_cited: null, proposition_actual: null, explanation: "Case not found in the verified UK case law database." },
      layer2: { verdict: "NOT_CHECKED", overruled_by: [], distinguished_by: [], source: "agent" },
      statutory: null,
      holding_analysis: undefined,
      document_context: "Ground 4 — Interim injunction\nin Pemberton Aerospace Systems Ltd v Delta Global Ventures Inc [2023] EWHC 892 (TCC)",
      document_char_pos: 2206,
    },
  ],
} as unknown as VerifyResult;

function buildDemoDocument(): DocumentView {
  const text =
    "IN THE HIGH COURT OF JUSTICE — KING’S BENCH DIVISION\n" +
    "(COMMERCIAL COURT)\n" +
    "Brightwater Logistics plc v Norvell Components Ltd — Claimant’s Skeleton Argument\n" +
    "Ground 1 — Inducing breach of contract\n" +
    "1. The defendant knowingly induced the claimant’s supplier to breach its exclusive supply agreement. The tort is that in Lumley v Gye (1853) 2 E&B 216, as restated for the modern law of economic torts in OBG Ltd v Allan [2007] UKHL 21.\n" +
    "Ground 2 — Duty of care in respect of economic loss\n" +
    "2. The defendant also owed the claimant a duty of care. The applicable framework is the three-stage test in Caparo Industries plc v Dickman [1990] 2 AC 605. The broader two-stage approach in Anns v Merton London Borough Council [1978] AC 728 remains available to the court and supports the imposition of a duty here.\n" +
    "Ground 3 — Quantum\n" +
    "3. The claimant is entitled to the profits it would have earned on the contract, for which it relies on Anglia Television Ltd v Reed [1972] 1 QB 60 as authority for the recovery of lost future profits. Recoverability is bounded by Hadley v Baxendale (1854) 9 Ex 341. The claimant additionally seeks gain-based relief by reference to Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798, and exemplary damages within the categories identified in Rookes v Barnard [1964] AC 1129.\n" +
    "Ground 4 — Interim injunction\n" +
    "4. The claimant seeks interim relief on the test in American Cyanamid Co v Ethicon Ltd [1975] AC 396. The displacement of a long-term exclusive supplier constitutes irreparable harm, as held in Calderwood Shipping Ltd v Astra Bulk Carriers SA [2021] EWHC 1180 (Comm) and in Pemberton Aerospace Systems Ltd v Delta Global Ventures Inc [2023] EWHC 892 (TCC).\n" +
    "TABLE OF AUTHORITIES\n" +
    "•  Lumley v Gye (1853) 2 E&B 216\n" +
    "•  OBG Ltd v Allan [2007] UKHL 21\n" +
    "•  Caparo Industries plc v Dickman [1990] 2 AC 605\n" +
    "•  Anns v Merton London Borough Council [1978] AC 728\n" +
    "•  Anglia Television Ltd v Reed [1972] 1 QB 60\n" +
    "•  Hadley v Baxendale (1854) 9 Ex 341\n" +
    "•  Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798\n" +
    "•  Rookes v Barnard [1964] AC 1129\n" +
    "•  American Cyanamid Co v Ethicon Ltd [1975] AC 396\n" +
    "•  Calderwood Shipping Ltd v Astra Bulk Carriers SA [2021] EWHC 1180 (Comm)\n" +
    "•  Pemberton Aerospace Systems Ltd v Delta Global Ventures Inc [2023] EWHC 892 (TCC)";

  const defs: Array<{ idx: number; raw_text: string; verdict: AuthenticityVerdict }> = [
    { idx: 0, raw_text: "Lumley v Gye (1853) 2 E&B 216",                                              verdict: "VERIFIED"   },
    { idx: 1, raw_text: "OBG Ltd v Allan [2007] UKHL 21",                                             verdict: "VERIFIED"   },
    { idx: 2, raw_text: "Caparo Industries plc v Dickman [1990] 2 AC 605",                            verdict: "VERIFIED"   },
    { idx: 3, raw_text: "Anns v Merton London Borough Council [1978] AC 728",                         verdict: "MISAPPLIED" },
    { idx: 4, raw_text: "Anglia Television Ltd v Reed [1972] 1 QB 60",                                verdict: "MISAPPLIED" },
    { idx: 5, raw_text: "Hadley v Baxendale (1854) 9 Ex 341",                                        verdict: "VERIFIED"   },
    { idx: 6, raw_text: "Wrotham Park Estate Co Ltd v Parkside Homes Ltd [1974] 1 WLR 798",           verdict: "VERIFIED"   },
    { idx: 7, raw_text: "Rookes v Barnard [1964] AC 1129",                                           verdict: "VERIFIED"   },
    { idx: 8, raw_text: "American Cyanamid Co v Ethicon Ltd [1975] AC 396",                          verdict: "VERIFIED"   },
    { idx: 9, raw_text: "Calderwood Shipping Ltd v Astra Bulk Carriers SA [2021] EWHC 1180",         verdict: "FABRICATED" },
    { idx: 10, raw_text: "Pemberton Aerospace Systems Ltd v Delta Global Ventures Inc [2023] EWHC 892", verdict: "FABRICATED" },
  ];

  const citations = defs
    .map(({ idx, raw_text, verdict }) => {
      const char_pos = text.indexOf(raw_text);
      return char_pos === -1 ? null : { idx, raw_text, char_pos, verdict };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return { matter_id: DEMO.matter_id, text, char_count: text.length, citations };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return "Only PDF and TXT files are accepted.";
  if (file.size > MAX_FILE_BYTES) return "File too large — maximum 20 MB.";
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Index() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setScanning(true);
    try {
      const result = await verifyCitations(file);
      sessionStorage.setItem(`result-${result.matter_id}`, JSON.stringify(result));
      navigate({ to: "/results/$matterId", params: { matterId: result.matter_id } });
    } catch (e) {
      setScanning(false);
      if (e instanceof ApiError) {
        setError(
          e.status === 500
            ? "Something failed during the scan. No verdicts were produced."
            : e.message,
        );
      } else {
        setError("Something failed during the scan. No verdicts were produced.");
      }
    }
  }

  async function handlePaste() {
    const text = pasteText.trim();
    if (!text) { setError("Paste some text first."); return; }
    const file = new File([text], "document.txt", { type: "text/plain" });
    await handleFile(file);
  }

  function loadDemo(e: React.MouseEvent) {
    e.stopPropagation();
    const doc = buildDemoDocument();
    sessionStorage.setItem(`result-${DEMO.matter_id}`, JSON.stringify(DEMO));
    sessionStorage.setItem(`doc-${DEMO.matter_id}`, JSON.stringify(doc));
    navigate({ to: "/results/$matterId", params: { matterId: DEMO.matter_id } });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="mb-6 font-mono text-xs uppercase tracking-widest text-action">
          Legal-citation integrity checker
        </p>
        <Logo variant="wordmark" />

        <h1 className="mt-8 font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
          Because the AI invents.
          <br />
          <span className="bg-accent-lime px-1 text-ink">The corpus doesn&rsquo;t.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-n500">
          Upload a skeleton argument and TraceIt verifies every authority — does it exist,
          is it applied correctly, is it still good law — before you file.
        </p>

        {/* Mode toggle + demo */}
        <div className="mt-10 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-n300 p-0.5">
            <button type="button" onClick={() => setMode("upload")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${mode === "upload" ? "bg-ink text-paper" : "text-n500 hover:text-ink"}`}>
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" /> Upload file
            </button>
            <button type="button" onClick={() => setMode("paste")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${mode === "paste" ? "bg-ink text-paper" : "text-n500 hover:text-ink"}`}>
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Paste text
            </button>
          </div>

          {/* Demo button */}
          <div className="group relative ml-auto">
            <button type="button" onClick={loadDemo}
              className="flex items-center gap-1.5 rounded-full border border-n200 bg-paper px-2.5 py-1 text-n400 shadow-sm hover:border-n300 hover:text-ink transition-colors"
              aria-label="Load demo">
              <Star className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono text-[10px] tracking-wide">Demo</span>
            </button>
            <div className="pointer-events-none absolute right-0 top-8 z-20 w-52 rounded-xl border border-n200 bg-paper px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <p className="text-[12px] leading-[1.6] text-n600">
                Load a sample skeleton argument with 11 verified, misapplied, and fabricated citations.
              </p>
            </div>
          </div>
        </div>

        {/* Upload zone */}
        {mode === "upload" && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a skeleton argument"
            onClick={() => !scanning && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !scanning) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`mt-3 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
              dragOver ? "border-accent-lime bg-accent-lime/15" : "border-n300 bg-surface hover:border-ink-300"
            }`}
          >
            {scanning ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-ink" aria-hidden="true" />
                <p className="mt-4 font-display text-lg font-medium text-ink">
                  Scanning citations against the corpus&hellip;
                </p>
                <p className="mt-1 font-mono text-xs text-n500">Deterministic lookup in progress</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-ink-300" aria-hidden="true" />
                <p className="mt-4 font-display text-lg font-medium text-ink">Drop a skeleton argument here</p>
                <p className="mt-1 text-sm text-n500">
                  PDF or TXT · max 20 MB · or{" "}
                  <span className="font-semibold text-ink underline">browse</span>
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Paste zone */}
        {mode === "paste" && (
          <div className="mt-3 space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your skeleton argument or legal document here…"
              disabled={scanning}
              className="w-full rounded-2xl border border-n300 bg-surface px-5 py-4 text-[14px] leading-relaxed text-ink placeholder:text-n400 focus:border-ink focus:outline-none disabled:opacity-50"
              rows={10}
            />
            <button
              type="button"
              onClick={handlePaste}
              disabled={scanning || !pasteText.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {scanning ? (
                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Scanning…</>
              ) : (
                "Verify citations"
              )}
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-lg border border-bad-bd bg-bad-bg px-4 py-3 text-sm text-bad"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <p className="mt-8 flex items-start gap-2 text-sm text-n500">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
          <span>
            <span className="font-mono uppercase text-ink">Fabricated</span> verdicts come from
            deterministic corpus lookup —{" "}
            <span className="font-semibold text-ink">never from an LLM.</span>
          </span>
        </p>
      </div>
    </main>
  );
}
