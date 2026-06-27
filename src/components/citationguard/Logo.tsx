// TraceIt — official brand mark (CORRECTED toolkit).
// Isotype: a centered document frame (currentColor, so it inverts with the theme)
// holding a lavender citation quotemark, scanned by acid-lime corner brackets,
// closed by a period. Source of truth for the in-app logo; standalone exports
// live in /public/brand and /public app icons.

const QUOTE_LAVENDER = "#ADA8EC";

interface LogoProps {
  variant?: "iso" | "wordmark";
  className?: string;
}

function Isotype({ className }: { className?: string }) {
  // When a caller passes a className it owns both size and colour (the frame +
  // dot follow `currentColor`); otherwise fall back to the default chip size/ink.
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="Trace It"
      className={className ?? "h-8 w-8 text-ink"}
    >
      {/* Document frame (open at bottom-right) + closing period — follow ink */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M56 456 V56 H456 V388" />
        <path d="M56 456 H388" />
      </g>
      <circle cx="424" cy="424" r="14" fill="currentColor" />
      {/* Scanner corner brackets — always acid lime, the scan/signal colour */}
      <g fill="none" stroke="var(--accent-lime)" strokeWidth="20" strokeLinecap="square">
        <path d="M116 174 V116 H174" />
        <path d="M338 116 H396 V174" />
        <path d="M116 338 V396 H174" />
        <path d="M338 396 H396 V338" />
      </g>
      {/* Citation quotemark — lavender (the brand's violet accent) */}
      <g fill={QUOTE_LAVENDER} transform="translate(2 -59) scale(1.15)">
        <path d="M199 209c-31 0-53 23-53 58v62h60v-62h-30c0-21 9-31 30-36l-7-22z" />
        <path d="M288 209c-31 0-53 23-53 58v62h60v-62h-30c0-21 9-31 30-36l-7-22z" />
      </g>
    </svg>
  );
}

export function Logo({ variant = "iso", className }: LogoProps) {
  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-2 text-ink ${className ?? ""}`}>
        <Isotype className="h-8 w-8" />
        <span className="font-display text-2xl font-semibold tracking-tight">
          Trace<span className="text-accent-lime">It</span>
        </span>
      </span>
    );
  }
  return <Isotype className={className} />;
}
