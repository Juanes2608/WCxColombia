import { ExternalLink, Sparkles } from "lucide-react";
import type { CitationResult } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerdictBadge } from "./VerdictBadge";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { TreatmentTimeline } from "./TreatmentTimeline";

interface Props {
  citation: CitationResult | null;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-n700">{title}</h3>
      {children}
    </section>
  );
}

export function CitationDetail({ citation, onClose }: Props) {
  return (
    <Dialog open={citation !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {citation && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl leading-snug text-ink">
                {citation.raw_text}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-2 space-y-7">
              {/* Layer 1 — authenticity */}
              <Section title="Layer 1 · Authenticity">
                <VerdictBadge layer="authenticity" verdict={citation.layer1.verdict} />
                <p className="text-sm text-n700">{citation.layer1.explanation}</p>
                <ConfidenceMeter value={citation.layer1.confidence} variant="detail" />

                {citation.layer1.verdict === "MISAPPLIED" &&
                  citation.layer1.proposition_cited &&
                  citation.layer1.proposition_actual && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-warn-bd bg-warn-bg p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-warn">
                          Proposition cited
                        </p>
                        <p className="mt-1 text-sm text-n700">
                          {citation.layer1.proposition_cited}
                        </p>
                      </div>
                      <div className="rounded-lg border border-good-bd bg-good-bg p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-good">
                          What the authority says
                        </p>
                        <p className="mt-1 text-sm text-n700">
                          {citation.layer1.proposition_actual}
                        </p>
                      </div>
                    </div>
                  )}
              </Section>

              {/* Layer 2 — good law */}
              {citation.layer2.verdict !== "NOT_CHECKED" && (
                <Section title="Layer 2 · Good law (Clio)">
                  <VerdictBadge
                    layer="goodlaw"
                    verdict={citation.layer2.verdict}
                    source={citation.layer2.source}
                  />
                  <TreatmentTimeline layer2={citation.layer2} />
                </Section>
              )}

              {/* Statutory */}
              {citation.statutory && (
                <Section title="Statutory provision">
                  <p className="text-sm text-ink">
                    {citation.statutory.act} {citation.statutory.year}, s.
                    {citation.statutory.section}
                  </p>
                  {citation.statutory.exists === null ? (
                    <p className="rounded-lg border border-unk-bd bg-unk-bg px-3 py-2 text-sm text-unk">
                      Lookup timed out — the provision could not be verified. Not checked is not
                      the same as passed.
                    </p>
                  ) : (
                    citation.statutory.excerpt && (
                      <blockquote className="border-l-2 border-n300 pl-3 text-sm italic text-n700">
                        {citation.statutory.excerpt}
                      </blockquote>
                    )
                  )}
                  <a
                    href={citation.statutory.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:underline"
                  >
                    legislation.gov.uk
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </Section>
              )}

              {/* LLM advisory */}
              {citation.layer1.llm_explanation && (
                <div className="rounded-xl border border-n300 bg-n100 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-300">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    AI analysis
                  </p>
                  <p className="mt-2 text-sm text-n700">{citation.layer1.llm_explanation}</p>
                  <p className="mt-3 text-xs text-n500">
                    Advisory only · the verdict above is deterministic, not LLM-generated.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}