import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type SummaryRow = {
  sample_count: string;
  avg_seat: string | null;
  min_seat: number | null;
  max_seat: number | null;
  full_probability: string | null;
  avg_eta_seconds: string | null;
  first_collected_at: string | null;
  last_collected_at: string | null;
};

type GroupRow = {
  label: string;
  sample_count: string;
  avg_seat: string | null;
  min_seat: number | null;
  full_probability: string | null;
};

const weekdayMap = new Map([
  ["월요일", 0],
  ["화요일", 1],
  ["수요일", 2],
  ["목요일", 3],
  ["금요일", 4],
  ["토요일", 5],
  ["일요일", 6],
]);

const baseCte = `
  with seat_weather as (
    select
      s.*,
      case
        when coalesce(w.precipitation_1h, 0) > 0 or coalesce(w.precipitation_type, '0') <> '0'
          then '비/눈'
        else '강수없음'
      end as weather_condition,
      w.temperature,
      w.humidity,
      w.precipitation_1h,
      w.wind_speed
    from seat_history s
    left join lateral (
      select *
      from weather_history w
      where w.area_key = s.weather_area_key
      order by abs(extract(epoch from (w.collected_at - s.collected_at)))
      limit 1
    ) w on true
  )
`;

function buildWhere(params: URLSearchParams, skip: string | null = null) {
  const clauses = ["remain_seat is not null"];
  const values: unknown[] = [];

  const add = (column: string, value: string) => {
    values.push(value);
    clauses.push(`${column} = $${values.length}`);
  };

  const route = params.get("route");
  const weekday = params.get("weekday");
  const time = params.get("time");
  const station = params.get("station");
  const weather = params.get("weather");

  if (skip !== "route" && route && route !== "전체") add("route_name", route);
  if (skip !== "weekday" && weekday && weekday !== "전체") {
    const value = weekdayMap.get(weekday);
    if (value !== undefined) {
      values.push(value);
      clauses.push(`day_of_week = $${values.length}`);
    }
  }
  if (skip !== "time" && time && time !== "전체") add("time_hhmm", time);
  if (skip !== "station" && station && station !== "전체") add("station_name", station);
  if (skip !== "weather" && weather && weather !== "전체") {
    if (weather === "비/눈") {
      add("weather_condition", "비/눈");
    } else if (weather === "강수없음") {
      add("weather_condition", "강수없음");
    } else {
      add("weather_area_name", weather);
    }
  }

  return {
    where: clauses.length ? `where ${clauses.join(" and ")}` : "",
    values,
  };
}

async function groupedStats(labelSql: string, params: URLSearchParams, skip: string, orderSql = "label") {
  const { where, values } = buildWhere(params, skip);
  const result = await query<GroupRow>(
    `
    ${baseCte}
    select
      ${labelSql} as label,
      count(*)::text as sample_count,
      round(avg(remain_seat)::numeric, 1)::text as avg_seat,
      min(remain_seat)::int as min_seat,
      round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability
    from seat_weather
    ${where}
    group by label
    order by ${orderSql}
    limit 100
    `,
    values
  );
  return result.rows;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const { where, values } = buildWhere(params);
    const summary = await query<SummaryRow>(
      `
      ${baseCte}
      select
        count(*)::text as sample_count,
        round(avg(remain_seat)::numeric, 1)::text as avg_seat,
        min(remain_seat)::int as min_seat,
        max(remain_seat)::int as max_seat,
        round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability,
        round(avg(eta_seconds)::numeric, 0)::text as avg_eta_seconds,
        min(collected_at)::text as first_collected_at,
        max(collected_at)::text as last_collected_at
      from seat_weather
      ${where}
      `,
      values
    );

    const [byRoute, byStation, byTime, byWeekday, byWeather] = await Promise.all([
      groupedStats("route_name", params, "route"),
      groupedStats("station_seq::text || '. ' || station_name", params, "station", "min(station_seq)"),
      groupedStats("time_hhmm", params, "time", "label"),
      groupedStats(
        `case day_of_week
          when 0 then '월요일'
          when 1 then '화요일'
          when 2 then '수요일'
          when 3 then '목요일'
          when 4 then '금요일'
          when 5 then '토요일'
          else '일요일'
        end`,
        params,
        "weekday",
        "min(day_of_week)"
      ),
      groupedStats(
        "case when weather_area_name is not null then weather_condition || ' / ' || weather_area_name else weather_condition end",
        params,
        "weather"
      ),
    ]);

    return NextResponse.json({
      summary: summary.rows[0],
      byRoute,
      byStation,
      byTime,
      byWeekday,
      byWeather,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
