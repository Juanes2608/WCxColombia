import { AUTHENTICITY, goodLawStyle } from "@/lib/verdict-map";
import type { AuthenticityVerdict, GoodLawVerdict } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props =
  | { layer: "authenticity"; verdict: AuthenticityVerdict; source?: string }
  | { layer: "goodlaw"; verdict: GoodLawVerdict; source: string };

export function VerdictBadge(props: Props) {
  const style =
    props.layer === "authenticity"
      ? AUTHENTICITY[props.verdict]
      : goodLawStyle(props.verdict, props.source);
  const Icon = style.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.pill}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-mono uppercase tracking-wide">{style.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{style.tooltip}</TooltipContent>
    </Tooltip>
  );
}