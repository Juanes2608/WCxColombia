import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function getInitial(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("cg-theme");
  if (stored) return stored === "dark";
  // Dark-luxury is the primary experience: default to dark unless the user
  // has explicitly chosen light before.
  return true;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(getInitial());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
  }, [dark]);

  const apply = (next: boolean) => {
    // Mutate the DOM synchronously so the View Transition can snapshot it.
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("cg-theme", next ? "dark" : "light");
    setDark(next);
  };

  const toggle = () => {
    const next = !dark;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startViewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition;
    // A smooth cross-fade of the whole page on theme flip — the one moment that
    // otherwise hard-cuts. Falls back to an instant swap where unsupported or
    // when the user prefers reduced motion.
    if (prefersReduced || typeof startViewTransition !== "function") {
      apply(next);
      return;
    }
    startViewTransition.call(document, () => apply(next));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-n300/70 text-n500 transition-colors hover:text-ink"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
