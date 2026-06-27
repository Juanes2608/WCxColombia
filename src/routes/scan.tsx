import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { Loader2, UploadCloud, FileText, AlertCircle } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import {
  verifyCitations,
  ApiError,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/api-client";

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

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a skeleton argument"
          onClick={() => !scanning && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !scanning) {
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
          className={`mt-10 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
            dragOver
              ? "border-accent-lime bg-accent-lime/15"
              : "border-n300 bg-surface hover:border-ink-300"
          }`}
        >
          {scanning ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-ink" aria-hidden="true" />
              <p className="mt-4 font-display text-lg font-medium text-ink">
                Scanning citations against the corpus&hellip;
              </p>
              <p className="mt-1 font-mono text-xs text-n500">
                Deterministic lookup in progress
              </p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-ink-300" aria-hidden="true" />
              <p className="mt-4 font-display text-lg font-medium text-ink">
                Drop a skeleton argument here
              </p>
              <p className="mt-1 text-sm text-n500">
                PDF or TXT · max 20 MB · or{" "}
                <span className="font-semibold text-ink underline">browse</span>
              </p>
            </>
          )}
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
