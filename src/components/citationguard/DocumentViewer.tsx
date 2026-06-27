import { useEffect, useState } from "react";
import { getDocument } from "@/lib/api-client";
import type { AuthenticityVerdict, DocumentView } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VERDICT_CLASS: Record<AuthenticityVerdict, string> = {
  FABRICATED: "bg-bad/20 text-bad underline decoration-bad/60 cursor-pointer",
  MISAPPLIED: "bg-warn/20 text-warn underline decoration-warn/60 cursor-pointer",
  VERIFIED: "bg-good/20 text-good underline decoration-good/60 cursor-pointer",
};

interface Segment {
  text: string;
  citationIdx: number | null;
  verdict: AuthenticityVerdict | null;
}

function buildSegments(doc: DocumentView): Segment[] {
  const sorted = [...doc.citations].sort((a, b) => a.char_pos - b.char_pos);
  const segments: Segment[] = [];
  let pos = 0;
  for (const c of sorted) {
    if (c.char_pos > pos) {
      segments.push({ text: doc.text.slice(pos, c.char_pos), citationIdx: null, verdict: null });
    }
    const end = c.char_pos + c.raw_text.length;
    segments.push({ text: doc.text.slice(c.char_pos, end), citationIdx: c.idx, verdict: c.verdict });
    pos = end;
  }
  if (pos < doc.text.length) {
    segments.push({ text: doc.text.slice(pos), citationIdx: null, verdict: null });
  }
  return segments;
}

interface Props {
  matterId: string;
  open: boolean;
  onClose: () => void;
  onCitationClick?: (idx: number) => void;
}

export function DocumentViewer({ matterId, open, onClose, onCitationClick }: Props) {
  const [data, setData] = useState<DocumentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDocument(matterId)
      .then((d) => {
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) { setError(e.message ?? "Could not load document."); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [matterId, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">
            Documento completo
          </DialogTitle>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {(["FABRICATED", "MISAPPLIED", "VERIFIED"] as AuthenticityVerdict[]).map((v) => (
            <span key={v} className={`inline-flex items-center rounded px-2 py-0.5 ${VERDICT_CLASS[v]}`}>
              {v}
            </span>
          ))}
          <span className="ml-auto font-mono font-normal text-n500">
            {data ? `${data.char_count.toLocaleString()} chars · ${data.citations.length} citas` : ""}
          </span>
        </div>

        {loading && (
          <p className="py-12 text-center font-mono text-sm text-n500">Cargando documento…</p>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-bad">{error}</p>
        )}

        {data && (
          <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-n700">
            {buildSegments(data).map((seg, i) => {
              if (seg.citationIdx === null || seg.verdict === null) {
                return <span key={i}>{seg.text}</span>;
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onCitationClick?.(seg.citationIdx!)}
                  className={`rounded px-0.5 transition-opacity hover:opacity-70 ${VERDICT_CLASS[seg.verdict]}`}
                  title={`${seg.verdict} — click para ver proof`}
                >
                  {seg.text}
                </button>
              );
            })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
