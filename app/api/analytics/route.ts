import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type DailyRow = {
  date: string;
  page_views: string;
  events: string;
  searches: string;
};

type RouteRow = {
  route_name: string;
  events: string;
};

async function tableExists() {
  const result = await query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'page_events'
    )
    `
  );

  return result.rows[0]?.exists ?? false;
}

export async function GET() {
  try {
    if (!(await tableExists())) {
      return NextResponse.json({
        daily: [],
        topRoutes: [],
      });
    }

    const [daily, topRoutes] = await Promise.all([
      query<DailyRow>(`
        select
          created_at::date::text as date,
          count(*) filter (where event_name = 'page_view')::text as page_views,
          count(*)::text as events,
          count(*) filter (where event_name in ('search_submit', 'analysis_submit', 'crowding_submit'))::text as searches
        from page_events
        where created_at >= now() - interval '30 days'
        group by created_at::date
        order by created_at::date desc
      `),
      query<RouteRow>(`
        select
          route_name,
          count(*)::text as events
        from page_events
        where route_name is not null
          and created_at >= now() - interval '30 days'
        group by route_name
        order by count(*) desc, route_name
        limit 20
      `),
    ]);

    return NextResponse.json({
      daily: daily.rows,
      topRoutes: topRoutes.rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
