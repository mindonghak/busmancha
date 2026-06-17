import { NextRequest, NextResponse } from "next/server";
import { collectOnce } from "@/lib/cron-collector";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectOnce();
    await recordCollectorRun("success", result);
    return NextResponse.json(result);
  } catch (error) {
    await recordCollectorRun("failed", { error: error instanceof Error ? error.message : "Unknown collect error" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown collect error" },
      { status: 500 }
    );
  }
}

async function recordCollectorRun(status: string, payload: unknown) {
  await query(
    `
    create table if not exists collector_runs (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      status text not null,
      payload jsonb not null
    )
    `
  );
  await query("insert into collector_runs (status, payload) values ($1, $2::jsonb)", [
    status,
    JSON.stringify(payload),
  ]);
}
