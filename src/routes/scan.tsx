import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileText, AlertCircle, Star, ClipboardPaste } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import { ProcessingOrbit } from "@/components/motion/ProcessingOrbit";
import {
  verifyCitations,
  ApiError,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/api-client";
import { DEMO, buildDemoDocument } from "@/lib/demo";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "TraceIt: Citation integrity for skeleton arguments" },
      {
        name: "description",
        content:
          "Verify every legal citation in a High Court skeleton argument: does it exist, is it applied correctly, is it still good law? Deterministic corpus lookup, never an LLM.",
      },
      { property: "og:title", content: "TraceIt" },
      {
        property: "og:description",
        content: "Because the AI invents. The corpus doesn't.",
      },
    ],
  }),
  component: Index,
});

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return "Only PDF and TXT files are accepted.";
  if (file.size > MAX_FILE_BYTES) return "File too large. Maximum is 20 MB.";
  return null;
}

function Index() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setScanning(true);
    try {
      const result = await verifyCitations(file);
      sessionStorage.setItem(`result-${result.matter_id}`, JSON.stringify(result));
      navigate({ to: "/results/$matterId", params: { matterId: result.matter_id } });
    } catch (e) {
      setScanning(false);
      if (e instanceof ApiError) {
        setError(
          e.status === 500
            ? "Something failed during the scan. No verdicts were produced."
            : e.message,
        );
      } else {
        setError("Something failed during the scan. No verdicts were produced.");
      }
    }
  }

  async function handlePaste() {
    const text = pasteText.trim();
    if (!text) {
      setError("Paste some text first.");
      return;
    }
    const file = new File([text], "document.txt", { type: "text/plain" });
    await handleFile(file);
  }

  // Self-contained: writes the sample result + document to sessionStorage and
  // opens the full results experience with no backend round-trip.
  function loadDemo() {
    sessionStorage.setItem(`result-${DEMO.matter_id}`, JSON.stringify(DEMO));
    sessionStorage.setItem(`doc-${DEMO.matter_id}`, JSON.stringify(buildDemoDocument()));
    navigate({ to: "/results/$matterId", params: { matterId: DEMO.matter_id } });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="mb-6 font-mono text-xs uppercase tracking-widest text-action">
          Legal-citation integrity checker
        </p>
        <Logo variant="wordmark" />

        <h1 className="mt-8 font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
          Because the AI invents.
          <br />
          <span className="mark-lime">The corpus doesn&rsquo;t.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-n500">
          Upload a skeleton argument and TraceIt verifies every authority before you file: does it
          exist, is it applied correctly, is it still good law?
        </p>

        {scanning ? (
          <ProcessingOrbit
            className="mt-10 h-64 w-full"
            label="Verifying every authority against the corpus…"
            sublabel="Deterministic lookup in progress"
          />
        ) : (
          <>
            {/* Mode toggle + demo */}
            <div className="mt-10 flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-n300 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("upload")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    mode === "upload" ? "bg-ink text-paper" : "text-n500 hover:text-ink"
                  }`}
                >
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" /> Upload
                </button>
                <button
                  type="button"
                  onClick={() => setMode("paste")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    mode === "paste" ? "bg-ink text-paper" : "text-n500 hover:text-ink"
                  }`}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Paste text
                </button>
              </div>

              {/* Demo — accented so it reads as the "try me" affordance */}
              <button
                type="button"
                onClick={loadDemo}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-accent-lime/45 bg-accent-lime/10 px-3 py-1.5 text-xs font-semibold text-action transition-colors hover:bg-accent-lime/20 active:scale-[0.97]"
              >
                <Star className="h-3.5 w-3.5" aria-hidden="true" /> Try the demo
              </button>
            </div>

            {mode === "upload" ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload a skeleton argument"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`mt-3 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                  dragOver
                    ? "border-accent-lime bg-accent-lime/15"
                    : "border-n300 bg-surface hover:border-ink-300"
                }`}
              >
                <UploadCloud className="h-8 w-8 text-ink-300" aria-hidden="true" />
                <p className="mt-4 font-display text-lg font-medium text-ink">
                  Drop a skeleton argument here
                </p>
                <p className="mt-1 text-sm text-n500">
                  PDF or TXT · max 20 MB · or{" "}
                  <span className="font-semibold text-ink underline">browse</span>
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste your skeleton argument or legal document here…"
                  className="min-h-[220px] w-full rounded-2xl border border-n300 bg-surface px-5 py-4 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-n400 focus:border-ink"
                  rows={10}
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={!pasteText.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-ink-700 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
                >
                  Verify citations
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-lg border border-bad-bd bg-bad-bg px-4 py-3 text-sm text-bad animate-in fade-in-0 slide-in-from-top-1 duration-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <p className="mt-8 flex items-start gap-2 text-sm text-n500">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
          <span>
            <span className="font-mono uppercase text-ink">Fabricated</span> verdicts come from
            deterministic corpus lookup,{" "}
            <span className="font-semibold text-ink">never from an LLM.</span>
          </span>
        </p>
      </div>
    </main>
  );
}
