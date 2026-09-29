import { NextResponse } from "next/server";
import { publicRoutes } from "@/lib/public-routes";
import catalog from "@/config/route-catalog.json";

const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

export async function GET() {
  try {
    return NextResponse.json({
      routes: publicRoutes,
      weekdays,
      times: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`),
      stations: publicRoutes.flatMap(route => {
        const metadata = catalog[route as keyof typeof catalog];
        return metadata.stations.filter(s => !/\(경유\)|\(미정차\)/.test(s.stationName)).map(s => ({
          route_name: route, station_id: s.stationId, station_name: s.stationName, station_seq: Number(s.stationSeq),
        }));
      }),
      weatherConditions: ["강수없음", "비", "눈"],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
