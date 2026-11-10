"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import type { RouteOption } from "@/lib/public-routes";

type RankedRoute = { route_name: string; probability: number; full: number; samples: number; days: number; first_date: string; last_date: string; route: RouteOption };
type Rankings = { rankings: Record<string, RankedRoute[]>; updatedAt: string };

export default function CrowdingTopTen({ onSelect, favorites, toggleFavorite }: {
  onSelect: (route: string, day: string) => void; favorites: string[]; toggleFavorite: (route: string) => void;
}) {
  const [day, setDay] = useState("전체");
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/api/rankings", { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<Rankings>; })
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  const rows = data?.rankings[day] ?? [];
  return <section className="crowdingRanking" aria-label="만차 관측 TOP 10">
    <div className="rankingHeading"><div><p className="eyebrow">최근 30일</p><h2>만차 관측 TOP 10</h2></div><span>만차 비율순</span></div>
    <div className="rankingDayFilter" aria-label="순위 요일 조건">{["전체", "평일", "주말"].map(v => <button type="button" key={v} aria-pressed={day === v} onClick={() => setDay(v)}>{v}</button>)}</div>
    {error ? <p role="alert">순위를 불러오지 못했습니다. <button type="button" onClick={() => setRetry(n => n+1)}>다시 시도</button></p> : !data ? <p role="status">혼잡 노선 확인 중…</p> : !rows.length ? <p className="rankingEmpty">이 조건은 순위를 비교할 표본이 아직 부족합니다.</p> : <ol className="rankingList">
      {rows.map((r, i) => <li key={r.route_name}>
        <button type="button" className="rankingRoute" aria-label={`${i+1}위 ${r.route_name} 노선 분석`} onClick={() => onSelect(r.route_name, day)}>
          <span className="rankingNumber">{String(i+1).padStart(2,"0")}</span>
          <span className="rankingRouteInfo"><strong>{r.route_name}</strong><span>{r.route.start} ↔ {r.route.end}</span><small>{r.days}일 · {r.samples.toLocaleString("ko-KR")}건 중 만차 {r.full.toLocaleString("ko-KR")}건</small></span>
          <span className="rankingRate"><strong>{r.probability.toFixed(1)}<small>%</small></strong><span className="rankingBar"><span style={{ width: `${r.probability}%` }} /></span></span>
          <ArrowRight className="rankingArrow" size={16} />
        </button>
        <button type="button" className={`favoriteButton ${favorites.includes(r.route_name) ? "isFavorite" : ""}`} title="즐겨찾기" aria-label={`순위 ${r.route_name} 즐겨찾기 ${favorites.includes(r.route_name) ? "해제" : "등록"}`} aria-pressed={favorites.includes(r.route_name)} onClick={() => toggleFavorite(r.route_name)}><Star size={18} fill={favorites.includes(r.route_name) ? "currentColor" : "none"} /></button>
      </li>)}
    </ol>}
    <details className="rankingMethod"><summary>순위 기준</summary><p>최근 30일의 정류장 관측 중 잔여좌석이 0석인 비율입니다. 3일 이상·300건 이상 관측되고 최근 7일 내 기록이 있는 공개 노선만 비교합니다. 평일은 월~금, 주말은 토·일입니다.</p><p>노선마다 수집한 정류장과 시간대가 달라 실제 노선 전체의 혼잡 순위와 다를 수 있습니다. 실시간 좌석이나 탑승 실패 확률을 뜻하지 않습니다.</p>{data ? <p>갱신: {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.updatedAt))}</p> : null}</details>
  </section>;
}
