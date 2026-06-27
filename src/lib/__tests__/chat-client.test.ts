import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendChatMessage } from "@/lib/chat-client";
import type { ModelSnapshot } from "@/lib/pricing/types";

const snapshot = { tier: "enterprise" } as unknown as ModelSnapshot;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // Stub the dedicated chat URL (the primary var the client reads); this overrides
  // any value vitest may load from .env.local during local development.
  vi.stubEnv("VITE_CHAT_API_URL", "https://api.example.com");
});

describe("sendChatMessage", () => {
  it("POSTs messages + snapshot and returns the reply", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "El margen bruto es 97.2%." }),
    });
    const reply = await sendChatMessage([{ role: "user", content: "margen?" }], snapshot);
    expect(reply).toBe("El margen bruto es 97.2%.");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example.com/api/chat");
    expect(JSON.parse(init.body)).toMatchObject({ messages: [{ role: "user", content: "margen?" }] });
  });
  it("throws a friendly error on non-ok", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(sendChatMessage([{ role: "user", content: "x" }], snapshot)).rejects.toThrow();
  });
});
