import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { publicRoutes } from "@/lib/public-routes";
import catalog from "@/config/route-catalog.json";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const route = p.get("route") ?? "";
  const day = p.get("dayType") ?? "전체";
  const weather = p.get("weather") ?? "전체";
  const days = p.get("days") ?? "0";
  if (!publicRoutes.includes(route) || !["전체", "평일", "주말"].includes(day)
    || !["전체", "강수없음", "비", "눈"].includes(weather) || !["0", "7", "30", "90"].includes(days)) {
    return NextResponse.json({ error: "분석 조건을 확인해 주세요." }, { status: 400 });
  }
  const metadata = catalog[route as keyof typeof catalog];
  const stops = metadata.stations.filter(s => !/\(경유\)|\(미정차\)/.test(s.stationName))
    .map(s => ({ seq: Number(s.stationSeq), name: s.stationName, direction: Number(s.stationSeq) < Number(s.turnSeq) ? "outbound" : "return" }));
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=60" };
  if (p.get("metadata") === "1") return NextResponse.json({ stops }, { headers });
  try {
    // Aggregate once for every stop/hour; selecting a stop requires no new DB query.
    const result = await query(`
      with daily_weather as (
        select collected_at::date as service_date,
          case when bool_or(coalesce(precipitation_type, '0') in ('2','3','6','7')) then '눈'
          when bool_or(coalesce(precipitation_1h,0)>0 or coalesce(precipitation_type,'0')<>'0') then '비'
          else '강수없음' end as condition
        from weather_history where area_key='gangnam' and $3 <> '전체'
        group by collected_at::date
      )
      select station_seq as seq, split_part(time_hhmm,':',1)::int as hour,
        count(*)::int as samples, count(distinct s.service_date)::int as days,
        count(*) filter(where remain_seat=0)::int as full,
        round(avg(remain_seat)::numeric,1)::float as seats,
        round(100.0*count(*) filter(where remain_seat=0)/count(*),1)::float as probability,
        min(s.service_date)::text as first_date, max(s.service_date)::text as last_date
      from seat_history s left join daily_weather w on w.service_date=s.service_date
      where route_name=$1 and remain_seat>=0
        and station_name not like '%(경유)%' and station_name not like '%(미정차)%'
        and ($2='전체' or ($2='평일' and day_of_week between 0 and 4) or ($2='주말' and day_of_week between 5 and 6))
        and ($3='전체' or w.condition=$3)
        and ($4::int=0 or s.service_date >= (current_timestamp at time zone 'Asia/Seoul')::date-($4::int-1))
      group by station_seq, split_part(time_hhmm,':',1)::int order by station_seq,hour
    `, [route, day, weather, Number(days)]);
    return NextResponse.json({ stops, rows: result.rows }, { headers });
  } catch {
    return NextResponse.json({ error: "분석 데이터를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  }
}
