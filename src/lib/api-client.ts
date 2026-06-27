// TraceIt — API client.
// Talks to the FastAPI backend (see backend `app/api/routers`).
// The base URL comes from VITE_API_URL (the Cloudflare tunnel / deployed backend).
// The response shapes in src/lib/types.ts are the contract and must match the backend.

import type { DocumentView, HealthStatus, ProofPanel, VerifyResult } from "./types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const ACCEPTED_EXTENSIONS = [".pdf", ".txt"] as const;

// Strip trailing slashes so `${API_BASE}/api/verify` never doubles up.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function requireApiBase(): string {
  if (!API_BASE) {
    throw new ApiError(
      0,
      "Backend URL is not configured. Set VITE_API_URL and rebuild the app.",
    );
  }
  return API_BASE;
}

/** Best-effort extraction of FastAPI's `{ "detail": "..." }` error body. */
async function readDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

export async function healthCheck(): Promise<HealthStatus> {
  const base = requireApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/health`, { method: "GET" });
  } catch {
    throw new ApiError(0, "Could not reach the verification service.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, "Health check failed.");
  }
  return (await res.json()) as HealthStatus;
}

export async function verifyCitations(file: File): Promise<VerifyResult> {
  const base = requireApiBase();

  // Client-side validation mirrors what the backend enforces.
  const name = file.name.toLowerCase();
  const okExt = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!okExt) {
    throw new ApiError(400, "Only PDF and TXT files are accepted.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(413, "File too large. Maximum is 20 MB.");
  }

  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${base}/api/verify`, { method: "POST", body: form });
  } catch {
    throw new ApiError(
      0,
      "Could not reach the verification service. Check the connection and try again.",
    );
  }

  if (!res.ok) {
    const detail = await readDetail(res);
    throw new ApiError(res.status, detail ?? "Verification failed.");
  }

  return (await res.json()) as VerifyResult;
}

/**
 * Per-citation proof detail (GET /api/proof/{matter_id}/{idx}): the document
 * claim vs the corpus proposition, key paragraph, treatment and transparency.
 */
export async function getProof(matterId: string, idx: number): Promise<ProofPanel> {
  const base = requireApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/proof/${encodeURIComponent(matterId)}/${idx}`);
  } catch {
    throw new ApiError(0, "Could not reach the verification service.");
  }
  if (res.status === 404) throw new ApiError(404, "Proof not found.");
  if (!res.ok) throw new ApiError(res.status, "Could not load proof.");
  return (await res.json()) as ProofPanel;
}

/**
 * Full document text with citation positions (GET /api/document/{matter_id}),
 * used to render the source skeleton with every authority highlighted in place.
 * Checks sessionStorage first, which powers demo mode and offline caching.
 */
export async function getDocument(matterId: string): Promise<DocumentView> {
  const cached = sessionStorage.getItem(`doc-${matterId}`);
  if (cached) return JSON.parse(cached) as DocumentView;

  const base = requireApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/document/${encodeURIComponent(matterId)}`);
  } catch {
    throw new ApiError(0, "Could not reach the verification service.");
  }
  if (res.status === 404) throw new ApiError(404, "Document not found.");
  if (!res.ok) throw new ApiError(res.status, "Could not load document.");
  return (await res.json()) as DocumentView;
}

/**
 * Retrieve a previously computed report by matter_id (GET /api/report/{matter_id}).
 * Backed by an in-memory store on the server (last 100 reports, cleared on restart).
 */
export async function getReport(matterId: string): Promise<VerifyResult> {
  const base = requireApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/report/${encodeURIComponent(matterId)}`);
  } catch {
    throw new ApiError(0, "Could not reach the verification service.");
  }
  if (res.status === 404) {
    throw new ApiError(404, "Report not found.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, "Could not load report.");
  }
  return (await res.json()) as VerifyResult;
}
