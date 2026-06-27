import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, Loader2, X, FileText, BookOpen } from "lucide-react";
import type { PreviewPassage, PreviewResult } from "@/lib/types";
import { getPreview, ApiError } from "@/lib/api-client";

export interface PreviewRequest {
  nodeId: string;
  claim: string;
  label: string;
}

interface Props extends PreviewRequest {
  onBack: () => void;
}

// ─── Highlighted text ─────────────────────────────────────────────────────────

function HighlightedText({ text, start, end }: { text: string; start: number; end: number }) {
  const ok = start >= 0 && start < end && end <= text.length;
  if (!ok) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-action/25 px-0.5 font-semibold text-ink not-italic">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

// ─── Full judgment modal ───────────────────────────────────────────────────────

function FullTextModal({
  shortName,
  citation,
  text,
  onClose,
}: {
  shortName: string;
  citation: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-end bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-t-2xl bg-paper shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-n300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-n200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
              <p className="truncate font-display text-[13.5px] font-semibold text-ink">
                {shortName}
              </p>
            </div>
            <p className="mt-0.5 truncate font-mono text-[9.5px] text-n400">{citation}</p>
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

        {/* Scrollable full text */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-n700">{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Passage preview text (sorted by para_no, fades at bottom) ───────────────

function PassagePreview({ passages }: { passages: PreviewPassage[] }) {
  const sorted = [...passages].sort((a, b) => a.para_no - b.para_no);
  return (
    <>
      {sorted.map((p, i) => (
        <div key={i}>
          <p className="text-[13.5px] leading-[1.9] text-n700">
            <HighlightedText
              text={p.text}
              start={p.highlight_start}
              end={p.highlight_end}
            />
          </p>
          {i < sorted.length - 1 && (
            <p className="my-3 text-center font-mono text-[11px] text-n400">· · ·</p>
          )}
        </div>
      ))}
    </>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function CasePreviewPanel({ nodeId, claim, label, onBack }: Props) {
  const [preview, setPreview]           = useState<PreviewResult | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [fullText, setFullText]         = useState<string | null>(null);
  const [loadingFull, setLoadingFull]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    setFullText(null);
    getPreview(nodeId, claim)
      .then(r => { if (!cancelled) { setPreview(r); setLoading(false); } })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Error loading judgment.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [nodeId, claim]);

  async function handleReadFull() {
    if (!preview) return;
    setLoadingFull(true);
    try {
      const full = await getPreview(nodeId, claim, 3, true);
      setFullText(full.full_text ?? null);
    } catch {
      // passages still available
    } finally {
      setLoadingFull(false);
    }
  }

  const isFull = preview?.preview_mode === "full" && preview.passages.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface relative">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-n200 px-5 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-n500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back · {label}
        </button>

        {preview ? (
          <>
            <h2 className="font-display text-[14px] font-semibold leading-snug text-ink">
              {preview.short_name}
            </h2>
            <p className="mt-0.5 font-mono text-[9.5px] text-n400">{preview.citation}</p>
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
            </div>
          </>
        ) : (
          <p className="font-display text-[14px] font-semibold text-ink">{label}</p>
        )}
      </div>

      {/* ── Loading / error / not_found / proposition_only ── */}
      {!isFull && (
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2.5 py-6 text-n500">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              <span className="text-[13px]">Loading judgment…</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-bad-bd bg-bad-bg px-4 py-3">
              <p className="text-[13px] text-bad">{error}</p>
            </div>
          )}

          {preview?.preview_mode === "not_found" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-n200 bg-paper px-4 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
              <p className="text-[13px] text-n600">
                This judgment is not available in the preview corpus.
              </p>
            </div>
          )}

          {preview?.preview_mode === "proposition_only" && (
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-warn-bd bg-warn-bg px-4 py-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
                <p className="text-[12px] leading-[1.65] text-warn">
                  Only the summary is available — the original document is scanned and full text cannot be extracted.
                </p>
              </div>
              <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Summary</p>
                <p className="text-[13px] leading-[1.75] text-ink">{preview.proposition}</p>
              </div>
              {preview.bailii_url && (
                <a
                  href={preview.bailii_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-n100"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  View on BAILII
                </a>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Full mode: document preview + fade + sticky button ── */}
      {isFull && preview && (
        <>
          {/* Claim chip */}
          <div className="shrink-0 px-5 pt-4 pb-2">
            <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Claim</p>
              <p className="text-[12px] leading-[1.65] italic text-n600">"{preview.claim}"</p>
            </div>
          </div>

          {/* Scrollable text — overflows into the fade zone */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto px-5 pb-36 pt-3">
              <PassagePreview passages={preview.passages} />
            </div>

            {/* Gradient fade — covers bottom ~120px of text */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-36"
              style={{
                background: "linear-gradient(to bottom, transparent 0%, var(--color-surface, #f5f5f4) 70%)",
              }}
            />
          </div>

          {/* Sticky footer with button */}
          <div className="shrink-0 px-5 pb-5 pt-2">
            <button
              type="button"
              onClick={handleReadFull}
              disabled={loadingFull}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-paper transition-colors hover:bg-n700 disabled:opacity-60"
            >
              {loadingFull ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {loadingFull ? "Loading…" : "Read full judgment"}
            </button>
          </div>
        </>
      )}

      {/* ── Full text modal ── */}
      {fullText && preview && (
        <FullTextModal
          shortName={preview.short_name}
          citation={preview.citation}
          text={fullText}
          onClose={() => setFullText(null)}
        />
      )}
    </div>
  );
}
