import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Info,
  Lightbulb,
  X,
} from "lucide-react";
import type {
  AmendmentSuggestion,
  AuthenticityVerdict,
  CitationResult,
  DocumentCitation,
  DocumentView,
  VerifyResult,
} from "@/lib/types";
import { getDocument } from "@/lib/api-client";

// ─── Verdict palette ──────────────────────────────────────────────────────────

const V = {
  VERIFIED:   { sym: "✓", label: "Verified",   text: "text-good", bg: "bg-good-bg", border: "border-good-bd", pill: "bg-good-bg text-good",  dot: "bg-good" },
  MISAPPLIED: { sym: "▲", label: "Misapplied", text: "text-warn", bg: "bg-warn-bg", border: "border-warn-bd", pill: "bg-warn-bg text-warn",  dot: "bg-warn" },
  FABRICATED: { sym: "✕", label: "Fabricated", text: "text-bad",  bg: "bg-bad-bg",  border: "border-bad-bd",  pill: "bg-bad-bg text-bad",   dot: "bg-bad"  },
} as const;

// ─── Two-pass document parser ─────────────────────────────────────────────────
//
// Problem: PDF-extracted text has \n inside paragraphs (soft wraps) that look
// terrible when rendered verbatim. We need to:
//   1. Group lines into logical paragraphs (joining soft wraps)
//   2. Keep citations inline within their paragraph
//   3. Render each paragraph as a proper block element

interface DisplayItem {
  kind: "text" | "citation";
  text: string;
  citationIdx?: number;
  verdict?: AuthenticityVerdict;
}

interface DisplayPara {
  type: "header" | "numbered" | "bullet" | "body" | "gap" | "subheader";
  num?: string;
  items: DisplayItem[];
}

function buildRawSegments(doc: DocumentView) {
  const cits = [...doc.citations].sort((a, b) => a.char_pos - b.char_pos);
  const segs: Array<{ text: string; idx: number | null; verdict: AuthenticityVerdict | null }> = [];
  let pos = 0;
  for (const c of cits) {
    if (c.char_pos > pos) segs.push({ text: doc.text.slice(pos, c.char_pos), idx: null, verdict: null });
    const end = c.char_pos + c.raw_text.length;
    segs.push({ text: doc.text.slice(c.char_pos, end), idx: c.idx, verdict: c.verdict });
    pos = end;
  }
  if (pos < doc.text.length) segs.push({ text: doc.text.slice(pos), idx: null, verdict: null });
  return segs;
}

type RawSeg = { text: string; idx: number | null; verdict: AuthenticityVerdict | null };

// Second pass: find citation raw_text inside plain-text segments that weren't split by char_pos
// (e.g. a citation that appears again in a TABLE OF AUTHORITIES section)
function linkUnmarkedCitations(segs: RawSeg[], citations: DocumentCitation[]): RawSeg[] {
  const out: RawSeg[] = [];
  for (const seg of segs) {
    if (seg.idx !== null) { out.push(seg); continue; }

    // Build list of matches within this text segment
    const matches: Array<{ start: number; end: number; cit: DocumentCitation }> = [];
    for (const cit of citations) {
      let from = 0;
      while (true) {
        const pos = seg.text.indexOf(cit.raw_text, from);
        if (pos === -1) break;
        matches.push({ start: pos, end: pos + cit.raw_text.length, cit });
        from = pos + cit.raw_text.length;
      }
    }

    if (matches.length === 0) { out.push(seg); continue; }

    // Sort and de-overlap (first match wins)
    matches.sort((a, b) => a.start - b.start);
    const kept: typeof matches = [];
    let fence = 0;
    for (const m of matches) {
      if (m.start >= fence) { kept.push(m); fence = m.end; }
    }

    // Splice the text around the found citations
    let cursor = 0;
    for (const m of kept) {
      if (m.start > cursor) out.push({ text: seg.text.slice(cursor, m.start), idx: null, verdict: null });
      out.push({ text: m.cit.raw_text, idx: m.cit.idx, verdict: m.cit.verdict });
      cursor = m.end;
    }
    if (cursor < seg.text.length) out.push({ text: seg.text.slice(cursor), idx: null, verdict: null });
  }
  return out;
}

function appendText(para: DisplayPara, text: string) {
  const last = para.items[para.items.length - 1];
  if (last && last.kind === "text") {
    last.text += text;
  } else if (text) {
    para.items.push({ kind: "text", text });
  }
}

function classifyLine(line: string): "header" | "numbered" | "bullet" | "body" | "empty" {
  const t = line.trim();
  if (!t) return "empty";
  if (/^\d{1,2}\.\s/.test(t)) return "numbered";
  if (t.startsWith("•") || t.startsWith("- ") || /^•/.test(t)) return "bullet";
  // ALL-CAPS headers (exclude lines with 4-digit years which are likely citations)
  if (
    t.length > 4 &&
    t === t.toUpperCase() &&
    !/\[\d{4}\]|\(\d{4}\)/.test(t) &&
    !/\d{4}/.test(t)
  ) return "header";
  return "body";
}

function buildDisplayParas(doc: DocumentView): DisplayPara[] {
  const segs = linkUnmarkedCitations(buildRawSegments(doc), doc.citations);
  const paras: DisplayPara[] = [];
  let current: DisplayPara | null = null;

  const flush = () => {
    if (current && current.items.length > 0) {
      paras.push(current);
      current = null;
    }
  };

  const ensureBody = () => {
    if (!current) current = { type: "body", items: [] };
  };

  for (const seg of segs) {
    // Citation segment → always inline into the current paragraph
    if (seg.idx !== null && seg.verdict !== null) {
      ensureBody();
      // Normalise any soft-wrap \n inside the citation display text
      const displayText = seg.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      current!.items.push({ kind: "citation", text: displayText, citationIdx: seg.idx, verdict: seg.verdict });
      continue;
    }

    // Text segment: split by \n, classify, join soft wraps
    const lines = seg.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();
      const isFirst = i === 0;
      const isLast = i === lines.length - 1;
      const kind = classifyLine(line);

      // Skip leading/trailing empty strings — they're soft-wrap artefacts adjacent to citations
      if (!t && (isFirst || isLast)) continue;

      if (kind === "empty") {
        // Real blank line in the middle of text → paragraph gap
        flush();
        paras.push({ type: "gap", items: [] });
        continue;
      }

      if (kind === "header") {
        flush();
        paras.push({ type: "header", items: [{ kind: "text", text: t }] });
        continue;
      }

      if (kind === "numbered") {
        flush();
        const m = t.match(/^(\d{1,2})\.\s+(.*)$/s);
        current = { type: "numbered", num: m?.[1] ?? "", items: [] };
        if (m?.[2]) appendText(current, m[2]);
        if (!isLast) appendText(current, " ");
        continue;
      }

      if (kind === "bullet") {
        flush();
        current = { type: "bullet", items: [] };
        appendText(current, t.replace(/^[•\-]\s*/, ""));
        if (!isLast) appendText(current, " ");
        continue;
      }

      // body / soft-wrap continuation: join with space
      ensureBody();
      appendText(current!, t + (isLast ? "" : " "));
    }
  }

  flush();
  return paras;
}

// ─── Render a single display paragraph ───────────────────────────────────────

function ParaItems({
  items, selectedIdx, onSelect,
}: { items: DisplayItem[]; selectedIdx: number | null; onSelect: (i: number) => void }) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === "citation" && item.citationIdx != null && item.verdict) {
          const v = V[item.verdict] ?? V["VERIFIED"];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(item.citationIdx!)}
              className={`inline cursor-pointer rounded border-b-2 px-0.5 font-medium
                transition-all duration-100 ${v.text}
                ${selectedIdx === item.citationIdx
                  ? `${v.bg} shadow-sm`
                  : "border-current/40 hover:bg-black/[0.05]"}`}
            >
              {item.text}
            </button>
          );
        }
        return <span key={i}>{item.text}</span>;
      })}
    </>
  );
}

function DocParagraph({
  para, selectedIdx, onSelect,
}: { para: DisplayPara; selectedIdx: number | null; onSelect: (i: number) => void }) {
  if (para.type === "gap") return <div className="h-3" />;

  if (para.type === "header") {
    return (
      <p className="mb-1 mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-n400 first:mt-0">
        {para.items[0]?.text ?? ""}
      </p>
    );
  }

  if (para.type === "numbered") {
    return (
      <div
        className="mt-4 grid items-baseline first:mt-0"
        style={{ gridTemplateColumns: "2rem 1fr", gap: "0 0.5rem" }}
      >
        <span className="pt-px text-right font-mono text-[11px] font-medium text-n400">
          {para.num}.
        </span>
        <p className="text-[14px] leading-[1.85] text-ink">
          <ParaItems items={para.items} selectedIdx={selectedIdx} onSelect={onSelect} />
        </p>
      </div>
    );
  }

  if (para.type === "bullet") {
    return (
      <div
        className="mt-2 grid items-baseline first:mt-0"
        style={{ gridTemplateColumns: "1.25rem 1fr", gap: "0 0.25rem" }}
      >
        <span className="pt-px text-center text-n400">·</span>
        <p className="text-[14px] leading-[1.75] text-ink">
          <ParaItems items={para.items} selectedIdx={selectedIdx} onSelect={onSelect} />
        </p>
      </div>
    );
  }

  // body
  return (
    <p className="mt-3 text-[14px] leading-[1.85] text-ink first:mt-0">
      <ParaItems items={para.items} selectedIdx={selectedIdx} onSelect={onSelect} />
    </p>
  );
}

// ─── Left panel: formatted document view ─────────────────────────────────────

function FormattedDocument({
  doc, selectedIdx, onSelect,
}: { doc: DocumentView; selectedIdx: number | null; onSelect: (i: number) => void }) {
  const paras = buildDisplayParas(doc);

  return (
    <div className="h-full overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[680px] min-h-full px-10 pb-16 pt-8">
        {/* Compact legend */}
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-n200 pb-5">
          <div className="flex flex-wrap gap-2">
            {(["VERIFIED", "MISAPPLIED", "FABRICATED"] as AuthenticityVerdict[]).map((v) => (
              <span
                key={v}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${V[v].pill}`}
              >
                {V[v].sym} {V[v].label}
              </span>
            ))}
          </div>
          <DocHint />
        </div>

        {/* Document body */}
        <div>
          {paras.map((para, i) => (
            <DocParagraph
              key={i}
              para={para}
              selectedIdx={selectedIdx}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Left panel: citation list fallback (same visual style as FormattedDocument) ─

function CitationList({
  results, selectedIdx, onSelect,
}: { results: CitationResult[]; selectedIdx: number | null; onSelect: (i: number) => void }) {
  return (
    <div className="h-full overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[680px] min-h-full px-10 pb-16 pt-8">
        {/* Same legend as FormattedDocument */}
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-n200 pb-5">
          <div className="flex flex-wrap gap-2">
            {(["VERIFIED", "MISAPPLIED", "FABRICATED"] as AuthenticityVerdict[]).map((v) => (
              <span key={v} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${V[v].pill}`}>
                {V[v].sym} {V[v].label}
              </span>
            ))}
          </div>
          <DocHint />
        </div>

        {/* Authorities as inline document-style list */}
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-n400">Table of Authorities</p>
        <div className="space-y-2">
          {results.map((r, i) => {
            const v = V[r.layer1?.verdict as AuthenticityVerdict] ?? V["VERIFIED"];
            const sel = selectedIdx === i;
            const snippet = r.holding_analysis?.brief_pointer?.sentence ?? r.document_context;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-150
                  ${sel ? `${v.border} ${v.bg}` : "border-n200 hover:border-n300 hover:bg-n100/60"}`}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className={`shrink-0 font-mono text-[11px] font-bold ${v.text}`}>{v.sym}</span>
                  <p className="text-[14px] font-medium leading-snug text-ink">{r.raw_text}</p>
                </div>
                {snippet && (
                  <p className="mt-1.5 pl-[22px] text-[12.5px] leading-[1.6] text-n500 line-clamp-2">
                    {snippet}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section for right panel ─────────────────────────────────────

function Accordion({
  label, preview, children, defaultOpen = false, className, ghost = false, skipIfShort = false,
}: {
  label: string;
  preview?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  ghost?: boolean;
  skipIfShort?: boolean;
}) {
  const isShort = skipIfShort && !!preview && preview.length <= 200;
  const [open, setOpen] = useState(defaultOpen || isShort);

  const outerCls = ghost
    ? "border-transparent bg-transparent"
    : (className ?? "border-n200 bg-paper");

  // Short content: render as plain card, no toggle
  if (isShort) {
    return (
      <div className={`rounded-xl border overflow-hidden ${className ?? "border-n200 bg-paper"}`}>
        <div className="px-4 py-3">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">{label}</p>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${outerCls}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-n100/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400">{label}</p>
          {!open && preview && (
            <p className="mt-0.5 text-[12px] leading-[1.5] text-n500 line-clamp-2 [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]">
              {preview}
            </p>
          )}
        </div>
        <ChevronDown
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-n400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ─── Gutter ───────────────────────────────────────────────────────────────────

function Gutter({ scanning }: { scanning: boolean }) {
  return (
    <div className="relative w-px shrink-0 bg-n200/40">
      <AnimatePresence>
        {scanning && (
          <motion.div
            key="dot"
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-action"
            style={{ top: "6%", boxShadow: "0 0 10px 3px rgba(198,240,53,.65)" }}
            animate={{ top: "94%", opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeIn" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Right panel ──────────────────────────────────────────────────────────────

function RightPanel({
  results, idx, onClose, onNav,
}: {
  results: CitationResult[];
  idx: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const citation = results[idx];
  if (!citation) return null;

  const cs = citation.corpus_source;
  const ha = citation.holding_analysis;
  const v  = V[citation.layer1?.verdict as AuthenticityVerdict] ?? V["VERIFIED"];
  const l2 = citation.layer2;

  const citedFor   = citation.layer1.proposition_cited;
  const actualProp = citation.layer1.proposition_actual;

  const showAmendments =
    citation.layer1.verdict === "MISAPPLIED" ||
    l2.verdict === "OVERRULED";

  // Use brief_pointer.sentence as the submission snippet — it's the exact sentence, not a blob
  const submissionSentence = ha?.brief_pointer?.sentence ?? null;
  const paraHint = ha?.brief_pointer?.paragraph_hint ?? null;

  const l2Color =
    l2.verdict === "GOOD_LAW"      ? "text-good" :
    l2.verdict === "OVERRULED"     ? "text-bad"  :
    l2.verdict === "DISTINGUISHED" ? "text-warn" : "text-n500";

  // Holding excerpts that are marked as holdings
  const holdingExcerpts = ha?.judgment_pointers?.filter(p => p.is_holding) ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-n200 px-5 py-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
              Citation {idx + 1} of {results.length}
            </p>
            <h2 className="mt-1 font-display text-[14px] font-semibold leading-snug text-ink">
              {citation.raw_text}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-n400 hover:bg-n100 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Verdict + court + status */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${v.pill}`}>
            {v.sym} {v.label}
          </span>
          {cs && (
            <span className="font-mono text-[10.5px] text-n500">
              {cs.court}{cs.domain ? ` · ${cs.domain}` : ""}
              {cs.status && cs.status !== "GOOD_LAW" && (
                <span className="ml-1.5 font-semibold text-bad"> · {cs.status.replace(/_/g, " ")}</span>
              )}
            </span>
          )}
          {cs?.bailii_url && (
            <a href={cs.bailii_url} target="_blank" rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-action hover:underline">
              BAILII <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* Prev / next / reviewed */}
        <div className="mt-3 flex gap-1">
          <button type="button" disabled={idx === 0} onClick={() => onNav(idx - 1)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-n500
              hover:bg-n100 hover:text-ink disabled:pointer-events-none disabled:opacity-30">
            <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Prev
          </button>
          <button type="button" disabled={idx === results.length - 1} onClick={() => onNav(idx + 1)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-n500
              hover:bg-n100 hover:text-ink disabled:pointer-events-none disabled:opacity-30">
            Next <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

        {/* 1. Finding — most important, always first (open by default) */}
        {citation.layer1.explanation && (
          <Accordion
            label="Finding"
            preview={citation.layer1.explanation}
            defaultOpen={true}
            skipIfShort={true}
            className={`${v.border} ${v.bg}`}
          >
            <p className="text-[13.5px] leading-[1.75] text-ink">{citation.layer1.explanation}</p>
          </Accordion>
        )}

        {/* 2. Exact sentence from submission where this citation appears */}
        {submissionSentence && (
          <Accordion
            label={paraHint ? `In the submission · ${paraHint}` : "In the submission"}
            preview={submissionSentence}
            defaultOpen={false}
            skipIfShort={true}
          >
            <p className="border-l-2 border-n300 pl-3 text-[13px] leading-[1.7] text-n600">
              "{submissionSentence}"
            </p>
          </Accordion>
        )}

        {/* 3. Cited for vs what it actually establishes (MISAPPLIED only) */}
        {(citedFor || actualProp) && (
          <div className="space-y-2">
            {citedFor && (
              <div className="rounded-xl border border-n200 bg-paper p-4">
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Cited for</p>
                <p className="text-[13px] leading-[1.7] text-ink">{citedFor}</p>
              </div>
            )}
            {actualProp && (
              <div className="rounded-xl border border-good-bd bg-good-bg p-4">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n500">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  What the authority establishes
                </p>
                <p className="border-l-2 border-good/30 pl-3 text-[13px] leading-[1.75] text-ink">
                  "…{actualProp}…"
                </p>
              </div>
            )}
          </div>
        )}

        {/* 5. Remediation — suggested replacement citations (MISAPPLIED / FABRICATED) */}
        {showAmendments && ha?.amendments && ha.amendments.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-action shrink-0" aria-hidden="true" />
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
                {l2.verdict === "OVERRULED" ? "Good law alternatives" : "Suggested remediation"}
              </p>
            </div>
            {l2.verdict === "OVERRULED" && (
              <p className="mb-2 text-[11.5px] text-n500">
                These authorities support the same proposition and remain good law.
              </p>
            )}
            <div className="space-y-2">
              {ha.amendments.map((a: AmendmentSuggestion, i: number) => (
                <div key={i} className="rounded-xl border border-n200 bg-paper px-4 py-3 space-y-1.5">
                  <p className="text-[13px] font-semibold text-ink">{a.citation}</p>
                  {a.proposition && (
                    <p className="text-[12.5px] leading-[1.65] text-n600">{a.proposition}</p>
                  )}
                  {a.rationale && (
                    <p className="text-[11.5px] text-n500 italic">{a.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Analysis — collapsible, verbose */}
        {ha?.verdict_reasoning && ha.verdict_reasoning !== citation.layer1.explanation && (
          <Accordion label="Analysis" preview={ha.verdict_reasoning} defaultOpen={false}>
            <p className="text-[13px] leading-[1.75] text-n700">{ha.verdict_reasoning}</p>
          </Accordion>
        )}

        {/* 7. Case summary — collapsible */}
        {ha?.case_summary && (
          <Accordion label="Case summary" preview={ha.case_summary} defaultOpen={false} skipIfShort={true}>
            <p className="text-[13px] leading-[1.7] text-n700">{ha.case_summary}</p>
            {!ha.holding_found && (
              <p className="mt-2 font-mono text-[10px] text-n400">
                ⚠ Full judgment text unavailable — based on corpus metadata
              </p>
            )}
          </Accordion>
        )}

        {/* 8. Holding excerpts — collapsible */}
        {holdingExcerpts.length > 0 && (
          <Accordion label="From the judgment" preview={holdingExcerpts[0]?.excerpt} defaultOpen={false}>
            <div className="space-y-2">
              {holdingExcerpts.map((p, i) => (
                <div key={i}>
                  <p className="font-mono text-[9px] text-n400 mb-1">§{p.para_no}</p>
                  <p className="border-l-2 border-n300 pl-3 text-[13px] leading-[1.7] text-n600 italic">
                    "{p.excerpt}"
                  </p>
                </div>
              ))}
            </div>
          </Accordion>
        )}

        {/* 9. Precedent treatment */}
        {l2.verdict !== "NOT_CHECKED" && l2.verdict !== "UNAVAILABLE" && (
          <div className="rounded-xl border border-n200 bg-paper px-4 py-3 space-y-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400 mb-2">Precedent treatment</p>
            <p className={`text-[13px] font-bold tracking-wide ${l2Color}`}>{l2.verdict.replace(/_/g, " ")}</p>
            {l2.overruled_by?.map((ref, i) => (
              <div key={i} className="rounded-lg bg-bad-bg border border-bad-bd px-3 py-2">
                <p className="text-[12px] font-semibold text-bad">Overruled by</p>
                <p className="text-[12px] text-ink">{ref.citing_case} ({ref.year})</p>
                {ref.context && <p className="mt-0.5 text-[11.5px] text-n600">{ref.context}</p>}
              </div>
            ))}
            {l2.distinguished_by?.map((ref, i) => (
              <div key={i} className="rounded-lg bg-warn-bg border border-warn-bd px-3 py-2">
                <p className="text-[12px] font-semibold text-warn">Distinguished in</p>
                <p className="text-[12px] text-ink">{ref.citing_case} ({ref.year})</p>
                {ref.context && <p className="mt-0.5 text-[11.5px] text-n600">{ref.context}</p>}
              </div>
            ))}
          </div>
        )}

        {/* 10. Statutory provision */}
        {citation.statutory && (
          <div className="rounded-xl border border-n200 bg-paper px-4 py-3 space-y-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400 mb-1">Statutory provision</p>
            <p className="text-[13px] font-semibold text-ink">
              {citation.statutory.act} {citation.statutory.year}, s.{citation.statutory.section}
            </p>
            {citation.statutory.exists === false && (
              <p className="text-[12px] font-semibold text-bad">⚠ Not found on legislation.gov.uk</p>
            )}
            {citation.statutory.exists === null && (
              <p className="text-[12px] text-n600">Lookup timed out — not the same as verified.</p>
            )}
            {citation.statutory.excerpt && (
              <p className="border-l-2 border-n300 pl-3 text-[13px] leading-[1.7] text-n600 italic">
                {citation.statutory.excerpt}
              </p>
            )}
            <a href={citation.statutory.source_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10.5px] text-action hover:underline">
              legislation.gov.uk <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        )}

        {/* 11. Provenance — ghost, no card */}
        <Accordion
          label={`Provenance · ${Math.round(citation.layer1.confidence * 100)}% confidence`}
          defaultOpen={false}
          ghost={true}
        >
          <div className="space-y-1 pt-1">
            {ha?.agent_model && (
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-n500">
                <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                {ha.agent_model}
              </p>
            )}
            {ha?.analysis_mode && ha.analysis_mode !== "none" && (
              <p className="font-mono text-[10.5px] text-n500">
                Mode: <span className={ha.analysis_mode === "degraded" ? "text-warn" : "text-good"}>{ha.analysis_mode}</span>
              </p>
            )}
          </div>
        </Accordion>

      </div>
    </div>
  );
}

// ─── Summary panel (shown by default, no citation selected) ──────────────────

function SummaryPanel({ result, onSelect }: { result: VerifyResult; onSelect: (i: number) => void }) {
  const fabricated = result.results.map((r, i) => ({ r, i })).filter(({ r }) => r.layer1.verdict === "FABRICATED");
  const misapplied = result.results.map((r, i) => ({ r, i })).filter(({ r }) => r.layer1.verdict === "MISAPPLIED");
  const verified   = result.results.map((r, i) => ({ r, i })).filter(({ r }) => r.layer1.verdict === "VERIFIED");
  const total = result.total_citations;

  const pctV = (verified.length   / total) * 100;
  const pctM = (misapplied.length / total) * 100;
  const pctF = (fabricated.length / total) * 100;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">

      {/* Header */}
      <div className="shrink-0 border-b border-n200 px-5 py-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Citation health</p>
        <p className="mt-1 font-display text-[20px] font-semibold leading-snug text-ink">
          {total} authorities checked
        </p>

        {/* Proportional bar */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-n100">
          <div className="bg-good transition-all" style={{ width: `${pctV}%` }} />
          <div className="bg-warn transition-all" style={{ width: `${pctM}%` }} />
          <div className="bg-bad  transition-all" style={{ width: `${pctF}%` }} />
        </div>
        <div className="mt-2 flex gap-4">
          <span className="font-mono text-[11px] font-bold text-good">{verified.length} verified</span>
          {misapplied.length > 0 && <span className="font-mono text-[11px] font-bold text-warn">{misapplied.length} misapplied</span>}
          {fabricated.length > 0 && <span className="font-mono text-[11px] font-bold text-bad">{fabricated.length} fabricated</span>}
        </div>
      </div>

      {/* Body — critical first */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {fabricated.length > 0 && (
          <section>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
              Non-existent · do not file
            </p>
            <div className="space-y-1.5">
              {fabricated.map(({ r, i }) => (
                <button key={i} type="button" onClick={() => onSelect(i)}
                  className="w-full rounded-xl border border-bad-bd bg-bad-bg px-4 py-3 text-left transition-opacity hover:opacity-80">
                  <p className="font-mono text-[10px] font-bold text-bad">✕ Fabricated</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink">{r.raw_text}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.5] text-n600">{r.layer1.explanation}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {misapplied.length > 0 && (
          <section>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
              Misapplied · review before filing
            </p>
            <div className="space-y-1.5">
              {misapplied.map(({ r, i }) => (
                <button key={i} type="button" onClick={() => onSelect(i)}
                  className="w-full rounded-xl border border-warn-bd bg-warn-bg px-4 py-3 text-left transition-opacity hover:opacity-80">
                  <p className="font-mono text-[10px] font-bold text-warn">▲ Misapplied</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink">{r.raw_text}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.5] text-n600">{r.layer1.explanation}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
            Verified · correctly cited
          </p>
          <div className="space-y-1.5">
            {verified.map(({ r, i }) => (
              <button key={i} type="button" onClick={() => onSelect(i)}
                className="w-full rounded-xl border border-n200 bg-paper px-4 py-3 text-left hover:bg-n100/60 transition-colors">
                <p className="font-mono text-[10px] font-bold text-good">✓ Verified</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">{r.raw_text}</p>
              </button>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

// ─── Report export ────────────────────────────────────────────────────────────

function downloadReport(result: VerifyResult) {
  const fabricated = result.results.filter(r => r.layer1.verdict === "FABRICATED");
  const misapplied = result.results.filter(r => r.layer1.verdict === "MISAPPLIED");
  const verified   = result.results.filter(r => r.layer1.verdict === "VERIFIED");

  const lines: string[] = [
    "TraceIT — Citation Integrity Report",
    "=".repeat(52),
    `Matter:    ${result.matter_id}`,
    `Audit:     sha256:${result.audit_trail_hash ?? ""}`,
    `Processed: ${result.processing_ms} ms`,
    "",
    "SUMMARY",
    "-".repeat(30),
    `Total citations checked : ${result.total_citations}`,
    `  Verified              : ${verified.length}`,
    `  Misapplied            : ${misapplied.length}`,
    `  Fabricated            : ${fabricated.length}`,
    "",
  ];

  if (fabricated.length > 0) {
    lines.push("NON-EXISTENT CITATIONS (FABRICATED)");
    lines.push("-".repeat(40));
    for (const r of fabricated) {
      lines.push(`[✕] ${r.raw_text}`);
      lines.push(`    ${r.layer1.explanation}`);
      lines.push("");
    }
  }

  if (misapplied.length > 0) {
    lines.push("MISAPPLIED CITATIONS");
    lines.push("-".repeat(40));
    for (const r of misapplied) {
      lines.push(`[▲] ${r.raw_text}`);
      lines.push(`    ${r.layer1.explanation}`);
      if (r.layer1.proposition_cited)  lines.push(`    Cited for          : ${r.layer1.proposition_cited}`);
      if (r.layer1.proposition_actual) lines.push(`    Actually decides   : ${r.layer1.proposition_actual}`);
      if (r.holding_analysis?.amendments?.length) {
        lines.push(`    Suggested instead  :`);
        for (const a of r.holding_analysis.amendments) {
          lines.push(`      • ${a.citation}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("VERIFIED CITATIONS");
  lines.push("-".repeat(40));
  for (const r of verified) {
    lines.push(`[✓] ${r.raw_text}`);
    lines.push(`    ${r.layer1.explanation}`);
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `traceit-${result.matter_id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ result, copied, onCopy, onDownload }: {
  result: VerifyResult;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const n_fabricated = result.results.filter(r => r.layer1.verdict === "FABRICATED").length;
  const n_misapplied = result.results.filter(r => r.layer1.verdict === "MISAPPLIED").length;
  const n_verified   = result.results.filter(r => r.layer1.verdict === "VERIFIED").length;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] bg-ink px-4 py-2.5">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper hover:text-action">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        New document
      </Link>
      <span className="text-white/10">|</span>
      <span className="font-mono text-[11px] text-n500">{result.total_citations} citations</span>
      {n_fabricated > 0 && <span className="font-mono text-[11px] font-bold text-bad">{n_fabricated} fabricated</span>}
      {n_misapplied > 0 && <span className="font-mono text-[11px] font-bold text-warn">{n_misapplied} misapplied</span>}
      {n_verified > 0 && <span className="font-mono text-[11px] text-good">{n_verified} verified</span>}
      <span className="ml-auto font-mono text-[11px] text-n500">{result.processing_ms} ms</span>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-n500 hover:text-paper"
        title="Download report"
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        Export
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-n500 hover:text-paper"
        title={result.audit_trail_hash ?? ""}
      >
        {copied ? <Check className="h-3 w-3 text-good" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
        sha256 {(result.audit_trail_hash ?? "").slice(0, 12)}…
      </button>
    </div>
  );
}

// ─── Floating hint ────────────────────────────────────────────────────────────

function DocHint() {
  return (
    <div className="group relative ml-auto shrink-0">
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-n200 bg-paper text-n400 hover:border-n300 hover:text-n600 transition-colors"
        aria-label="How to use"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <div className="pointer-events-none absolute right-0 top-8 z-20 w-60 rounded-xl border border-n200 bg-paper px-3.5 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <p className="text-[12px] leading-[1.6] text-n600">
          Click any underlined citation in the text to see its verification analysis.
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function VerificationSplitView({
  result, matterId,
}: { result: VerifyResult; matterId: string }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDocument(matterId).then(setDoc).catch(() => {});
  }, [matterId]);

  const select = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setScanning(true);
    setTimeout(() => setScanning(false), 750);
  }, []);

  const close = useCallback(() => setSelectedIdx(null), []);

  function copyHash() {
    navigator.clipboard?.writeText(result.audit_trail_hash ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar result={result} copied={copied} onCopy={copyHash} onDownload={() => downloadReport(result)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: document */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {doc
            ? <FormattedDocument doc={doc} selectedIdx={selectedIdx} onSelect={select} />
            : <CitationList results={result.results} selectedIdx={selectedIdx} onSelect={select} />
          }
        </div>

        {/* Right: always visible — summary by default, detail on selection */}
        <motion.div
          className="flex shrink-0 overflow-hidden"
          initial={{ flexBasis: 0, opacity: 0 }}
          animate={{ flexBasis: "42%", opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Gutter scanning={scanning} />
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {selectedIdx !== null ? (
                <motion.div
                  key={`detail-${selectedIdx}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="h-full"
                >
                  <RightPanel
                    results={result.results}
                    idx={selectedIdx}
                    onClose={close}
                    onNav={select}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="summary"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="h-full"
                >
                  <SummaryPanel result={result} onSelect={select} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
