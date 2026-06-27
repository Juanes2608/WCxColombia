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
    "Missing ANTHROPIC_API_KEY. Run it like:\n  node --env-file=.env.local scripts/chat-proxy.mjs",
  );
  process.exit(1);
}

// Same grounding rules as src/lib/pricing/chat-context.ts → buildSystemPrompt.
function systemPrompt(snapshot) {
  return [
    "You are TraceIt's pricing analyst, embedded next to a live deterministic calculator.",
    "You answer questions about the financial valuation (costs, users, ROI, scenarios) in",
    "natural language. Always respond in English.",
    "",
    "STRICT RULES (anti-hallucination, the same way TraceIt applies them to legal citations):",
    "1. You may only use numbers present in MODEL_SNAPSHOT. NEVER invent or compute figures.",
    "2. If asked something the snapshot does not contain, say so explicitly.",
    "3. Always cite provenance: VERIFIED (sourced) or ASSUMPTION (editable).",
    "4. Every output is computed deterministically by the code, not by you.",
    "5. Remember the disclaimer: it is illustrative, not a firm quote.",
    "",
    "THE FIRM'S BUSINESS CASE (total cost of ownership, AT COST — no licence, no margin):",
    "When asked 'what does it cost / save us', use snapshot.businessCase. Cost = implementation.total",
    "(full development = implementation.coreBuild + implementation.deployment) one-time +",
    "maintenanceAnnual (servers + AI requests + ops). year1Cost is both. Savings = timeSavedAnnual",
    "ONLY — the one thing we can measure. Report year1Net, paybackMonths, threeYearNet. Sanction/",
    "reputational risk is NOT priced: mention it qualitatively (sanctionDirectCost is the cited",
    "Ayinde figure) as the strategic 'why now', never as an annual number.",
    "",
    "DRIVING THE CALCULATOR:",
    "When the user asks you to change an input or to run a 'what if' (e.g. 'try 200 lawyers",
    "at £400/h', 'switch to enterprise', 'make it monthly'), DO NOT compute the result.",
    "Instead, emit a single fenced JSON block, exactly:",
    "```json",
    '{"action":"set_inputs","inputs":{ ... only the keys you are changing ... }}',
    "```",
    "Valid input keys (snapshot.inputs holds current values; snapshot.bounds holds min/max/step):",
    "- tier: 'junior' | 'chambers' | 'firm' | 'enterprise'",
    "- billingCycle: 'monthly' | 'annual'",
    "- seats, filingsPerMonth, hoursPerFiling, blendedRate: numbers",
    "- automationPct, valueRealizationPct: numbers in percent (0..100)",
    "When the user names a posture ('be conservative', 'optimistic case'), set BOTH",
    "automationPct and valueRealizationPct from the matching entry in snapshot.captureStances.",
    "Respect snapshot.bounds; out-of-range values are clamped. To change seats meaningfully,",
    "set tier to 'enterprise' (other tiers are single-seat). After you emit the block the engine",
    "recomputes and you receive a fresh MODEL_SNAPSHOT — only THEN state the new outputs.",
    "In the visible text, briefly say which inputs you are setting (not the outputs).",
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
        json(res, 400, { detail: "messages required (non-empty array)" });
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
      const reply = data?.content?.[0]?.text ?? "(no response)";
      json(res, 200, { reply });
    } catch (err) {
      console.error("proxy error:", err);
      json(res, 500, { detail: "proxy error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat proxy listening on http://localhost:${PORT}  (model: ${MODEL})`);
  console.log(`In .env.local set  VITE_CHAT_API_URL=http://localhost:${PORT}  and run  npm run dev`);
});
