import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import type { PreviewResult } from "@/lib/types";
import { getPreview, ApiError } from "@/lib/api-client";

export interface PreviewRequest {
  nodeId: string;
  claim: string;
  label: string; // citation raw_text or short_name for the back button
}

interface Props extends PreviewRequest {
  onBack: () => void;
}

// ─── Highlighted passage text ────────────────────────────────────────────────

function HighlightedText({
  text, start, end,
}: { text: string; start: number; end: number }) {
  const hasHighlight = start < end && end <= text.length && start >= 0;
  if (!hasHighlight) return <span>{text}</span>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-action/20 px-0.5 font-medium text-ink not-italic">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function CasePreviewPanel({ nodeId, claim, label, onBack }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    getPreview(nodeId, claim)
      .then(r => {
        if (!cancelled) { setPreview(r); setLoading(false); }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Error loading preview.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [nodeId, claim]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-n200 px-5 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-n500 hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to {label}
        </button>

        {preview ? (
          <>
            <h2 className="font-display text-[14px] font-semibold leading-snug text-ink">
              {preview.short_name}
            </h2>
            <p className="mt-0.5 font-mono text-[10px] text-n400">{preview.citation}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className={`font-mono text-[10px] font-bold ${
                preview.status === "GOOD_LAW"  ? "text-good" :
                preview.status === "OVERRULED" ? "text-bad"  : "text-warn"
              }`}>
                {preview.status.replace(/_/g, " ")}
              </span>
              {preview.bailii_url && (
                <a
                  href={preview.bailii_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-action hover:underline"
                >
                  BAILII <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              )}
              <span className="ml-auto font-mono text-[9px] text-n400">
                {preview.preview_mode === "full"
                  ? `${preview.passages.length} passage${preview.passages.length !== 1 ? "s" : ""}`
                  : "summary only"}
              </span>
            </div>
          </>
        ) : (
          <p className="font-display text-[14px] font-semibold text-ink">{label}</p>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2.5 py-4 text-n500">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            <span className="text-[13px]">Loading judgment passages…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-bad-bd bg-bad-bg px-4 py-3">
            <p className="text-[13px] text-bad">{error}</p>
          </div>
        )}

        {/* Proposition-only mode */}
        {preview?.preview_mode === "proposition_only" && (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-warn-bd bg-warn-bg px-4 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
              <p className="text-[12px] leading-[1.65] text-warn">
                Only the case summary is available — the original PDF is scanned and full-text extraction is unavailable.
              </p>
            </div>

            <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Proposition</p>
              <p className="text-[13px] leading-[1.75] text-ink">{preview.proposition}</p>
            </div>

            {preview.bailii_url && (
              <a
                href={preview.bailii_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-n100 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Read on BAILII
              </a>
            )}
          </>
        )}

        {/* Full mode */}
        {preview?.preview_mode === "full" && (
          <>
            {/* Claim context */}
            <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Claim</p>
              <p className="text-[12px] leading-[1.65] text-n600 italic">"{preview.claim}"</p>
            </div>

            {/* Passages */}
            {preview.passages.map((p, i) => {
              const pct = Math.round(p.relevance_score * 100);
              return (
                <div key={i} className="overflow-hidden rounded-xl border border-n200 bg-paper">
                  {/* Passage meta bar */}
                  <div className="flex items-center justify-between border-b border-n200 px-4 py-2">
                    <span className="font-mono text-[10px] text-n500">§ {p.para_no}</span>
                    <div className="flex items-center gap-2">
                      {/* Relevance bar */}
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-n200">
                        <div
                          className="h-full rounded-full bg-action transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[9.5px] text-n500">{pct}%</span>
                    </div>
                  </div>

                  {/* Passage text */}
                  <div className="max-h-56 overflow-y-auto px-4 py-3">
                    <p className="text-[12.5px] leading-[1.8] text-n700">
                      <HighlightedText
                        text={p.text}
                        start={p.highlight_start}
                        end={p.highlight_end}
                      />
                    </p>
                  </div>
                </div>
              );
            })}

            {/* BAILII link at bottom */}
            {preview.bailii_url && (
              <a
                href={preview.bailii_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-n100 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Read full judgment on BAILII
              </a>
            )}
          </>
        )}

      </div>
    </div>
  );
}
