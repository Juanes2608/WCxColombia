// Ambient atmosphere — layered, blurred glow fields that give the dark surface
// depth and slow perpetual motion (the "alive" feeling). Pure CSS, no JS, fully
// behind content (pointer-events-none) and disabled under reduced-motion via the
// cg-* animation utilities. Tinted only with brand colours: lime + action green.

interface Props {
  className?: string;
  /** dial the overall glow strength up or down */
  intensity?: "soft" | "bold";
}

export function Atmosphere({ className, intensity = "soft" }: Props) {
  const lime = intensity === "bold" ? 0.4 : 0.24;
  const green = intensity === "bold" ? 0.32 : 0.2;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      {/* Top-centre lime aura — the light spilling in from above */}
      <div
        className="cg-breathe absolute left-1/2 top-[-25%] h-[65vh] w-[85vw] -translate-x-1/2 rounded-full blur-[130px]"
        style={{
          background: `radial-gradient(closest-side, rgba(198,240,53,${lime}), transparent 70%)`,
        }}
      />
      {/* Bottom-right deep-green field, slowly drifting */}
      <div
        className="cg-drift absolute bottom-[-20%] right-[-12%] h-[55vh] w-[48vw] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(closest-side, rgba(95,140,0,${green}), transparent 70%)`,
        }}
      />
      {/* Slow conic halo — a forensic "sweep" of light behind the content */}
      <div
        className="cg-spin-slow absolute left-[62%] top-[42%] h-[42vw] w-[42vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-[70px]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg 40deg, rgba(198,240,53,0.12) 72deg, rgba(95,140,0,0.10) 112deg, transparent 150deg 360deg)",
        }}
      />
      {/* Hairline horizon line that anchors the glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-lime/20 to-transparent" />
    </div>
  );
}
