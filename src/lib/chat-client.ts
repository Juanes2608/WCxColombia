// Talks to the backend chat proxy (FastAPI on `main`). The Anthropic key lives
// ONLY on the server. The request carries the deterministic MODEL_SNAPSHOT so the
// LLM may explain figures but never invent them.
import type { ModelSnapshot } from "./pricing/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Read at call time (not module load) so tests can stub the env.
// Prefer a dedicated chat backend (e.g. a local dev proxy) and fall back to the
// shared backend URL, so chat and scan/verify can point to different servers.
function apiBase(): string {
  const url = import.meta.env.VITE_CHAT_API_URL ?? import.meta.env.VITE_API_URL ?? "";
  return url.replace(/\/+$/, "");
}

export async function sendChatMessage(
  messages: ChatMessage[],
  snapshot: ModelSnapshot,
): Promise<string> {
  const base = apiBase();
  if (!base) {
    throw new Error("Backend URL no configurada. Define VITE_CHAT_API_URL o VITE_API_URL.");
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
