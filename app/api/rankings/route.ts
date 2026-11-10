import { NextResponse } from "next/server";
import { getCrowdingRankings } from "@/lib/crowding-ranking";

export async function GET() {
  try {
    return NextResponse.json(await getCrowdingRankings(), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return NextResponse.json({ error: "혼잡 순위를 불러오지 못했습니다." }, { status: 503 });
  }
}
