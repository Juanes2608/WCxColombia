import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

// "Decoded" text reveal — the final string resolves out of scrambling glyphs,
// left to right. Thematically on-brand: the truth emerging from noise.
// Modeled on React Bits' DecryptedText, re-tokenized and SSR-safe (renders the
// real text on the server / first paint, then scrambles after hydration).

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&$*?/<>".split("");

interface Props {
  text: string;
  className?: string;
  /** ms between scramble frames */
  speed?: number;
  /** frames each character scrambles before it locks in */
  framesPerChar?: number;
}

export function DecryptedText({ text, className, speed = 32, framesPerChar = 2 }: Props) {
  const reduce = useReducedMotion();
  // Initial state matches SSR exactly (the real text) to avoid hydration drift.
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (reduce) {
      setDisplay(text);
      return;
    }
    const chars = text.split("");
    let frame = 0;
    let revealed = 0;
    const id = window.setInterval(() => {
      const out = chars
        .map((ch, i) => {
          if (ch === " ") return " ";
          if (i < revealed) return ch;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      setDisplay(out);
      frame += 1;
      if (frame % framesPerChar === 0) revealed += 1;
      if (revealed > chars.length) {
        window.clearInterval(id);
        setDisplay(text);
      }
    }, speed);
    return () => window.clearInterval(id);
  }, [text, reduce, speed, framesPerChar]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
