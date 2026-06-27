import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, FileText, Sparkles } from "lucide-react";
import { getProof } from "@/lib/api-client";
import type { ProofPanel as ProofPanelData } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VerdictBadge } from "./VerdictBadge";

interface Props {
  matterId: string;
  citationIdx: number | null;
  rawCitation: string;
  onClose: () => void;
}

export function ProofPanel({ matterId, citationIdx, rawCitation, onClose }: Props) {
  const [data, setData] = useState<ProofPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (citationIdx === null) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProof(matterId, citationIdx)
      .then((d) => {
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) { setError(e.message ?? "Could not load proof."); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [matterId, citationIdx]);

  return (
    <Dialog open={citationIdx !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg leading-snug text-ink">
            {rawCitation}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="py-12 text-center font-mono text-sm text-n500">Cargando proof…</p>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-bad">{error}</p>
        )}

        {data && (
          <div className="mt-2 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <VerdictBadge layer="authenticity" verdict={data.verdict} />
            </div>

            {/* Split screen */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Left: brief del abogado */}
              <div className="space-y-3 rounded-xl border border-n300 bg-n100 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-n500">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Brief del abogado
                </p>
                <blockquote className="border-l-2 border-warn pl-3 text-sm leading-relaxed text-n700">
                  {data.document_context}
                </blockquote>
                {data.document_claim && (
                  <div className="rounded-lg border border-warn-bd bg-warn-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warn">
                      Proposición citada
                    </p>
                    <p className="mt-1 text-sm text-n700">{data.document_claim}</p>
                  </div>
                )}
              </div>

              {/* Right: caso real */}
              <div className="space-y-3 rounded-xl border border-n300 bg-n100 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-n500">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Caso real
                </p>
                {data.key_paragraph ? (
                  <blockquote className="border-l-2 border-good pl-3 text-sm italic leading-relaxed text-n700">
                    {data.key_paragraph}
                  </blockquote>
                ) : (
                  <p className="text-sm italic text-n500">
                    Texto completo no disponible —{" "}
                    {data.bailii_url ? (
                      <a
                        href={data.bailii_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-action underline"
                      >
                        ver en BAILII
                      </a>
                    ) : (
                      "recuperación manual requerida."
                    )}
                  </p>
                )}
                {data.corpus_proposition && (
                  <div className="rounded-lg border border-good-bd bg-good-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-good">
                      Proposición real
                    </p>
                    <p className="mt-1 text-sm text-n700">{data.corpus_proposition}</p>
                  </div>
                )}
                {data.bailii_url && (
                  <a
                    href={data.bailii_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:underline"
                  >
                    Ver en BAILII
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            {/* Explanation */}
            {(data.llm_explanation ?? data.static_explanation) && (
              <div className="space-y-2 rounded-xl border border-n300 bg-n100 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-n500">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Análisis
                </p>
                <p className="text-sm text-n700">
                  {data.llm_explanation ?? data.static_explanation}
                </p>
                {data.llm_explanation && (
                  <p className="text-xs text-n500">
                    Advisory only · el veredicto es determinístico, no generado por LLM.
                  </p>
                )}
              </div>
            )}

            {/* Transparency accordion */}
            <Accordion type="single" collapsible>
              <AccordionItem value="transparency" className="border-n300">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-n500 hover:text-ink">
                  ¿Cómo funciona esto?
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm text-n700">
                  <p>{data.transparency.method}</p>
                  <p>
                    <span className="font-semibold">Fuente del veredicto:</span>{" "}
                    {data.transparency.verdict_source}
                  </p>
                  <p>
                    <span className="font-semibold">Tamaño del corpus:</span>{" "}
                    {data.transparency.corpus_size} casos
                  </p>
                  {data.transparency.limitations.length > 0 && (
                    <ul className="list-disc space-y-1 pl-4">
                      {data.transparency.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
