import { useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chat-client";
import { buildChatContext } from "@/lib/pricing";
import type {
  BuyerEconomics, ScenarioSet, SellerEconomics, TierId,
} from "@/lib/pricing";

interface ChatPanelProps {
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
  tier: TierId;
}

export function ChatPanel(props: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const snapshot = buildChatContext(
        props.buyer, props.seller, props.buyerScenarios, props.sellerScenarios, props.tier,
      );
      const reply = await sendChatMessage(next, snapshot);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-n300 bg-surface p-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-action">
        Pregúntale al modelo
      </p>
      <p className="mt-1 text-sm text-n500">
        Habla con el analista de pricing. Solo usa cifras del modelo determinista; no inventa números.
      </p>
      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-ink text-paper" : "bg-n100 text-ink"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="¿Cuál es el margen para White & Case?"
          className="flex-1 rounded-lg border border-n300 bg-paper px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {busy ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
