import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const allowedEvents = new Set([
  "page_view",
  "tab_view",
  "search_submit",
  "analysis_submit",
  "crowding_submit",
]);

type EventBody = {
  event_name?: string;
  path?: string;
  tab?: string;
  route_name?: string;
  station_name?: string;
  weekday?: string;
  time_value?: string;
  weather?: string;
  day_type?: string;
};

function clean(value: unknown, maxLength = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

async function ensureTable() {
  await query(`
    create table if not exists page_events (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      event_name text not null,
      path text,
      tab text,
      route_name text,
      station_name text,
      weekday text,
      time_value text,
      weather text,
      day_type text,
      referrer text,
      user_agent text,
      ip_address text
    )
  `);

  await query(`
    create index if not exists page_events_created_at_idx
    on page_events (created_at desc)
  `);

  await query(`
    create index if not exists page_events_event_name_idx
    on page_events (event_name, created_at desc)
  `);

  await query(`
    create index if not exists page_events_route_name_idx
    on page_events (route_name, created_at desc)
  `);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EventBody;
    const eventName = clean(body.event_name, 80);

    if (!eventName || !allowedEvents.has(eventName)) {
      return NextResponse.json({ error: "Invalid event_name" }, { status: 400 });
    }

    await ensureTable();

    await query(
      `
      insert into page_events (
        event_name,
        path,
        tab,
        route_name,
        station_name,
        weekday,
        time_value,
        weather,
        day_type,
        referrer,
        user_agent,
        ip_address
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        eventName,
        clean(body.path, 500),
        clean(body.tab, 80),
        clean(body.route_name, 80),
        clean(body.station_name, 200),
        clean(body.weekday, 80),
        clean(body.time_value, 80),
        clean(body.weather, 80),
        clean(body.day_type, 80),
        clean(request.headers.get("referer"), 500),
        clean(request.headers.get("user-agent"), 500),
        clean(getClientIp(request), 80),
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
