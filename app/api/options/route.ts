import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

export async function GET() {
  try {
    const [routes, stations, times] = await Promise.all([
      query<{ route_name: string }>("select distinct route_name from seat_history order by route_name"),
      query<{ route_name: string; station_id: string; station_name: string; station_seq: number }>(
        `
        select distinct route_name, station_id, station_name, station_seq
        from seat_history
        where station_name is not null
          and station_name not like '%(경유)%'
        order by route_name, station_seq
        `
      ),
      query<{ time_hhmm: string }>(
        `
        select distinct time_hhmm
        from seat_history
        where time_hhmm is not null
        order by time_hhmm
        `
      ),
    ]);

    return NextResponse.json({
      routes: routes.rows.map((row) => row.route_name),
      weekdays,
      times: times.rows.map((row) => row.time_hhmm),
      stations: stations.rows,
      weatherConditions: ["강수없음", "비", "눈"],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
