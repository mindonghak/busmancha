import { Pool } from "pg";
import type { QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var busmanchaPool: Pool | undefined;
}

export const pool =
  globalThis.busmanchaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.busmanchaPool = pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query<T>(text, params);
}
