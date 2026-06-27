// TraceIt — API client.
// Currently a MOCK implementation. To wire a real backend, replace the bodies of
// verifyCitations() and healthCheck() with fetch() calls to NEXT_PUBLIC_API_URL;
// the response shapes (src/lib/types.ts) are the contract and must not change.

import type { HealthStatus, VerifyResult } from "./types";
import { buildMockResult } from "./mock-data";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const ACCEPTED_EXTENSIONS = [".pdf", ".txt"] as const;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function healthCheck(): Promise<HealthStatus> {
  await delay(200);
  return {
    status: "ok",
    neo4j: "connected",
    legislation_gov_uk: "reachable",
  };
}

export async function verifyCitations(file: File): Promise<VerifyResult> {
  // Client-side validation mirrors what the backend enforces.
  const name = file.name.toLowerCase();
  const okExt = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!okExt) {
    throw new ApiError(400, "Only PDF and TXT files are accepted.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(413, "File too large — maximum 20 MB.");
  }

  // Simulate scan latency proportional to size.
  await delay(1400 + Math.min(file.size / 6000, 2200));

  return buildMockResult(file);
}