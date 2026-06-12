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

type HotspotRow = {
  station_label: string;
  station_seq: number;
  time_label: string;
  sample_count: string;
  avg_seat: string | null;
  min_seat: number | null;
  full_probability: string | null;
};

const MIN_STATION_SAMPLE_COUNT = 10;

const weekdayMap = new Map([
  ["월요일", 0],
  ["화요일", 1],
  ["수요일", 2],
  ["목요일", 3],
  ["금요일", 4],
  ["토요일", 5],
  ["일요일", 6],
]);

function parseHour(value: string) {
  const match = value.match(/^(\d{1,2})(?::\d{2})?시?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

const baseCte = `
  with daily_weather as (
    select
      collected_at::date as service_date,
      max(temperature) as max_temperature,
      case
        when bool_or(coalesce(precipitation_type, '0') in ('2', '3', '6', '7')) then '눈'
        when bool_or(coalesce(precipitation_1h, 0) > 0 or coalesce(precipitation_type, '0') <> '0') then '비'
        else '강수없음'
      end as daily_weather_condition
    from weather_history
    where area_key = 'gangnam'
    group by collected_at::date
  ),
  seat_weather as (
    select
      s.*,
      coalesce(w.daily_weather_condition, '날씨 없음') as weather_condition,
      w.max_temperature
    from seat_history s
    left join daily_weather w on w.service_date = s.service_date
  )
`;

function buildWhere(params: URLSearchParams, skip: string | null = null) {
  const clauses = [
    "remain_seat is not null",
    "remain_seat >= 0",
    "station_name not like '%(경유)%'",
    "station_name not like '%(미정차)%'",
  ];
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
  if (skip !== "time" && time && time !== "전체") {
    const hour = parseHour(time);
    if (hour !== null) {
      values.push(hour);
      clauses.push(`split_part(time_hhmm, ':', 1)::int = $${values.length}`);
    } else {
      add("time_hhmm", time);
    }
  }
  if (skip !== "station" && station && station !== "전체") add("station_name", station);
  if (skip !== "weather" && weather && weather !== "전체") {
    if (weather === "강수없음" || weather === "비" || weather === "눈") {
      add("weather_condition", weather);
    }
  }

  return {
    where: clauses.length ? `where ${clauses.join(" and ")}` : "",
    values,
  };
}

async function groupedStats(
  labelSql: string,
  params: URLSearchParams,
  skip: string,
  orderSql = "label",
  minSampleCount = 0
) {
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
    ${minSampleCount > 0 ? `having count(*) >= ${minSampleCount}` : ""}
    order by ${orderSql}
    limit 100
    `,
    values
  );
  return result.rows;
}

async function filteredGroupedStats(
  labelSql: string,
  params: URLSearchParams,
  orderSql = "label",
  minSampleCount = 0
) {
  const { where, values } = buildWhere(params);
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
    ${minSampleCount > 0 ? `having count(*) >= ${minSampleCount}` : ""}
    order by ${orderSql}
    limit 100
    `,
    values
  );
  return result.rows;
}

async function weatherGroupedStats(params: URLSearchParams) {
  const { where, values } = buildWhere(params, "weather");
  const result = await query<GroupRow>(
    `
    ${baseCte}
    select
      weather_condition as label,
      count(*)::text as sample_count,
      round(avg(remain_seat)::numeric, 1)::text as avg_seat,
      min(remain_seat)::int as min_seat,
      round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability
    from seat_weather
    ${where} and weather_condition <> '날씨 없음'
    group by label
    order by label
    limit 100
    `,
    values
  );
  return result.rows;
}

async function temperatureGroupedStats(params: URLSearchParams) {
  const { where, values } = buildWhere(params);
  const result = await query<GroupRow>(
    `
    ${baseCte}
    select
      (floor(max_temperature / 3) * 3)::int::text || '~' || ((floor(max_temperature / 3) * 3)::int + 2)::text || '도' as label,
      count(*)::text as sample_count,
      round(avg(remain_seat)::numeric, 1)::text as avg_seat,
      min(remain_seat)::int as min_seat,
      round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability
    from seat_weather
    ${where} and max_temperature is not null
    group by label
    order by min(floor(max_temperature / 3))
    limit 100
    `,
    values
  );
  return result.rows;
}

async function hotspotStats(params: URLSearchParams) {
  const { where, values } = buildWhere(params);
  const result = await query<HotspotRow>(
    `
    ${baseCte}
    select
      station_seq::text || '. ' || station_name as station_label,
      station_seq::int as station_seq,
      lpad(split_part(time_hhmm, ':', 1), 2, '0') || '시' as time_label,
      count(*)::text as sample_count,
      round(avg(remain_seat)::numeric, 1)::text as avg_seat,
      min(remain_seat)::int as min_seat,
      round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability
    from seat_weather
    ${where}
    group by station_seq, station_name, split_part(time_hhmm, ':', 1)
    having count(*) >= ${MIN_STATION_SAMPLE_COUNT}
    order by
      avg(case when remain_seat <= 0 then 1.0 else 0.0 end) desc,
      avg(remain_seat) asc,
      station_seq asc,
      min(split_part(time_hhmm, ':', 1)::int) asc
    limit 60
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

    const [
      byRoute,
      byStation,
      byTime,
      byWeekday,
      byWeather,
      byTemperature,
      filteredByStation,
      hotspots,
    ] = await Promise.all([
      groupedStats("route_name", params, "route"),
      groupedStats(
        "station_seq::text || '. ' || station_name",
        params,
        "station",
        "min(station_seq)",
        MIN_STATION_SAMPLE_COUNT
      ),
      groupedStats(
        "lpad(split_part(time_hhmm, ':', 1), 2, '0') || '시'",
        params,
        "time",
        "min(split_part(time_hhmm, ':', 1)::int)"
      ),
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
      weatherGroupedStats(params),
      temperatureGroupedStats(params),
      filteredGroupedStats(
        "station_seq::text || '. ' || station_name",
        params,
        "min(station_seq)",
        MIN_STATION_SAMPLE_COUNT
      ),
      hotspotStats(params),
    ]);

    return NextResponse.json({
      summary: summary.rows[0],
      byRoute,
      byStation,
      byTime,
      byWeekday,
      byWeather,
      byTemperature,
      filteredByStation,
      hotspots,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
