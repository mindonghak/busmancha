"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import RouteAnalysis from "./route-analysis";

type StationOption = {
  route_name: string;
  station_id: string;
  station_name: string;
  station_seq: number;
};

type OptionsResponse = {
  routes: string[];
  weekdays: string[];
  times: string[];
  stations: StationOption[];
  weatherConditions: string[];
};

type Summary = {
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
  service_days?: string;
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

type StatsResponse = {
  dataSource?: "near_stop" | "historical";
  routeProfile: { direction: string; destination: string; stops: { seq: number; name: string; stats: GroupRow | null }[] } | null;
  nearbyTimes: GroupRow[];
  summary: Summary;
  byRoute: GroupRow[];
  byStation: GroupRow[];
  byTime: GroupRow[];
  byWeekday: GroupRow[];
  byWeather: GroupRow[];
  byTemperature: GroupRow[];
  filteredByStation: GroupRow[];
  hotspots: HotspotRow[];
};

type MainTab = "search" | "analysis";
type AnalysisMode = "station" | "time" | "weekday" | "weather";
type WeatherAnalysisMode = "precipitation" | "temperature";
type SearchResultMode = "summary" | "station" | "time" | "weekday" | "weather";

const allValue = "전체";
const dayTypeOptions = ["전체", "평일", "주말"];
const mainTabs: { id: MainTab; label: string }[] = [
  { id: "search", label: "내 탑승 조건" },
  { id: "analysis", label: "노선 혼잡도" },
];
const analysisTabs: { id: AnalysisMode; label: string }[] = [
  { id: "station", label: "정류장별" },
  { id: "time", label: "시간대별" },
  { id: "weekday", label: "요일별" },
  { id: "weather", label: "날씨별" },
];

export default function DashboardClient() {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [searchStats, setSearchStats] = useState<StatsResponse | null>(null);
  const [route, setRoute] = useState("");
  const [weekday, setWeekday] = useState(allValue);
  const [time, setTime] = useState(allValue);
  const [station, setStation] = useState(allValue);
  const [weather, setWeather] = useState(allValue);
  const [days, setDays] = useState("");
  const [searchConditions, setSearchConditions] = useState({ route: "", weekday: allValue, time: allValue, station: allValue, weather: allValue });
  const [activeTab, setActiveTab] = useState<MainTab>("search");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredStations = useMemo(() => {
    if (!options) return [];
    return options.stations.filter((item) => item.route_name === route);
  }, [options, route]);

  const fetchSearchStats = async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (!route) throw new Error("버스번호를 선택해 주세요.");
    params.set("route", route);
    if (days) params.set("days", days);
    if (["평일", "주말"].includes(weekday)) params.set("dayType", weekday);
    else if (weekday !== allValue) params.set("weekday", weekday);
    if (time !== allValue) params.set("time", time);
    if (station !== allValue) params.set("stationSeq", station);
    if (weather !== allValue) params.set("weather", weather);

    const body = await fetchJson<StatsResponse>(`/api/stats?${params.toString()}`);
    setSearchStats(body);
    const stationLabel = filteredStations.find((item) => String(item.station_seq) === station);
    setSearchConditions({ route, weekday, time, station: stationLabel ? `${stationLabel.station_seq}. ${stationLabel.station_name}` : allValue, weather });
    trackEvent("search_submit", {
      tab: "search",
      route_name: route,
      weekday,
      time_value: time,
      station_name: station,
      weather,
    });
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setLoading(true);
        const body = await fetchJson<OptionsResponse>("/api/options");
        if (ignore) return;

        setOptions(body);
        trackEvent("page_view", { tab: "search" });
        if (!ignore) {
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (station !== allValue && !filteredStations.some((item) => String(item.station_seq) === station)) {
      setStation(allValue);
    }
  }, [filteredStations, station]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await fetchSearchStats();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>버스만차</h1>
        </div>
      </header>

      <nav className="tabs mainTabs topTabs" aria-label="상단 탭">
        {mainTabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              trackEvent("tab_view", { tab: tab.id });
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <div className="errorBox">{error}</div> : null}

      {activeTab === "search" ? (
        <section className="workspace">
          <aside className="filterPanel">
            <div className="sectionHead compact">
              <div>
                <p className="eyebrow">내 탑승 조건</p>
                <h2>어디서, 언제 타시나요?</h2>
              </div>
            </div>
            <form onSubmit={submit}>
              <Filter label="버스번호" options={["", ...(options?.routes ?? [])]} value={route} onChange={setRoute} />
              <label><span>타는 정류장</span><select aria-label="타는 정류장" value={station} disabled={!route} onChange={(event) => setStation(event.target.value)}>
                <option value={allValue}>전체 정류장</option>
                {filteredStations.map((item) => <option key={`${item.station_id}-${item.station_seq}`} value={String(item.station_seq)}>{item.station_seq}. {item.station_name}</option>)}
              </select></label>
              <Filter label="요일" options={[allValue, "평일", "주말", ...(options?.weekdays ?? [])]} value={weekday} onChange={setWeekday} />
              <Filter label="시간" options={[allValue, ...(options?.times ?? [])]} value={time} onChange={setTime} />
              <details className="extraFilters"><summary>추가 조건 · {weather === allValue ? "모든 날씨" : weather} · {days ? `최근 ${days}일` : "전체 기간"}</summary>
              <Filter label="날씨" options={[allValue, ...(options?.weatherConditions ?? [])]} value={weather} onChange={setWeather} />
              <PeriodFilter value={days} onChange={setDays} />
              </details>
              <button className="primaryButton" type="submit" disabled={loading || !route}>
                {loading ? "조회 중" : "만차 기록 확인"}
              </button>
            </form>
          </aside>

          <section className="results">
            {!error && !loading && searchStats && Number(searchStats.summary?.sample_count ?? 0) === 0 ? (
              <div className="emptyState">조건에 맞는 기록이 없습니다. 날씨나 요일 조건을 넓히거나 조회 기간을 바꿔보세요.</div>
            ) : null}
            {!searchStats && !loading ? (
              <div className="searchPlaceholder"><p className="eyebrow">과거 탑승 여건</p><h2>내 정류장의 만차 기록</h2><div className="placeholderMetrics"><span>만차 관측 비율 <strong>— %</strong></span><span>평균 잔여좌석 <strong>— 석</strong></span></div></div>
            ) : null}
            {searchStats ? (
              <SearchResult
                nearbyTimes={searchStats.nearbyTimes ?? []}
                summary={searchStats.summary}
                dataSource={searchStats.dataSource}
                byTime={searchStats.byTime}
                byWeekday={searchStats.byWeekday}
                byWeather={searchStats.byWeather}
                byStation={searchStats.filteredByStation}
                {...searchConditions}
              />
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "analysis" ? <RouteAnalysis routes={options?.routes ?? []} /> : null}

    </main>
  );
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(response.status >= 500 ? "데이터에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요." : (body.error ?? "데이터를 불러오지 못했습니다."));
  }
  return body as T;
}

function trackEvent(eventName: string, payload: Record<string, string | null | undefined> = {}) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    event_name: eventName,
    path: window.location.pathname,
    ...payload,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/events", blob);
    return;
  }

  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics should never interrupt the page flow.
  });
}

function Filter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{label === "시간" && option !== allValue ? hourRange(option) : (option || "선택")}</option>
        ))}
      </select>
    </label>
  );
}

function SearchResult({
  nearbyTimes,
  summary,
  dataSource,
  byTime,
  byWeekday,
  byWeather,
  byStation,
  route,
  weekday,
  time,
  station,
  weather,
}: {
  nearbyTimes: GroupRow[];
  summary: Summary;
  dataSource?: "near_stop" | "historical";
  byTime: GroupRow[];
  byWeekday: GroupRow[];
  byWeather: GroupRow[];
  byStation: GroupRow[];
  route: string;
  weekday: string;
  time: string;
  station: string;
  weather: string;
}) {
  const resultModes = useMemo(() => {
    const modes: { id: SearchResultMode; label: string }[] = [{ id: "summary", label: "전체 통계" }];
    if (station === allValue) modes.push({ id: "station", label: "정류장별" });
    if (time === allValue) modes.push({ id: "time", label: "시간대별" });
    if (weekday === allValue) modes.push({ id: "weekday", label: "요일별" });
    if (weather === allValue) modes.push({ id: "weather", label: "날씨별" });
    return modes;
  }, [station, time, weekday, weather]);
  const [mode, setMode] = useState<SearchResultMode>("summary");

  useEffect(() => {
    if (!resultModes.some((item) => item.id === mode)) {
      setMode("summary");
    }
  }, [mode, resultModes]);

  return (
    <>
      {dataSource === "historical" ? <div className="noticeBox">이 조건은 새 수집 기준 표본이 없어 과거 수집 기록으로 보여드립니다. 참고용으로 확인해 주세요.</div> : null}
      <BoardingOutcome summary={summary} route={route} station={station} time={time} weekday={weekday} />
      {station !== allValue && time !== allValue ? <NearbyTimes rows={nearbyTimes} selectedTime={time} /> : null}
      <section className="panel noTopPadding">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">검색 결과</p>
            <h2>{route} 상세 통계</h2>
          </div>
          <p>{dateRange(summary.first_collected_at, summary.last_collected_at)}</p>
        </div>
        <div className="querySummary">
          <span>요일: {weekday}</span>
          <span>시간: {time === allValue ? time : hourRange(time)}</span>
          <span>정류장: {station}</span>
          <span>날씨: {weather}</span>
        </div>
        <nav className="subTabs resultTabs" aria-label="검색 결과 보기">
          {resultModes.map((item) => (
            <button className={mode === item.id ? "active" : ""} key={item.id} onClick={() => setMode(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </section>

      {mode === "summary" ? (
        <section className="panel tablePanel">
          <div className="sectionHead compact">
            <div>
              <p className="eyebrow">전체 통계</p>
              <h2>선택 조건 전체 통계값</h2>
            </div>
          </div>
          <div className="summaryStrip">
            <Metric label="표본" value={`${summary.sample_count ?? "0"}건`} />
            <Metric label="평균 잔여좌석" value={seatText(summary.avg_seat)} />
            <Metric label="만차확률" value={summary.full_probability === null ? "-" : `${summary.full_probability}%`} />
            <Metric label="수집 일수" value={`${summary.service_days}일`} />
          </div>
        </section>
      ) : null}

      {mode === "station" ? (
        <AnalysisTable
          title="정류장별 결과"
          description="선택한 조건을 모두 반영한 정류장별 결과입니다. 정류장을 전체로 두면 해당 버스의 정류장이 모두 표시됩니다."
          columns={["정류장", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byStation.map(rowToCells)}
        />
      ) : null}
      {mode === "time" ? (
        <AnalysisTable
          title="시간대별 결과"
          description="시간을 전체로 둔 검색 결과를 시간대별로 나누어 보여줍니다."
          columns={["시간", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byTime.map(rowToCells)}
        />
      ) : null}
      {mode === "weekday" ? (
        <AnalysisTable
          title="요일별 결과"
          description="요일을 전체로 둔 검색 결과를 요일별로 나누어 보여줍니다."
          columns={["요일", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byWeekday.map(rowToCells)}
        />
      ) : null}
      {mode === "weather" ? (
        <AnalysisTable
          title="날씨별 결과"
          description="날씨를 전체로 둔 검색 결과를 강남 기준 날씨별로 나누어 보여줍니다."
          columns={["날씨", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byWeather.map(rowToCells)}
        />
      ) : null}
    </>
  );
}

function AnalysisView({
  mode,
  onModeChange,
  stats,
  route,
}: {
  mode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  stats: StatsResponse;
  route: string;
}) {
  const [weatherMode, setWeatherMode] = useState<WeatherAnalysisMode>("precipitation");

  return (
    <section className="analysisResults">
      <DataCoverage summary={stats.summary} />
      <nav className="subTabs" aria-label="분석 종류">
        {analysisTabs.map((tab) => (
          <button className={mode === tab.id ? "active" : ""} key={tab.id} onClick={() => onModeChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      {mode === "station" ? stats.routeProfile ? <RouteProgress profile={stats.routeProfile} /> : <><p className="emptyState">시간대를 정하면 노선 순서에 따른 만차 관측 구간을 확인할 수 있습니다.</p><StationView rows={stats.byStation} selectedRoute={route} /></> : null}
      {mode === "time" ? (
        <AnalysisTable
          title={`${route} 시간대별 보기`}
          description="선택한 버스에서 시간대별 평균 잔여좌석과 만차확률을 보여줍니다."
          columns={["시간", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={stats.byTime.map(rowToCells)}
        />
      ) : null}
      {mode === "weekday" ? (
        <AnalysisTable
          title={`${route} 요일별 보기`}
          description="선택한 버스에서 요일별 평균 잔여좌석과 만차확률을 비교합니다."
          columns={["요일", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={stats.byWeekday.map(rowToCells)}
        />
      ) : null}
      {mode === "weather" ? (
        <>
          <nav className="subTabs compactTabs" aria-label="날씨 분석 종류">
            <button className={weatherMode === "precipitation" ? "active" : ""} onClick={() => setWeatherMode("precipitation")}>
              일별 날씨
            </button>
            <button className={weatherMode === "temperature" ? "active" : ""} onClick={() => setWeatherMode("temperature")}>
              온도 구간
            </button>
          </nav>
          {weatherMode === "precipitation" ? (
            <AnalysisTable
              title={`${route} 날씨별 보기`}
              description="강남 기준 그날의 대표 날씨별 평균 잔여좌석과 만차확률을 비교합니다."
              columns={["날씨", "평균 잔여좌석", "최소", "만차확률", "표본"]}
              rows={stats.byWeather.map(rowToCells)}
            />
          ) : null}
          {weatherMode === "temperature" ? (
            <AnalysisTable
              title={`${route} 온도별 보기`}
              description="강남에서 수집된 기온 중 일별 최댓값 기준입니다. 수집 공백이 있어 실제 일 최고기온과 다를 수 있습니다."
              columns={["온도", "평균 잔여좌석", "최소", "만차확률", "표본"]}
              rows={stats.byTemperature.map(rowToCells)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StationView({ rows, selectedRoute }: { rows: GroupRow[]; selectedRoute: string }) {
  return (
    <section className="panel routePanel">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">정류장별 보기</p>
          <h2>{selectedRoute} 정류장 순서와 좌석 통계</h2>
        </div>
        <p>선택한 버스를 기준으로 정류장 순서대로 평균 좌석과 만차확률을 표시합니다.</p>
      </div>
      <div className="routeLine">
        {rows.map((row) => {
          const [seq, ...nameParts] = row.label.split(". ");
          return (
            <article className="stop" key={row.label}>
              <div className="marker">{seq}</div>
              <div className="stopBody">
                <div>
                  <strong>{nameParts.join(". ") || row.label}</strong>
                  <span>표본 {row.sample_count}건</span>
                </div>
                <dl>
                  <div>
                    <dt>평균</dt>
                    <dd>{seatText(row.avg_seat)}</dd>
                  </div>
                  <div>
                    <dt>최소</dt>
                    <dd>{row.min_seat ?? "-"}석</dd>
                  </div>
                  <div>
                    <dt>만차확률</dt>
                    <dd>{row.full_probability ?? "0"}%</dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RouteProgress({ profile }: { profile: NonNullable<StatsResponse["routeProfile"]> }) {
  const enough = (row: GroupRow | null) => !!row && Number(row.sample_count) >= 30 && Number(row.service_days) >= 3;
  const first = profile.stops.find((stop) => enough(stop.stats) && Number(stop.stats!.full_probability) >= 50);
  return <section className="routeProgress">
    <p className="eyebrow">{profile.destination} 방면 · 노선 순서</p>
    <h2>{first ? `${first.name}에서 처음 50% 이상 관측` : "만차가 잦아지는 시작점을 아직 특정하기 어렵습니다"}</h2>
    <p className="outcomeCaution">30건·3일 이상 관측된 정류장 중 만차 비율 50% 이상인 첫 지점입니다. 정류장별로 서로 다른 차량의 도착정보를 집계했으므로 실제 한 차량이 여기서 만차가 됐다는 뜻은 아닙니다. 중간에 하차하면 이후 비율은 낮아질 수 있습니다.</p>
    <div className="progressLegend"><span>관측 50% 이상</span><span>관측 50% 미만</span><span>표본 부족 / 미수집</span></div>
    <ol className="progressStops">{profile.stops.map((stop) => {
      const valid = enough(stop.stats);
      const rate = Number(stop.stats?.full_probability ?? 0);
      return <li key={stop.seq} className={!valid ? "unknownStop" : rate >= 50 ? "fullStop" : "measuredStop"}>
        <span className="progressMarker">{stop.seq}</span>
        <div className="progressBody"><strong>{stop.name}</strong>
          <div className="progressTrack" role="img" aria-label={valid ? `만차 관측 ${rate}%` : "판단 자료 부족"}><span style={{width: valid ? `${rate}%` : "0%"}} /></div>
          <small>{stop.stats ? `${stop.stats.service_days}일 · ${stop.stats.sample_count}건` : "수집 기록 없음"}</small>
        </div>
        <div className="progressValue"><strong>{valid ? `${rate}%` : "—"}</strong><small>{valid ? `평균 ${seatText(stop.stats!.avg_seat)}` : "판단 보류"}</small></div>
      </li>;
    })}</ol>
    <p className="outcomeCaution">회색 정류장은 여유 좌석이 있다는 뜻이 아닙니다. 회차 전후를 구분했으며, API의 현재 정류장 순서 기준입니다.</p>
  </section>;
}

function AnalysisTable({
  title,
  description,
  columns,
  rows,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <section className="panel tablePanel">
      <div className="sectionHead compact">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={columns.length}>조건에 맞는 표본이 없습니다.</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.join("-")}>
                {row.map((cell, index) => (
                  <td key={`${cell}-${index}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function hourRange(value: string) {
  const hour = Number.parseInt(value, 10);
  return Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59` : value;
}

function BoardingOutcome({ summary, route, station, time, weekday }: { summary: Summary; route: string; station: string; time: string; weekday: string }) {
  const count = Number(summary.sample_count);
  const limited = count < 30 || Number(summary.service_days) < 3;
  const probability = Number(summary.full_probability ?? 0);
  const stale = !!summary.last_collected_at && Date.now() - new Date(summary.last_collected_at).getTime() > 36 * 3600000;
  const broad = station === allValue || time === allValue;
  const title = !count ? "아직 판단할 기록이 없어요" : limited ? "판단할 표본이 부족해요" : stale ? "최근 탑승 여건은 확인이 필요해요" : broad ? "선택한 범위의 만차 기록" : probability >= 50 ? "과거 관측의 절반 이상이 만차였어요" : probability > 0 ? "만차가 관측된 적이 있어요" : "수집된 기록에서 만차는 없었어요";
  return <section className="boardingOutcome" aria-label="탑승 조건 결과">
    <p className="eyebrow">{route} · {station === allValue ? "전체 정류장" : station}</p>
    <p className="tripContext">{weekday === allValue ? "모든 요일" : weekday} · {time === allValue ? "모든 시간대" : hourRange(time)}</p>
    <h2>{title}</h2>
    <div className="outcomeMetrics"><div><span>과거 만차 관측 비율</span><strong>{count ? `${summary.full_probability}%` : "—"}</strong><small>{count ? `${count.toLocaleString("ko-KR")}건 중 ${Number(summary.full_count).toLocaleString("ko-KR")}건 만차` : "관측 없음"}</small></div><div><span>평균 잔여좌석</span><strong>{seatText(summary.avg_seat)}</strong><small>{summary.service_days}일 동안의 기록</small></div></div>
    {count > 0 ? <div className="probabilityTrack" role="img" aria-label={`과거 만차 비율 ${probability}%`}><span style={{ width: `${probability}%` }} /></div> : null}
    <p className="outcomeCaution">{broad ? "전체 정류장·시간을 합친 통계는 특정 탑승 상황과 다를 수 있습니다. " : ""}실시간 좌석이나 탑승 보장 확률이 아닙니다.</p>
    <DataCoverage summary={summary} />
  </section>;
}

function NearbyTimes({ rows, selectedTime }: { rows: GroupRow[]; selectedTime: string }) {
  const hour = Number.parseInt(selectedTime, 10);
  const hours = Array.from({ length: 5 }, (_, index) => hour + index - 2).filter((value) => value >= 0 && value <= 23);
  return <section className="nearbyTimes" aria-label="앞뒤 시간대 비교"><h3>같은 정류장, 앞뒤 시간대</h3><div className="hourComparison">
    {hours.map((value) => {
      const row = rows.find((item) => Number.parseInt(item.label, 10) === value);
      const limited = !row || Number(row.sample_count) < 30 || Number(row.service_days) < 3;
      return <div key={value} className={`hourColumn ${value === hour ? "selectedHour" : ""}`}>
        <span>{String(value).padStart(2, "0")}시</span>
        <small className="comparisonLabel">{value === hour ? "선택 시간" : " "}</small>
        <strong>{row ? `${row.full_probability}%` : "—"}</strong>
        <small>{row ? `${row.service_days}일 · ${row.sample_count}건` : "기록 없음"}</small>
        <small>{row ? limited ? "표본 부족" : "만차 관측 비율" : "비교 불가"}</small>
      </div>;
    })}
  </div><p className="outcomeCaution">시간대만 바꾸고 요일·날씨·조회 기간은 같은 조건으로 비교합니다.</p></section>;
}

function rowToCells(row: GroupRow) {
  return [row.label, seatText(row.avg_seat), `${row.min_seat ?? "-"}석`, `${row.full_probability ?? "0"}%`, `${row.sample_count}건`];
}

function riskClass(value: string | null) {
  const probability = Number(value ?? 0);
  if (probability >= 70) return "riskHigh";
  if (probability >= 35) return "riskMedium";
  return "riskLow";
}

function seatText(value: string | null) {
  return value === null ? "-" : `${value}석`;
}

function etaText(value: string | null) {
  if (value === null) return "-";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "-";
  return `${Math.round(seconds / 60)}분`;
}

function dateRange(start: string | null, end: string | null) {
  if (!start || !end) return "수집 데이터 범위가 아직 없습니다.";
  return `${formatDateTime(start)} ~ ${formatDateTime(end)} 수집`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PeriodFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label><span>조회 기간</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">전체 기간</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option>
  </select></label>;
}

function DataCoverage({ summary }: { summary: Summary }) {
  const count = Number(summary.sample_count);
  const days = Number(summary.service_days);
  const stale = summary.last_collected_at && Date.now() - new Date(summary.last_collected_at).getTime() > 36 * 60 * 60 * 1000;
  return <div className="coverage" role="status">
    <span>실제 수집 {days}일 · 관측 {count.toLocaleString("ko-KR")}건</span>
    <span>{dateRange(summary.first_collected_at, summary.last_collected_at)}</span>
    {count > 0 && (days < 3 || count < 30) ? <strong>표본 부족 · 장기적인 패턴으로 판단하기 어렵습니다.</strong> : null}
    {stale ? <strong>최근 36시간 내 관측이 없는 결과입니다.</strong> : null}
    <small>도착 상태 또는 직전 정류장 출발 좌석을 확인한 운행 중 0석의 비율입니다. 정류장별 한 운행을 1건으로 셉니다.</small>
  </div>;
}
