import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ArrowUp, Undo2 } from "lucide-react";
import { sendChatMessage, type ChatMessage } from "@/lib/chat-client";
import { applyAction, buildSnapshot, describeChanges, parseInputsAction } from "@/lib/pricing";
import type { CalculatorInputs } from "@/lib/pricing";
import { ProcessingOrbit } from "@/components/motion/ProcessingOrbit";
import { Logo } from "@/components/citationguard/Logo";

// Emil ease — strong ease-out for the popover entrance.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// One-time nudge toward the FAB. Appears shortly after the page settles, never
// nags again once the user opens or dismisses it (per-session).
const HINT_DELAY_MS = 1400;
const HINT_STORAGE_KEY = "traceit:pricing-chat-hint-seen";

function readHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    // sessionStorage unavailable (private mode); fall back to in-memory state.
  }
}

interface ChatPanelProps {
  inputs: CalculatorInputs;
  onApplyInputs: (next: CalculatorInputs) => void;
}

interface AppliedChange {
  prev: CalculatorInputs;
  changes: string[];
}

/**
 * Floating chat bubble (FAB) for the grounded pricing analyst. Fixed bottom-right
 * so it never pushes page content; click to expand a popover. While the model is
 * thinking, the bubble icon becomes the app's ProcessingOrbit animation at FAB
 * size. The model only proposes INPUTS via a set_inputs action — the deterministic
 * engine recomputes every output, then the model narrates the fresh snapshot. The
 * user keeps control via an Undo chip.
 */
export function ChatPanel({ inputs, onApplyInputs }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedChange | null>(null);
  const [showHint, setShowHint] = useState(false);
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Latest inputs in a ref so async turns read post-apply state, not a stale closure.
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Surface the nudge once, a beat after load, unless already seen this session.
  useEffect(() => {
    if (readHintSeen()) return;
    const t = window.setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Opening the chat retires the nudge for good.
  useEffect(() => {
    if (!open) return;
    setShowHint(false);
    markHintSeen();
  }, [open]);

  const dismissHint = () => {
    setShowHint(false);
    markHintSeen();
  };

  // Keep the conversation scrolled to the newest message / thinking indicator.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, applied, open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const undo = () => {
    if (!applied) return;
    onApplyInputs(applied.prev);
    setApplied(null);
    setMessages((m) => [...m, { role: "assistant", content: "Reverted to the previous inputs." }]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const reply = await sendChatMessage(next, buildSnapshot(inputsRef.current));
      const parsed = parseInputsAction(reply);
      const firstText = parsed.text || (parsed.action ? "Updating the calculator…" : reply);
      const withFirst: ChatMessage[] = [...next, { role: "assistant", content: firstText }];
      setMessages(withFirst);

      if (!parsed.action) return;

      const prev = inputsRef.current;
      const nextInputs = applyAction(prev, parsed.action);
      const changes = describeChanges(prev, nextInputs);
      if (changes.length === 0) return; // action equalled the current state

      onApplyInputs(nextInputs);
      inputsRef.current = nextInputs;
      setApplied({ prev, changes });

      // Confirmation turn: feed the recomputed snapshot back so the model states the
      // NEW real outputs (it never computed them itself).
      try {
        const followup: ChatMessage[] = [
          ...withFirst,
          {
            role: "user",
            content:
              "Those inputs are now applied. In one or two sentences, summarize the key new results " +
              "(margin, buyer ROI, payback) using only the updated snapshot.",
          },
        ];
        const reply2 = await sendChatMessage(followup, buildSnapshot(nextInputs));
        const summary = parseInputsAction(reply2).text || reply2;
        setMessages((m) => [...m, { role: "assistant", content: summary }]);
      } catch {
        // Apply already stands; just note the calculator updated.
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Calculator updated. See the new figures above." },
        ]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Expandable chat popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, transform: reduce ? "none" : "translateY(16px) scale(0.96)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: reduce ? "none" : "translateY(12px) scale(0.97)" }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-24 right-5 z-50 flex w-[min(92vw,384px)] flex-col overflow-hidden rounded-2xl border border-n300 bg-surface shadow-2xl shadow-ink/25"
            role="dialog"
            aria-label="Pricing analyst chat"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent-lime">
                  Pricing analyst
                </p>
                <p className="text-sm font-semibold text-paper">Ask the model</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg p-1.5 text-paper/70 transition hover:bg-paper/10 hover:text-paper"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conversation */}
            <div
              ref={scrollRef}
              className="flex max-h-[min(56vh,420px)] min-h-[140px] flex-col gap-3 overflow-y-auto p-4"
            >
              {messages.length === 0 && (
                <p className="text-sm text-n500">
                  I read the live calculator and only use its deterministic figures. Ask me to explain
                  them, or to change them:{" "}
                  <span className="text-ink">&ldquo;try 200 lawyers at &pound;400/h&rdquo;</span>
                  {" "}or{" "}
                  <span className="text-ink">&ldquo;what&rsquo;s the margin for White &amp; Case?&rdquo;</span>
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <span
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm ${
                      m.role === "user" ? "bg-ink text-paper" : "bg-n100 text-ink"
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              ))}
              {applied && (
                <div className="flex items-start justify-between gap-2 rounded-xl border border-accent-lime/40 bg-accent-lime/10 px-3 py-2">
                  <div className="text-xs text-ink">
                    <p className="font-mono uppercase tracking-wider text-action">✓ Applied</p>
                    <ul className="mt-1 space-y-0.5">
                      {applied.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={undo}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-n300 bg-paper px-2 py-1 text-xs font-semibold text-ink transition hover:bg-n100"
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo
                  </button>
                </div>
              )}
              {busy && (
                <div className="text-left">
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-n100 px-3 py-2 text-sm text-n500">
                    thinking
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-n500 [animation-delay:-0.3s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-n500 [animation-delay:-0.15s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-n500" />
                    </span>
                  </span>
                </div>
              )}
              {error && <p className="text-sm text-bad">{error}</p>}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t border-n300 p-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask about costs, ROI, or 'try 200 lawyers'…"
                className="flex-1 rounded-lg border border-n300 bg-paper px-3 py-2 text-sm outline-none focus-visible:border-action"
                aria-label="Type your question"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || input.trim().length === 0}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-paper transition hover:bg-ink-700 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time nudge pointing at the FAB */}
      <AnimatePresence>
        {showHint && !open && (
          <motion.div
            initial={{ opacity: 0, transform: reduce ? "none" : "translateY(8px) scale(0.96)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: reduce ? "none" : "translateY(6px) scale(0.97)" }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-[84px] right-5 z-50 w-[min(80vw,264px)]"
          >
            {/* Gentle float to draw the eye without distracting. */}
            <motion.div
              animate={reduce ? undefined : { transform: ["translateY(0px)", "translateY(-4px)", "translateY(0px)"] }}
              transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="block w-full rounded-2xl bg-ink px-4 py-3 text-left shadow-2xl shadow-ink/30 ring-1 ring-accent-lime/25 transition hover:ring-accent-lime/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-lime"
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent-lime">
                  Pricing analyst
                </p>
                <p className="mt-0.5 text-sm font-medium leading-snug text-paper">
                  Questions about this valuation? Ask the model anything.
                </p>
              </button>
              {/* Tail pointing down to the bubble. */}
              <span
                className="absolute -bottom-1 right-6 h-3 w-3 rotate-45 bg-ink"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={dismissHint}
                aria-label="Dismiss hint"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-n300 bg-surface text-n500 shadow-sm transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close the pricing chat" : "Open the pricing chat"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-ink shadow-2xl shadow-ink/30 ring-1 ring-accent-lime/25 transition hover:scale-105 hover:ring-accent-lime/50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-lime"
      >
        {/* Cross-fade the icon between idle / open / busy so it never hard-swaps
            (Emil: nothing appears from nothing). A faint blur masks the swap; under
            reduced motion only opacity changes. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={busy ? "busy" : open ? "open" : "idle"}
            initial={{ opacity: 0, ...(reduce ? {} : { filter: "blur(4px)" }) }}
            animate={{ opacity: 1, ...(reduce ? {} : { filter: "blur(0px)" }) }}
            exit={{ opacity: 0, ...(reduce ? {} : { filter: "blur(4px)" }) }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {busy ? (
              <ProcessingOrbit className="h-14 w-14 rounded-full border-0 shadow-none ring-0" />
            ) : open ? (
              <X className="h-6 w-6 text-accent-lime" />
            ) : (
              <Logo variant="iso" className="h-7 w-7 text-paper" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </>
  );
}
