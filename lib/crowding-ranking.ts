import { unstable_cache } from "next/cache";
import { query } from "./db";
import { getPublicRouteOptions } from "./public-routes";

export const getCrowdingRankings = unstable_cache(async () => {
  const routes = await getPublicRouteOptions();
  const result = await query<{ route_name: string; day_type: string; samples: number; days: number; full: number; probability: number; first_date: string; last_date: string }>(`
    with recent as (
      select route_name, service_date, remain_seat,
        case when day_of_week between 0 and 4 then '평일' else '주말' end as day_type
      from station_passages
      where remain_seat>=0
        and station_name not like '%(경유)%' and station_name not like '%(미정차)%'
        and service_date between (now() at time zone 'Asia/Seoul')::date-29
          and (now() at time zone 'Asia/Seoul')::date
    )
    select route_name, coalesce(day_type,'전체') as day_type,
      count(*)::int as samples, count(distinct service_date)::int as days,
      count(*) filter(where remain_seat=0)::int as full,
      (100.0*count(*) filter(where remain_seat=0)/count(*))::float as probability,
      min(service_date)::text as first_date, max(service_date)::text as last_date
    from recent group by grouping sets ((route_name), (route_name,day_type))
    having count(*)>=300 and count(distinct service_date)>=3
      and count(*) filter(where remain_seat=0)>0
      and max(service_date)>=(now() at time zone 'Asia/Seoul')::date-6
  `);
  const byName = new Map(routes.map(r => [r.name, r]));
  const rankings = Object.fromEntries(["전체", "평일", "주말"].map(day => [day, result.rows
    .filter(r => r.day_type === day && byName.has(r.route_name))
    .sort((a, b) => b.probability-a.probability || b.samples-a.samples || a.route_name.localeCompare(b.route_name, "en", { numeric: true }))
    .slice(0,10).map(r => ({ ...r, route: byName.get(r.route_name)! }))]));
  return { rankings, updatedAt: new Date().toISOString() };
}, ["crowding-ranking-30days-v1"], { revalidate: 3600 });
