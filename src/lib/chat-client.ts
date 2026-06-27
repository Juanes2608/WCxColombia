// Talks to the backend chat proxy (FastAPI on `main`). The Anthropic key lives
// ONLY on the server. The request carries the deterministic MODEL_SNAPSHOT so the
// LLM may explain figures but never invent them.
import type { ModelSnapshot } from "./pricing/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Read at call time (not module load) so tests can stub VITE_API_URL.
function apiBase(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
}

export async function sendChatMessage(
  messages: ChatMessage[],
  snapshot: ModelSnapshot,
): Promise<string> {
  const base = apiBase();
  if (!base) {
    throw new Error("Backend URL no configurada. Define VITE_API_URL y reconstruye la app.");
  }
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, snapshot }),
    });
  } catch {
    throw new Error("No se pudo contactar el servicio de chat.");
  }
  if (!res.ok) {
    throw new Error("El servicio de chat falló. Inténtalo de nuevo.");
  }
  const body = (await res.json()) as { reply?: unknown };
  if (typeof body.reply !== "string") {
    throw new Error("Respuesta de chat inválida.");
  }
  return body.reply;
}
