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
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Full text — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-n700">{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Passage modal (bottom sheet) ────────────────────────────────────────────

function PassageModal({
  passage,
  shortName,
  citation,
  onClose,
}: {
  passage: PreviewPassage;
  shortName: string;
  citation: string;
  onClose: () => void;
}) {
  const pct = Math.round(passage.relevance_score * 100);

  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-ink/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-full overflow-hidden rounded-t-2xl bg-paper shadow-2xl"
        style={{ maxHeight: "82%" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-n300" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 border-b border-n200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
              <p className="truncate font-display text-[13.5px] font-semibold text-ink">
                {shortName}
              </p>
            </div>
            <p className="mt-0.5 truncate font-mono text-[9.5px] text-n400">{citation}</p>
          </div>

          {/* Confidence */}
          <div className="shrink-0 text-right">
            <p className={`font-mono text-[20px] font-bold leading-none ${
              pct >= 70 ? "text-good" : pct >= 45 ? "text-warn" : "text-n500"
            }`}>
              {pct}%
            </p>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-widest text-n400">
              relevance
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-n400 hover:bg-n100 hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Para label */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-1">
          <span className="font-mono text-[10px] text-n400">§ {passage.para_no}</span>
          <span className="h-px flex-1 bg-n200" />
          <span className="font-mono text-[9px] text-n400 capitalize">
            {passage.source.replace("_", " ")}
          </span>
        </div>

        {/* Text */}
        <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: "55vh" }}>
          <p className="text-[13.5px] leading-[1.85] text-n700">
            <HighlightedText
              text={passage.text}
              start={passage.highlight_start}
              end={passage.highlight_end}
            />
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Compact passage card ─────────────────────────────────────────────────────

function PassageCard({
  passage,
  onClick,
}: {
  passage: PreviewPassage;
  onClick: () => void;
}) {
  const pct = Math.round(passage.relevance_score * 100);

  const hasHighlight =
    passage.highlight_start >= 0 &&
    passage.highlight_start < passage.highlight_end &&
    passage.highlight_end <= passage.text.length;

  const snippetStart = hasHighlight ? Math.max(0, passage.highlight_start - 30) : 0;
  const snippetEnd   = hasHighlight
    ? Math.min(passage.text.length, passage.highlight_end + 80)
    : 130;
  const snippet = passage.text.slice(snippetStart, snippetEnd);

  const hlStart = hasHighlight ? Math.min(30, passage.highlight_start) : -1;
  const hlEnd   = hasHighlight ? hlStart + (passage.highlight_end - passage.highlight_start) : -1;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-n200 bg-paper text-left transition-all hover:border-n300 hover:shadow-sm"
    >
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-n200 px-4 py-2">
        <span className="font-mono text-[10.5px] text-n500">§ {passage.para_no}</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-n200">
            <div
              className={`h-full rounded-full ${
                pct >= 70 ? "bg-good" : pct >= 45 ? "bg-warn" : "bg-n400"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`font-mono text-[10px] font-semibold ${
            pct >= 70 ? "text-good" : pct >= 45 ? "text-warn" : "text-n500"
          }`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Snippet */}
      <div className="px-4 py-3">
        <p className="line-clamp-2 text-[12px] leading-[1.65] text-n600">
          {hlStart >= 0 ? (
            <HighlightedText text={snippet} start={hlStart} end={hlEnd} />
          ) : (
            snippet
          )}
          {snippetEnd < passage.text.length && <span className="text-n400"> …</span>}
        </p>
        <p className="mt-1.5 font-mono text-[9.5px] text-action group-hover:underline">
          Click para leer el pasaje completo
        </p>
      </div>
    </button>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function CasePreviewPanel({ nodeId, claim, label, onBack }: Props) {
  const [preview, setPreview]       = useState<PreviewResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [openPassage, setOpenPassage] = useState<PreviewPassage | null>(null);
  const [fullText, setFullText]     = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    setOpenPassage(null);
    setFullText(null);
    getPreview(nodeId, claim)
      .then(r => { if (!cancelled) { setPreview(r); setLoading(false); } })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Error cargando la sentencia.");
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
      // silently fail — the passage cards are still available
    } finally {
      setLoadingFull(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-n200 px-5 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-n500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Volver · {label}
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
              {preview.preview_mode === "full" && preview.passages.length > 0 && (
                <span className="ml-auto font-mono text-[9px] text-n400">
                  {preview.passages.length} pasaje{preview.passages.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="font-display text-[14px] font-semibold text-ink">{label}</p>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">

        {loading && (
          <div className="flex items-center gap-2.5 py-6 text-n500">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            <span className="text-[13px]">Cargando sentencia…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-bad-bd bg-bad-bg px-4 py-3">
            <p className="text-[13px] text-bad">{error}</p>
          </div>
        )}

        {/* not_found */}
        {preview?.preview_mode === "not_found" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-n200 bg-paper px-4 py-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
            <p className="text-[13px] text-n600">
              Esta sentencia no está disponible en el corpus de preview.
            </p>
          </div>
        )}

        {/* proposition_only */}
        {preview?.preview_mode === "proposition_only" && (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-warn-bd bg-warn-bg px-4 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
              <p className="text-[12px] leading-[1.65] text-warn">
                Solo disponemos del resumen — el documento original es escaneado y no se puede extraer el texto completo.
              </p>
            </div>
            <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Resumen</p>
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
                Ver en BAILII
              </a>
            )}
          </>
        )}

        {/* full mode */}
        {preview?.preview_mode === "full" && (
          <>
            {/* Claim used */}
            <div className="rounded-xl border border-n200 bg-paper px-4 py-3">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">Argumento</p>
              <p className="text-[12px] leading-[1.65] italic text-n600">"{preview.claim}"</p>
            </div>

            {/* Section label */}
            <p className="px-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-n400">
              Top {preview.passages.length} párrafo{preview.passages.length !== 1 ? "s" : ""} más relevantes · click para leer completo
            </p>

            {/* Passage cards */}
            {preview.passages.map((p, i) => (
              <PassageCard key={i} passage={p} onClick={() => setOpenPassage(p)} />
            ))}

            {/* Leer fallo completo */}
            <button
              type="button"
              onClick={handleReadFull}
              disabled={loadingFull}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-n100 disabled:opacity-60"
            >
              {loadingFull ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {loadingFull ? "Cargando…" : "Leer fallo completo"}
            </button>

            {preview.bailii_url && (
              <a
                href={preview.bailii_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-n100"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Ver en BAILII
              </a>
            )}
          </>
        )}
      </div>

      {/* ── Passage modal (sheet) ── */}
      {openPassage && preview && (
        <PassageModal
          passage={openPassage}
          shortName={preview.short_name}
          citation={preview.citation}
          onClose={() => setOpenPassage(null)}
        />
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
