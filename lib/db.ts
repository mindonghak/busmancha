import { Pool } from "pg";
import type { QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var busmanchaPool: Pool | undefined;
}

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
      url.port = "6543";
    }
    return url.toString();
  } catch {
    return value;
  }
}

const databaseUrl = connectionString();

export const pool =
  globalThis.busmanchaPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl ? { rejectUnauthorized: false } : undefined,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.busmanchaPool = pool;
}

const retryableMessages = ["max clients reached", "Connection terminated", "timeout"];

function isRetryableDbError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return retryableMessages.some((message) => error.message.includes(message));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await pool.query<T>(text, params);
    } catch (error) {
      if (attempt === 2 || !isRetryableDbError(error)) {
        throw error;
      }
      await sleep(300 * (attempt + 1));
    }
  }
  throw new Error("Database query failed.");
}
