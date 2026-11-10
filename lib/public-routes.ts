import config from "@/config/collection-routes.json";
import catalog from "@/config/route-catalog.json";
import { unstable_cache } from "next/cache";
import { query } from "./db";

export type RouteOption = {
  name: string; region: string; start: string; end: string;
  samples: number; days: number; full: number; lastDate: string | null;
};

// Publish only configured routes with a verified zero-seat passage, plus the original routes.
export const getPublicRouteOptions = unstable_cache(async (): Promise<RouteOption[]> => {
  const result = await query<{ route_name: string; samples: number; days: number; full: number; last_date: string }>(`
    select route_name, count(*)::int as samples, count(distinct service_date)::int as days,
      count(*) filter(where remain_seat=0)::int as full, max(service_date)::text as last_date
    from station_passages where remain_seat>=0
    group by route_name
  `);
  const counts = new Map(result.rows.map(r => [r.route_name, r]));
  const core = new Set(Object.keys(config.public));
  return Object.keys({ ...config.public, ...config.private })
    .filter(name => name in catalog && (core.has(name) || (counts.get(name)?.full ?? 0) > 0))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map(name => {
      const info = catalog[name as keyof typeof catalog].info;
      const row = counts.get(name);
      return { name, region: info.regionName, start: info.startStationName, end: info.endStationName,
        samples: row?.samples ?? 0, days: row?.days ?? 0, full: row?.full ?? 0, lastDate: row?.last_date ?? null };
    });
}, ["observed-public-routes-v1"], { revalidate: 3600 });
