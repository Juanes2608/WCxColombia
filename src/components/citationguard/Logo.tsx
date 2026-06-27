// TraceIt — official brand mark.
// Isotype: scan-frame brackets (currentColor, so they invert with the theme)
// framing a central "T" in Acid Lime — the verified signal. Source of truth for
// the in-app logo; the standalone vector/raster exports live in /public/brand.

interface LogoProps {
  variant?: "iso" | "wordmark";
  className?: string;
}

function Isotype({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      aria-label="TraceIt"
      className={`text-ink ${className ?? ""}`}
      width="34"
      height="34"
    >
      {/* Scan-frame brackets — inherit the surrounding ink colour */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M70 48 H42 Q34 48 34 56 V86" />
        <path d="M186 48 H214 Q222 48 222 56 V86" />
        <path d="M34 170 V200 Q34 208 42 208 H70" />
        <path d="M222 170 V200 Q222 208 214 208 H186" />
      </g>
      {/* Central T — the verified signal, always Acid Lime */}
      <g fill="var(--accent-lime)">
        <rect x="88" y="92" width="80" height="18" rx="3" />
        <rect x="119" y="110" width="18" height="58" rx="2" />
      </g>
    </svg>
  );
}

export function Logo({ variant = "iso", className }: LogoProps) {
  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
        <Isotype />
        <span className="font-display text-2xl font-semibold tracking-tight text-ink">
          Trace<span className="text-action">It</span>
        </span>
      </span>
    );
  }
  return <Isotype className={className} />;
}
