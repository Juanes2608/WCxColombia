import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import type { PreviewPassage, PreviewResult } from "@/lib/types";
import { API_BASE, ApiError, getPreview } from "@/lib/api-client";

export interface PreviewRequest {
  nodeId: string;
  claim: string;
  label: string;
}

interface Props extends PreviewRequest {
  onBack: () => void;
}

// Renders a passage with the relevant span highlighted (defends against
// out-of-range offsets the backend can occasionally send).
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

// The relevant judgment passages (sorted by paragraph), shown when the source
// PDF isn't on the server. The text comes from the corpus DB, so it works in the
// deploy even though the PDF files do not ship with the backend.
function PassagePreview({ passages }: { passages: PreviewPassage[] }) {
  const sorted = [...passages].sort((a, b) => a.para_no - b.para_no);
  return (
    <>
      {sorted.map((p, i) => (
        <div key={i}>
          <p className="text-[13.5px] leading-[1.9] text-n700">
            <HighlightedText text={p.text} start={p.highlight_start} end={p.highlight_end} />
          </p>
          {i < sorted.length - 1 && (
            <p className="my-3 text-center font-mono text-[11px] text-n400">· · ·</p>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Slides in over the right detail panel to let counsel read the source judgment
 * before adopting an amendment. Three modes: an embedded PDF ("full"), a
 * proposition-only summary, or a not-found notice. The PDF is fetched as a blob
 * so the browser renders it inline instead of forcing a download (the backend
 * sends Content-Disposition: attachment).
 */
export function CasePreviewPanel({ nodeId, claim, label, onBack }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const blobRef = useRef<string | null>(null);

  // Load the preview metadata for this authority.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    getPreview(nodeId, claim)
      .then((r) => {
        if (!cancelled) {
          setPreview(r);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Could not load the judgment.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, claim]);

  // Fetch the PDF as a blob so the browser renders it inline. The backend can
  // report preview_mode "full" yet still 404 the actual PDF (corpus gap); guard
  // against blobbing that JSON error and rendering it as if it were the document.
  useEffect(() => {
    if (preview?.preview_mode !== "full") return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(false);
    fetch(`${API_BASE}/api/preview/${encodeURIComponent(nodeId)}/pdf`)
      .then(async (r) => {
        const type = r.headers.get("content-type") ?? "";
        if (!r.ok || !type.includes("pdf")) throw new Error("pdf-unavailable");
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setBlobUrl(url);
        setPdfLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPdfError(true);
          setPdfLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [nodeId, preview?.preview_mode]);

  const pdfUrl = `${API_BASE}/api/preview/${encodeURIComponent(nodeId)}/pdf`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">

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
              <span
                className={`font-mono text-[10px] font-bold ${
                  preview.status === "GOOD_LAW"
                    ? "text-good"
                    : preview.status === "OVERRULED"
                      ? "text-bad"
                      : "text-warn"
                }`}
              >
                {preview.status.replace(/_/g, " ")}
              </span>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-action hover:underline"
              >
                Open in new tab <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </a>
            </div>
          </>
        ) : (
          <p className="font-display text-[14px] font-semibold text-ink">{label}</p>
        )}
      </div>

      {/* ── Body ── */}

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2.5 text-n500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-[13px]">Loading judgment…</span>
        </div>
      )}

      {!loading && error && (
        <div className="m-5 rounded-xl border border-bad-bd bg-bad-bg px-4 py-3">
          <p className="text-[13px] text-bad">{error}</p>
        </div>
      )}

      {/* proposition_only — no PDF available, show the summary */}
      {!loading && !error && preview?.preview_mode === "proposition_only" && (
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-warn-bd bg-warn-bg px-4 py-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
            <p className="text-[12px] leading-[1.65] text-warn">
              Only the summary is available. The original document is scanned, so the full text
              cannot be extracted.
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
        </div>
      )}

      {/* not_found */}
      {!loading && !error && preview?.preview_mode === "not_found" && (
        <div className="m-5 flex items-start gap-2.5 rounded-xl border border-n200 bg-paper px-4 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
          <p className="text-[13px] text-n600">This judgment is not available in the preview corpus.</p>
        </div>
      )}

      {/* full — embedded PDF via blob URL, with a text fallback when the PDF 404s.
          The server ships no judgment PDFs, so in the deploy we render the relevant
          passages (or full text) the API returns from the corpus instead. */}
      {!loading && !error && preview?.preview_mode === "full" &&
        (pdfError ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-start gap-2 border-b border-n200 bg-paper px-5 py-2.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-n400" aria-hidden="true" />
              <p className="text-[11px] leading-[1.6] text-n500">
                Source PDF unavailable here — showing the relevant passages from the corpus.
              </p>
            </div>
            {preview.passages.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <PassagePreview passages={preview.passages} />
              </div>
            ) : preview.full_text ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-n700">
                  {preview.full_text}
                </p>
              </div>
            ) : (
              <div className="m-5 flex items-start gap-2.5 rounded-xl border border-n200 bg-paper px-4 py-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
                <p className="text-[13px] text-n600">
                  No preview text is available for this judgment yet.
                </p>
              </div>
            )}
            {preview.bailii_url && (
              <a
                href={preview.bailii_url}
                target="_blank"
                rel="noreferrer"
                className="m-3 inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-n200 bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-n100"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                View full judgment on BAILII
              </a>
            )}
          </div>
        ) : pdfLoading || !blobUrl ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 text-n500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="text-[13px]">Loading PDF…</span>
          </div>
        ) : (
          <iframe src={blobUrl} className="min-h-0 w-full flex-1 border-0" title={preview.citation} />
        ))}
    </div>
  );
}
