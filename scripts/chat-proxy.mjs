// LOCAL-ONLY dev proxy for testing the grounded pricing chatbot without the
// production FastAPI backend. The Anthropic key is read from the environment and
// used ONLY here (server-side); it never reaches the browser and is never committed.
//
// Run it:  node --env-file=.env.local scripts/chat-proxy.mjs
// Then:    npm run dev   (the chat panel will call this proxy via VITE_CHAT_API_URL)
//
// This mirrors the POST /api/chat contract in
// docs/superpowers/specs/2026-06-27-api-chat-contract.md so the production swap
// (FastAPI on Railway / a Cloudflare function) is a drop-in replacement.
import { createServer } from "node:http";

const PORT = Number(process.env.CHAT_PROXY_PORT ?? 8787);
const MODEL = process.env.CHAT_MODEL ?? "claude-haiku-4-5";
const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.error(
    "Falta ANTHROPIC_API_KEY. Córrelo así:\n  node --env-file=.env.local scripts/chat-proxy.mjs",
  );
  process.exit(1);
}

// Same grounding rules as src/lib/pricing/chat-context.ts → buildSystemPrompt.
function systemPrompt(snapshot) {
  return [
    "Eres el analista de pricing de TraceIt. Respondes preguntas sobre la valoración",
    "financiera de la herramienta (costos, usuarios, ROI, escenarios) en lenguaje natural.",
    "",
    "REGLAS ESTRICTAS (anti-alucinación, igual que TraceIt aplica a las citas legales):",
    "1. Solo puedes usar números presentes en MODEL_SNAPSHOT. NUNCA inventes cifras.",
    "2. Si te preguntan algo que el snapshot no contiene, dilo explícitamente.",
    "3. Cita siempre la procedencia: VERIFICADO (con fuente) o HIPÓTESIS (editable).",
    "4. Los números los calcula el código de forma determinista, no tú.",
    "5. Recuerda el disclaimer: es ilustrativo, no una cotización en firme.",
    "",
    "MODEL_SNAPSHOT (JSON):",
    JSON.stringify(snapshot ?? {}),
  ].join("\n");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (res, status, obj) => {
  res.writeHead(status, { ...CORS, "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/chat")) {
    json(res, 404, { detail: "Not found" });
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { messages, snapshot } = JSON.parse(body || "{}");
      if (!Array.isArray(messages) || messages.length === 0) {
        json(res, 400, { detail: "messages requerido (array no vacío)" });
        return;
      }
      const aResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt(snapshot),
          messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? "") })),
        }),
      });
      const data = await aResp.json();
      if (!aResp.ok) {
        console.error("Anthropic error:", JSON.stringify(data));
        json(res, aResp.status, { detail: data?.error?.message ?? "Anthropic error" });
        return;
      }
      const reply = data?.content?.[0]?.text ?? "(sin respuesta)";
      json(res, 200, { reply });
    } catch (err) {
      console.error("proxy error:", err);
      json(res, 500, { detail: "proxy error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat proxy escuchando en http://localhost:${PORT}  (modelo: ${MODEL})`);
  console.log(`En .env.local pon  VITE_CHAT_API_URL=http://localhost:${PORT}  y corre  npm run dev`);
});
