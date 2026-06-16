import { query } from "@/lib/db";
import {
  defaultStationLimits,
  gyeonggiArrivalUrl,
  gyeonggiRouteStationsUrl,
  kmaUltraShortNowcastUrl,
  routes,
  serviceWindows,
  weatherPoints,
  type RouteName,
  type WeatherAreaKey,
} from "@/lib/collector-config";

type XmlRow = Record<string, string>;

type BusRow = {
  id: number;
  collected_at: string;
  service_date: string;
  day_of_week: number;
  time_hhmm: string;
  provider: string;
  route_id: string;
  route_name: string;
  route_type_cd: string;
  station_id: string;
  station_name: string;
  station_seq: number;
  weather_area_key: string;
  weather_area_name: string;
  vehicle_id: string;
  plate_no: string;
  arrival_order: number;
  remain_seat: number | null;
  is_full: boolean | null;
  eta_seconds: number | null;
  raw_flag: string;
};

type WeatherRow = {
  id: number;
  collected_at: string;
  observed_at: string;
  area_key: string;
  area_name: string;
  nx: number;
  ny: number;
  base_date: string;
  base_time: string;
  temperature: number | null;
  precipitation_1h: number | null;
  humidity: number | null;
  wind_speed: number | null;
  precipitation_type: string | null;
  raw_payload: string;
};

type RouteResult = {
  route: string;
  stations: number;
  serviceStations: number;
  checked: number;
  inserted: number;
  errors: string[];
  skipped?: string;
};

const seoulFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function seoulParts(date: Date) {
  const parts = Object.fromEntries(seoulFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function seoulIso(date: Date) {
  const parts = seoulParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}+09:00`;
}

function serviceDate(date: Date) {
  const parts = seoulParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function timeHhmm(date: Date) {
  const parts = seoulParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function dayOfWeek(date: Date) {
  const parts = seoulParts(date);
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day);
  return (new Date(utc).getUTCDay() + 6) % 7;
}

function parseHhmm(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isWithinServiceWindow(routeName: RouteName, now: Date) {
  const [start, end] = serviceWindows[routeName];
  const startMinute = parseHhmm(start);
  const endMinute = parseHhmm(end);
  const parts = seoulParts(now);
  const nowMinute = parts.hour * 60 + parts.minute;
  if (startMinute <= endMinute) return startMinute <= nowMinute && nowMinute <= endMinute;
  return nowMinute >= startMinute || nowMinute <= endMinute;
}

function parseIntOrNull(value: string | undefined | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatOrNull(value: string | undefined | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrecipitation(value: string | undefined | null) {
  if (!value) return null;
  if (value === "강수없음" || value === "0" || value === "0.0") return 0;
  if (value.includes("1mm 미만")) return 0.5;
  return parseFloatOrNull(value.replace(/[^\d.]/g, ""));
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlItems(text: string, itemTag: string): XmlRow[] {
  const itemRegex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, "g");
  const tagRegex = /<([^!?/][^>\s/]*)[^>]*>([\s\S]*?)<\/\1>/g;
  const items: XmlRow[] = [];
  for (const itemMatch of text.matchAll(itemRegex)) {
    const row: XmlRow = {};
    for (const tagMatch of itemMatch[1].matchAll(tagRegex)) {
      row[tagMatch[1]] = decodeXml(tagMatch[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
    }
    if (Object.keys(row).length) items.push(row);
  }
  return items;
}

async function fetchText(url: string, params: Record<string, string>, timeoutMs = 20_000) {
  const searchParams = new URLSearchParams(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}?${searchParams.toString()}`, {
      headers: { "User-Agent": "busmancha-vercel-collector/0.1" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function serviceKey() {
  const key = process.env.GYEONGGI_SERVICE_KEY;
  if (!key) throw new Error("GYEONGGI_SERVICE_KEY is not configured.");
  return key;
}

function weatherServiceKey() {
  const key = process.env.WEATHER_SERVICE_KEY;
  if (!key) throw new Error("WEATHER_SERVICE_KEY is not configured.");
  return key;
}

async function getRouteStations(routeId: string) {
  const payload = await fetchText(gyeonggiRouteStationsUrl, {
    serviceKey: serviceKey(),
    routeId,
    format: "xml",
  });
  return xmlItems(payload, "busRouteStationList");
}

async function getArrival(routeId: string, stationId: string, stationSeq: string) {
  const payload = await fetchText(gyeonggiArrivalUrl, {
    serviceKey: serviceKey(),
    routeId,
    stationId,
    staOrder: stationSeq,
    format: "xml",
  });
  return xmlItems(payload, "busArrivalItem")[0] ?? null;
}

function isPassThroughStation(station: XmlRow) {
  const stationName = station.stationName ?? "";
  return stationName.includes("(경유)") || stationName.includes("(미정차)");
}

function isSeoulStation(station: XmlRow) {
  return station.regionName === "서울";
}

function collectionStations(routeName: RouteName, serviceStations: XmlRow[]) {
  const selected = new Set<string>();
  for (const station of serviceStations.slice(0, defaultStationLimits[routeName])) {
    selected.add(`${station.stationId}:${station.stationSeq}`);
  }
  for (const station of serviceStations) {
    if (isSeoulStation(station)) selected.add(`${station.stationId}:${station.stationSeq}`);
  }
  return serviceStations.filter((station) => selected.has(`${station.stationId}:${station.stationSeq}`));
}

function weatherAreaForStation(routeName: string, station: XmlRow): WeatherAreaKey {
  const stationName = station.stationName ?? "";
  const regionName = station.regionName ?? "";
  if (stationName.includes("잠실")) return "jamsil";
  if (["강남", "양재", "뱅뱅", "매헌", "서초"].some((token) => stationName.includes(token))) return "gangnam";
  if (["서울역", "시청", "명동", "신한은행", "국가인권"].some((token) => stationName.includes(token))) {
    return "seoul_station";
  }
  if (regionName === "서울") {
    if (routeName === "G6009") return "jamsil";
    if (routeName === "6002") return "gangnam";
    return "seoul_station";
  }
  return "dongtan_hwaseong";
}

function rowId(now: Date, index: number) {
  return now.getTime() * 1000 + index;
}

function rowsFromArrival(now: Date, station: XmlRow, arrival: XmlRow, startIndex: number): BusRow[] {
  const rows: BusRow[] = [];
  const routeName = arrival.routeName ?? "";
  const areaKey = weatherAreaForStation(routeName, station);
  const area = weatherPoints[areaKey];

  for (const order of [1, 2]) {
    const vehicleId = arrival[`vehId${order}`] ?? "";
    if (!vehicleId) continue;

    const remainSeat = parseIntOrNull(arrival[`remainSeatCnt${order}`]);
    rows.push({
      id: rowId(now, startIndex + rows.length),
      collected_at: seoulIso(now),
      service_date: serviceDate(now),
      day_of_week: dayOfWeek(now),
      time_hhmm: timeHhmm(now),
      provider: "gyeonggi",
      route_id: arrival.routeId ?? "",
      route_name: routeName,
      route_type_cd: arrival.routeTypeCd ?? "",
      station_id: station.stationId ?? "",
      station_name: station.stationName ?? "",
      station_seq: parseIntOrNull(station.stationSeq) ?? 0,
      weather_area_key: areaKey,
      weather_area_name: area.name,
      vehicle_id: vehicleId,
      plate_no: arrival[`plateNo${order}`] ?? "",
      arrival_order: order,
      remain_seat: remainSeat,
      is_full: remainSeat === null ? null : remainSeat <= 0,
      eta_seconds: parseIntOrNull(arrival[`predictTimeSec${order}`]),
      raw_flag: arrival.flag ?? "",
    });
  }
  return rows;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function insertSeatRows(rows: BusRow[]) {
  if (!rows.length) return 0;
  const columns = [
    "id",
    "collected_at",
    "service_date",
    "day_of_week",
    "time_hhmm",
    "provider",
    "route_id",
    "route_name",
    "route_type_cd",
    "station_id",
    "station_name",
    "station_seq",
    "weather_area_key",
    "weather_area_name",
    "vehicle_id",
    "plate_no",
    "arrival_order",
    "remain_seat",
    "is_full",
    "eta_seconds",
    "raw_flag",
  ] as const;
  const values: unknown[] = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    for (const column of columns) values.push(row[column]);
    return `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
  });
  await query(
    `
    insert into seat_history (${columns.join(", ")})
    values ${placeholders.join(", ")}
    on conflict (id) do nothing
    `,
    values
  );
  return rows.length;
}

function latestWeatherBase(now: Date) {
  const base = new Date(now.getTime() - 45 * 60 * 1000);
  const parts = seoulParts(base);
  const observed = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour - 9, 0, 0));
  return {
    baseDate: `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`,
    baseTime: `${String(parts.hour).padStart(2, "0")}00`,
    observedAt: seoulIso(observed),
  };
}

async function getWeatherNowcast(area: (typeof weatherPoints)[WeatherAreaKey], now: Date) {
  const base = latestWeatherBase(now);
  const payload = await fetchText(kmaUltraShortNowcastUrl, {
    serviceKey: weatherServiceKey(),
    pageNo: "1",
    numOfRows: "100",
    dataType: "XML",
    base_date: base.baseDate,
    base_time: base.baseTime,
    nx: String(area.nx),
    ny: String(area.ny),
  });
  const items = xmlItems(payload, "item");
  const values = Object.fromEntries(items.map((item) => [item.category ?? "", item.obsrValue ?? ""]));
  return { ...base, items, values };
}

async function collectWeather(now: Date, startIndex: number) {
  const rows: WeatherRow[] = [];
  const errors: string[] = [];
  for (const [areaKey, area] of Object.entries(weatherPoints) as [WeatherAreaKey, (typeof weatherPoints)[WeatherAreaKey]][]) {
    try {
      const result = await getWeatherNowcast(area, now);
      rows.push({
        id: rowId(now, startIndex + rows.length),
        collected_at: seoulIso(now),
        observed_at: result.observedAt,
        area_key: areaKey,
        area_name: area.name,
        nx: area.nx,
        ny: area.ny,
        base_date: result.baseDate,
        base_time: result.baseTime,
        temperature: parseFloatOrNull(result.values.T1H),
        precipitation_1h: parsePrecipitation(result.values.RN1),
        humidity: parseIntOrNull(result.values.REH),
        wind_speed: parseFloatOrNull(result.values.WSD),
        precipitation_type: result.values.PTY ?? null,
        raw_payload: JSON.stringify(result.items),
      });
    } catch (error) {
      errors.push(`${areaKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (rows.length) await insertWeatherRows(rows);
  return { inserted: rows.length, errors };
}

async function insertWeatherRows(rows: WeatherRow[]) {
  const columns = [
    "id",
    "collected_at",
    "observed_at",
    "area_key",
    "area_name",
    "nx",
    "ny",
    "base_date",
    "base_time",
    "temperature",
    "precipitation_1h",
    "humidity",
    "wind_speed",
    "precipitation_type",
    "raw_payload",
  ] as const;
  const values: unknown[] = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    for (const column of columns) values.push(row[column]);
    return `(${columns.map((column, columnIndex) => `$${offset + columnIndex + 1}${column === "raw_payload" ? "::jsonb" : ""}`).join(", ")})`;
  });
  await query(
    `
    insert into weather_history (${columns.join(", ")})
    values ${placeholders.join(", ")}
    on conflict (id) do nothing
    `,
    values
  );
  return rows.length;
}

async function collectRoute(routeName: RouteName, routeId: string, now: Date, startIndex: number): Promise<RouteResult & { rows: BusRow[] }> {
  if (!isWithinServiceWindow(routeName, now)) {
    return {
      route: routeName,
      stations: 0,
      serviceStations: 0,
      checked: 0,
      inserted: 0,
      rows: [],
      errors: [],
      skipped: `outside_service_window ${serviceWindows[routeName].join("-")}`,
    };
  }

  const errors: string[] = [];
  let stations: XmlRow[] = [];
  try {
    stations = await getRouteStations(routeId);
  } catch (error) {
    return {
      route: routeName,
      stations: 0,
      serviceStations: 0,
      checked: 0,
      inserted: 0,
      rows: [],
      errors: [`station_list_error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const serviceStations = stations.filter((station) => !isPassThroughStation(station));
  const selectedStations = collectionStations(routeName, serviceStations);
  const arrivalResults = await mapWithConcurrency(selectedStations, 8, async (station) => {
    try {
      const arrival = await getArrival(routeId, station.stationId ?? "", station.stationSeq ?? "");
      return arrival ? rowsFromArrival(now, station, arrival, startIndex) : [];
    } catch (error) {
      errors.push(`${station.stationId}/${station.stationSeq}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
  const rows = arrivalResults.flat().map((row, index) => ({ ...row, id: rowId(now, startIndex + index) }));
  const inserted = await insertSeatRows(rows);
  return {
    route: routeName,
    stations: stations.length,
    serviceStations: serviceStations.length,
    checked: selectedStations.length,
    inserted,
    rows,
    errors,
  };
}

export async function collectOnce() {
  const now = new Date();
  let nextIndex = 1;
  const routeResults: RouteResult[] = [];
  let totalInserted = 0;

  for (const [routeName, routeId] of Object.entries(routes) as [RouteName, string][]) {
    const result = await collectRoute(routeName, routeId, now, nextIndex);
    nextIndex += Math.max(result.rows.length, 100);
    totalInserted += result.inserted;
    routeResults.push({
      route: result.route,
      stations: result.stations,
      serviceStations: result.serviceStations,
      checked: result.checked,
      inserted: result.inserted,
      errors: result.errors,
      skipped: result.skipped,
    });
  }

  const anyInService = (Object.keys(routes) as RouteName[]).some((routeName) => isWithinServiceWindow(routeName, now));
  const weather = anyInService ? await collectWeather(now, nextIndex + 1000) : { inserted: 0, errors: [] };

  return {
    collectedAt: seoulIso(now),
    totalInserted,
    weatherInserted: weather.inserted,
    routes: routeResults,
    weatherErrors: weather.errors,
  };
}
