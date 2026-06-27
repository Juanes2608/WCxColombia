/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the TraceIt backend API (e.g. the Cloudflare tunnel URL). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
