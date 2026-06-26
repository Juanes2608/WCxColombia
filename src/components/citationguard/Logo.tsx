// CitationGuard — provisional placeholder logo. Swap the real mark here in one place.

interface LogoProps {
  variant?: "iso" | "wordmark";
  className?: string;
}

function Isotype({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 96"
      role="img"
      aria-label="CitationGuard"
      className={className}
      width="40"
      height="30"
    >
      <rect x="30" y="8" width="68" height="80" rx="14" fill="#14181A" />
      <g
        fill="none"
        stroke="#C6F035"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M48 28 H40 V36" />
        <path d="M80 28 H88 V36" />
        <path d="M48 68 H40 V60" />
        <path d="M80 68 H88 V60" />
        <path d="M52 49 L60 58 L78 37" strokeWidth="6" />
      </g>
    </svg>
  );
}

export function Logo({ variant = "iso", className }: LogoProps) {
  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
        <Isotype />
        <span className="font-display text-2xl font-600 tracking-tight text-ink">
          Citation<span className="text-action">Guard</span>
        </span>
      </span>
    );
  }
  return <Isotype className={className} />;
}