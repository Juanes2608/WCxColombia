import { BookOpen, ExternalLink, Lightbulb, Sparkles } from "lucide-react";
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
  if (!citation) return null;

  const cs = citation.corpus_source;
  const ha = citation.holding_analysis;

  const propositionCited = citation.layer1.proposition_cited;
  const propositionActual = citation.layer1.proposition_actual;
  const mismatchReason = null;

  return (
    <Dialog open={citation !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <>
          <DialogHeader>
            <DialogTitle className="font-display text-xl leading-snug text-ink">
              {citation.raw_text}
            </DialogTitle>
            {cs && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-xs text-n500">
                <span>{cs.court}</span>
                <span>·</span>
                <span className="capitalize">{cs.domain}</span>
                <span>·</span>
                <span
                  className={
                    cs.status === "GOOD_LAW"
                      ? "font-semibold text-good"
                      : cs.status === "OVERRULED"
                        ? "font-semibold text-bad"
                        : "font-semibold text-warn"
                  }
                >
                  {cs.status.replace("_", " ")}
                </span>
                {cs.bailii_url && (
                  <>
                    <span>·</span>
                    <a
                      href={cs.bailii_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-action hover:underline"
                    >
                      BAILII
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </>
                )}
              </div>
            )}
          </DialogHeader>

          <div className="mt-2 space-y-7">
            {/* Layer 1 — authenticity */}
            <Section title="Layer 1 · Authenticity">
              <VerdictBadge layer="authenticity" verdict={citation.layer1.verdict} />
              <p className="text-sm text-n700">{citation.layer1.explanation}</p>
              <ConfidenceMeter value={citation.layer1.confidence} variant="detail" />

              {(propositionCited || propositionActual) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {propositionCited && (
                    <div className="rounded-lg border border-warn-bd bg-warn-bg p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-warn">
                        Cited for
                      </p>
                      <p className="mt-1 text-sm text-n700">{propositionCited}</p>
                    </div>
                  )}
                  {propositionActual && (
                    <div className="rounded-lg border border-good-bd bg-good-bg p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-good">
                        What the authority establishes
                      </p>
                      <p className="mt-1 text-sm text-n700">{propositionActual}</p>
                    </div>
                  )}
                </div>
              )}

              {mismatchReason && (
                <div className="rounded-lg border border-bad-bd bg-bad-bg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-bad">
                    Why this is problematic
                  </p>
                  <p className="mt-1 text-sm text-n700">{mismatchReason}</p>
                </div>
              )}
            </Section>

            {/* Case summary from holding_analysis */}
            {ha?.case_summary && (
              <Section title="Case summary">
                <p className="text-sm text-n700">{ha.case_summary}</p>
              </Section>
            )}

            {/* Precedent treatment (was "Layer 2 / Clio") */}
            {citation.layer2.verdict !== "NOT_CHECKED" && (
              <Section title="Precedent treatment">
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
                  {citation.statutory.act} {citation.statutory.year}, s.{citation.statutory.section}
                </p>
                {citation.statutory.exists === null ? (
                  <p className="rounded-lg border border-unk-bd bg-unk-bg px-3 py-2 text-sm text-unk">
                    Lookup timed out — the provision could not be verified.
                    Not checked is not the same as passed.
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

            {/* AI advisory */}
            {citation.layer1.llm_explanation && (
              <div className="rounded-xl border border-n300 bg-n100 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-n500">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  AI analysis
                </p>
                <p className="mt-2 text-sm text-n700">{citation.layer1.llm_explanation}</p>
                <p className="mt-3 text-xs text-n500">
                  Advisory only · the verdict above is deterministic, not LLM-generated.
                </p>
              </div>
            )}

            {/* Agent provenance */}
            {ha?.agent_model && (
              <p className="flex items-center gap-1.5 text-xs text-n500">
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                Processed by: {ha.agent_model}
              </p>
            )}
          </div>
        </>
      </DialogContent>
    </Dialog>
  );
}
