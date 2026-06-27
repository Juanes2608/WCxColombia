import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import type { PreviewResult } from "@/lib/types";
import { getPreview, ApiError, API_BASE } from "@/lib/api-client";

export interface PreviewRequest {
  nodeId: string;
  claim: string;
  label: string;
}

interface Props extends PreviewRequest {
  onBack: () => void;
}

export function CasePreviewPanel({ nodeId, claim, label, onBack }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
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
              <span className={`font-mono text-[10px] font-bold ${
                preview.status === "GOOD_LAW"  ? "text-good" :
                preview.status === "OVERRULED" ? "text-bad"  : "text-warn"
              }`}>
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

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2.5 text-n500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-[13px]">Loading judgment…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="m-5 rounded-xl border border-bad-bd bg-bad-bg px-4 py-3">
          <p className="text-[13px] text-bad">{error}</p>
        </div>
      )}

      {/* proposition_only — no PDF, show summary */}
      {!loading && !error && preview?.preview_mode === "proposition_only" && (
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
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
        </div>
      )}

      {/* not_found */}
      {!loading && !error && preview?.preview_mode === "not_found" && (
        <div className="m-5 flex items-start gap-2.5 rounded-xl border border-n200 bg-paper px-4 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-n400" aria-hidden="true" />
          <p className="text-[13px] text-n600">This judgment is not available in the preview corpus.</p>
        </div>
      )}

      {/* full — PDF iframe */}
      {!loading && !error && preview?.preview_mode === "full" && (
        <iframe
          src={pdfUrl}
          className="min-h-0 flex-1 w-full border-0"
          title={preview.citation}
        />
      )}
    </div>
  );
}
