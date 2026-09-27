import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { publicRoutes } from "@/lib/public-routes";
import catalog from "@/config/route-catalog.json";

type SummaryRow = {
  sample_count: string;
  service_days: string;
  full_count: string;
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
  service_days: string;
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
  const days = Number(params.get("days"));
  if ([7, 30, 90].includes(days)) {
    values.push(days - 1);
    clauses.push(`service_date >= (current_timestamp at time zone 'Asia/Seoul')::date - $${values.length}::int`);
  }

  const add = (column: string, value: string) => {
    values.push(value);
    clauses.push(`${column} = $${values.length}`);
  };

  const route = params.get("route");
  const metadata = catalog[route as keyof typeof catalog];
  if (metadata && ["outbound", "return"].includes(params.get("direction") ?? "")) {
    values.push(Number(metadata.stations[0].turnSeq));
    clauses.push(`station_seq ${params.get("direction") === "return" ? ">=" : "<"} $${values.length}`);
  }
  const weekday = params.get("weekday");
  const time = params.get("time");
  const station = params.get("station");
  const weather = params.get("weather");
  const dayType = params.get("dayType");

  if (skip !== "route" && route && route !== "전체") add("route_name", route);
  if (skip !== "weekday" && weekday && weekday !== "전체") {
    const value = weekdayMap.get(weekday);
    if (value !== undefined) {
      values.push(value);
      clauses.push(`day_of_week = $${values.length}`);
    }
  }
  if (dayType === "평일") {
    clauses.push("day_of_week between 0 and 4");
  }
  if (dayType === "주말") {
    clauses.push("day_of_week between 5 and 6");
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
  if (params.has("stationSeq")) add("station_seq", params.get("stationSeq")!);
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
      count(distinct service_date)::text as service_days,
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
  const { where, values } = buildWhere(params);
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
      (floor(max_temperature / 3) * 3)::int::text || '°C 이상 ' || ((floor(max_temperature / 3) * 3)::int + 3)::text || '°C 미만' as label,
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
  if (!publicRoutes.includes(params.get("route") ?? "")) {
    return NextResponse.json({ error: "버스번호를 선택해 주세요." }, { status: 400 });
  }
  if (params.has("days") && !["7", "30", "90"].includes(params.get("days")!)) {
    return NextResponse.json({ error: "조회 기간이 올바르지 않습니다." }, { status: 400 });
  }
  if (params.has("stationSeq") && !/^\d{1,3}$/.test(params.get("stationSeq")!)) {
    return NextResponse.json({ error: "정류장 순서가 올바르지 않습니다." }, { status: 400 });
  }
  if (params.has("direction") && !["outbound", "return"].includes(params.get("direction")!)) {
    return NextResponse.json({ error: "방향을 선택해 주세요." }, { status: 400 });
  }
  if (params.get("profile") === "1" && (!params.has("direction") || parseHour(params.get("time") ?? "") === null)) {
    return NextResponse.json({ error: "노선 흐름은 방향과 시간대를 선택해 주세요." }, { status: 400 });
  }

  try {
    const { where, values } = buildWhere(params);
    const summary = await query<SummaryRow>(
      `
      ${baseCte}
      select
        count(*)::text as sample_count,
        count(distinct service_date)::text as service_days,
        count(*) filter (where remain_seat = 0)::text as full_count,
        round(avg(remain_seat)::numeric, 1)::text as avg_seat,
        min(remain_seat)::int as min_seat,
        max(remain_seat)::int as max_seat,
        round(avg(case when remain_seat <= 0 then 1.0 else 0.0 end)::numeric * 100, 1)::text as full_probability,
        round(avg(eta_seconds)::numeric, 0)::text as avg_eta_seconds,
        to_char(min(service_date + time_hhmm::time), 'YYYY-MM-DD"T"HH24:MI:SS') || '+09:00' as first_collected_at,
        to_char(max(service_date + time_hhmm::time), 'YYYY-MM-DD"T"HH24:MI:SS') || '+09:00' as last_collected_at
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
      Promise.resolve([]),
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

    const comparisonParams = new URLSearchParams(params);
    comparisonParams.delete("time");
    const nearbyTimes = params.has("time") && (params.has("stationSeq") || params.has("station"))
      ? await filteredGroupedStats("lpad(split_part(time_hhmm, ':', 1), 2, '0') || '시'", comparisonParams, "min(split_part(time_hhmm, ':', 1)::int)")
      : [];

    let routeProfile = null;
    if (params.get("profile") === "1") {
      const metadata = catalog[params.get("route") as keyof typeof catalog];
      const observed = await filteredGroupedStats("station_seq::text", params, "min(station_seq)");
      const turn = Number(metadata.stations[0].turnSeq);
      const direction = params.get("direction");
      routeProfile = {
        direction,
        destination: direction === "return" ? metadata.info.startStationName : metadata.info.endStationName,
        stops: metadata.stations.filter((stop) => !/\((경유|미정차)\)/.test(stop.stationName))
          .filter((stop) => direction === "return" ? Number(stop.stationSeq) >= turn : Number(stop.stationSeq) < turn)
          .map((stop) => ({
            seq: Number(stop.stationSeq), name: stop.stationName,
            stats: observed.find((row) => Number(row.label) === Number(stop.stationSeq)) ?? null,
          })),
      };
    }

    return NextResponse.json({
      routeProfile,
      nearbyTimes,
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
