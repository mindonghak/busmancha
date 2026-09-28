"use client";

import { useEffect, useRef, useState } from "react";

type Stop = { seq: number; name: string; direction: string };
type Hour = { seq: number; hour: number; samples: number; days: number; full: number; seats: number; probability: number; first_date: string; last_date: string };
type Data = { stops: Stop[]; rows: Hour[] };

export default function RouteAnalysis({ routes }: { routes: string[] }) {
  const [route, setRoute] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [day, setDay] = useState("전체");
  const [weather, setWeather] = useState("전체");
  const [period, setPeriod] = useState("0");
  const [seq, setSeq] = useState<number | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, { time: number; data: Data }>());

  useEffect(() => {
    setStops([]); setSeq(null);
    if (!route) return;
    const controller = new AbortController();
    fetch(`/api/analysis?route=${encodeURIComponent(route)}&metadata=1`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setStops(d.stops)).catch(() => {});
    return () => controller.abort();
  }, [route, retry]);

  useEffect(() => {
    setData(null); setError("");
    if (!route) return;
    const key = new URLSearchParams({ route, dayType: day, weather, days: period }).toString();
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.time < 60000) { setData(cached.data); return; }
    const controller = new AbortController();
    fetch(`/api/analysis?${key}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<Data>; })
      .then(d => { if (!controller.signal.aborted) { cache.current.set(key, { time: Date.now(), data: d }); setData(d); setStops(d.stops); } })
      .catch(() => { if (!controller.signal.aborted) setError("데이터 연결에 실패했습니다."); });
    return () => controller.abort();
  }, [route, day, weather, period, retry]);

  const visible = stops.filter(s => s.direction === direction);
  const selected = visible.find(s => s.seq === seq);
  const hours = data?.rows.filter(r => r.seq === seq) ?? [];
  const dates = hours.map(r => r.last_date).sort();
  const last = dates.at(-1);
  return <section className="routeAnalysis">
    <div className="routePicker">
      <label>버스번호<select aria-label="분석 버스번호" value={route} onChange={e => { setRoute(e.target.value); setSeq(null); setData(null); setStops([]); }}><option value="">선택</option>{routes.map(r => <option key={r}>{r}</option>)}</select></label>
    </div>
    {!route ? <div className="emptyState">분석할 버스를 선택해 주세요.</div> : <div className="routeAnalysisBody">
      <aside className="routeRail">
        <h2>{route} 노선</h2>
        <div className="railDirections">{[["outbound", "서울 방면"], ["return", "동탄 방면"]].map(([v, label]) => <button key={v} aria-pressed={direction === v} onClick={() => { setDirection(v); setSeq(null); }}>{label}</button>)}</div>
        <ol>{visible.map(s => <li key={s.seq}><button aria-pressed={seq === s.seq} onClick={() => setSeq(s.seq)}><span className="railDot" /><span>{s.name}</span><small>{s.seq}</small></button></li>)}</ol>
      </aside>
      <section className="stationHours" aria-live="polite">
        <details className="analysisOptionalFilters">
          <summary>조건 필터 · {day === "전체" ? "모든 요일" : day} · {weather === "전체" ? "모든 날씨" : weather} · {period === "0" ? "전체 기간" : `최근 ${period}일`}</summary>
          <div className="routeAnalysisFilters">
            <label>요일<select aria-label="분석 요일" value={day} onChange={e => { setData(null); setDay(e.target.value); }}>{["전체", "평일", "주말"].map(v => <option key={v}>{v}</option>)}</select></label>
            <label>하루 날씨 · 강남<select aria-label="분석 날씨" value={weather} onChange={e => { setData(null); setWeather(e.target.value); }}>{["전체", "강수없음", "비", "눈"].map(v => <option key={v}>{v}</option>)}</select></label>
            <label>조회 기간<select aria-label="분석 조회 기간" value={period} onChange={e => { setData(null); setPeriod(e.target.value); }}><option value="0">전체 기간</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label>
          </div>
        </details>
        {!selected ? <div className="emptyState">정류장을 선택해 주세요.</div> : <>
          <p className="eyebrow">{route} · {direction === "outbound" ? "서울 방면" : "동탄 방면"} · {day} · {weather === "전체" ? "모든 날씨" : weather}</p>
          <h2>{selected.name}</h2><h3>시간대별 만차 관측 비율</h3>
          {error ? <p role="alert">{error} <button onClick={() => setRetry(r => r + 1)}>다시 시도</button></p> : !data ? <p role="status">통계를 불러오는 중입니다.</p> : <>
            {hours.length === 0 ? <p>조건에 맞는 관측 기록이 없습니다.</p> : <p className="hourNote">표본 {hours.reduce((n, r) => n + r.samples, 0).toLocaleString()}건 · 마지막 관측일 {last}</p>}
            {last && Date.now() - new Date(`${last}T23:59:59+09:00`).getTime() > 3 * 86400000 ? <p className="hourWarning">최근 3일간 관측이 없는 과거 기록입니다.</p> : null}
            <div className="hourChartScroll"><div className="hourChart" role="img" aria-label="0시부터 23시까지 시간대별 만차 비율. 상세 수치는 아래 표에서 확인할 수 있습니다.">
              <div className="hourAxis"><span>100%</span><span>50%</span><span>0%</span></div>
              {Array.from({ length: 24 }, (_, h) => { const row = hours.find(r => r.hour === h); return <div className="hourColumn" key={h}>
                <div className="hourPlot" title={row ? `${h}시: ${row.probability}%, ${row.samples}건 / ${row.days}일` : `${h}시: 기록 없음`}>
                  {row ? <><span className="hourValue" style={{ top: "auto", bottom: `calc(${row.probability}% + 6px)` }}>{row.probability}%</span><span className={`hourBar ${row.samples < 30 || row.days < 3 ? "sparse" : ""}`} style={{ height: `${Math.max(row.probability, 1)}%` }} /></> : <span className="hourMissing">—</span>}
                </div><span>{String(h).padStart(2, "0")}</span>
              </div>; })}
            </div></div>
            <p className="hourNote">사선: 표본 30건 미만 또는 관측 3일 미만 · —: 기록 없음 · 시간 단위: 시</p>
            <p className="hourNote">실제 탑승 보장 확률이 아닌 수집 기록의 만차 비율입니다. 같은 차량이 반복 관측될 수 있습니다. 평일은 월~금, 주말은 토·일이며 공휴일은 별도 분리하지 않습니다.</p>
            <details><summary>시간대별 표본과 잔여좌석</summary><div className="hourChartScroll"><table className="hourTable"><thead><tr><th>시간</th><th>만차 비율</th><th>평균 잔여좌석</th><th>만차 / 표본</th><th>관측 일수</th></tr></thead><tbody>{hours.map(r => <tr key={r.hour}><td>{r.hour}:00–{r.hour}:59</td><td>{r.probability}%</td><td>{r.seats}석</td><td>{r.full} / {r.samples}</td><td>{r.days}일</td></tr>)}</tbody></table></div></details>
          </>}
        </>}
        {!selected && error ? <p role="alert">{error} <button onClick={() => setRetry(r => r + 1)}>다시 시도</button></p> : null}
      </section>
    </div>}
  </section>;
}
