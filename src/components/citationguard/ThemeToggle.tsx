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

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem("cg-theme", next ? "dark" : "light");
      return next;
    });
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
