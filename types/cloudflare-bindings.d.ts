/**
 * Minimal Cloudflare binding declarations for source typechecking in CI.
 * Generated Wrangler types should replace these when a deployable Worker is
 * configured. These declarations do not verify runtime bindings or RLS.
 */
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<T>;
  raw<T = unknown>(): Promise<T[]>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
  };
}
