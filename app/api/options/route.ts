import { NextRequest, NextResponse } from "next/server";
import { getPublicRouteOptions } from "@/lib/public-routes";
import catalog from "@/config/route-catalog.json";

const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

export async function GET(request: NextRequest) {
  try {
    const routeOptions = await getPublicRouteOptions();
    const publicRoutes = routeOptions.map(r => r.name);
    const selected = request.nextUrl.searchParams.get("route");
    if (selected && !publicRoutes.includes(selected)) {
      return NextResponse.json({ error: "공개된 버스를 선택해 주세요." }, { status: 400 });
    }
    const stations = selected ? catalog[selected as keyof typeof catalog].stations
      .filter(s => !/\(경유\)|\(미정차\)/.test(s.stationName))
      .map(s => ({ route_name: selected, station_id: s.stationId, station_name: s.stationName, station_seq: Number(s.stationSeq) })) : [];
    if (selected) return NextResponse.json({ stations });
    return NextResponse.json({
      routes: publicRoutes,
      routeOptions,
      weekdays,
      times: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`),
      stations,
      weatherConditions: ["강수없음", "비", "눈"],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
