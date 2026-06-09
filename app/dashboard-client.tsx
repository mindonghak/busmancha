"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  avg_seat: string | null;
  min_seat: number | null;
  full_probability: string | null;
};

type StatsResponse = {
  summary: Summary;
  byRoute: GroupRow[];
  byStation: GroupRow[];
  byTime: GroupRow[];
  byWeekday: GroupRow[];
  byWeather: GroupRow[];
  byTemperature: GroupRow[];
  filteredByStation: GroupRow[];
};

type MainTab = "search" | "analysis";
type AnalysisMode = "station" | "time" | "weekday" | "weather";
type WeatherAnalysisMode = "precipitation" | "temperature";

const allValue = "전체";
const mainTabs: { id: MainTab; label: string }[] = [
  { id: "search", label: "검색" },
  { id: "analysis", label: "분석" },
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
  const [analysisStats, setAnalysisStats] = useState<StatsResponse | null>(null);
  const [route, setRoute] = useState("");
  const [weekday, setWeekday] = useState(allValue);
  const [time, setTime] = useState(allValue);
  const [station, setStation] = useState(allValue);
  const [weather, setWeather] = useState(allValue);
  const [analysisRoute, setAnalysisRoute] = useState("");
  const [activeTab, setActiveTab] = useState<MainTab>("search");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("station");
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
    if (weekday !== allValue) params.set("weekday", weekday);
    if (time !== allValue) params.set("time", time);
    if (station !== allValue) params.set("station", station);
    if (weather !== allValue) params.set("weather", weather);

    const body = await fetchJson<StatsResponse>(`/api/stats?${params.toString()}`);
    setSearchStats(body);
    setActiveTab("search");
    setLoading(false);
  };

  const fetchAnalysisStats = async (nextRoute: string) => {
    if (!nextRoute) return null;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ route: nextRoute });
    return fetchJson<StatsResponse>(`/api/stats?${params.toString()}`);
  };

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setLoading(true);
        const body = await fetchJson<OptionsResponse>("/api/options");
        if (ignore) return;

        setOptions(body);
        const firstRoute = body.routes?.[0] ?? "";
        setRoute(firstRoute);
        setAnalysisRoute(firstRoute);

        const initialAnalysisStats = firstRoute
          ? await fetchJson<StatsResponse>(`/api/stats?route=${encodeURIComponent(firstRoute)}`)
          : null;
        if (!ignore) {
          setAnalysisStats(initialAnalysisStats);
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
    if (station !== allValue && !filteredStations.some((item) => item.station_name === station)) {
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

  const chooseAnalysisRoute = async (nextRoute: string) => {
    try {
      const body = await fetchAnalysisStats(nextRoute);
      if (body) {
        setAnalysisStats(body);
        setAnalysisRoute(nextRoute);
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">광역버스 잔여좌석 통계</p>
          <h1>버스만차</h1>
        </div>
        <div className="status">
          <span className="dot" />
          실제 수집 데이터 조회
        </div>
      </header>

      <section className="heroText">
        <h2>검색은 조건을 직접 좁히고, 분석은 버스별 패턴을 따로 살펴봅니다.</h2>
        <p>날씨 통계는 지역별로 나누지 않고 강남 기준 관측값으로 계산합니다.</p>
      </section>

      <nav className="tabs mainTabs topTabs" aria-label="상단 탭">
        {mainTabs.map((tab) => (
          <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>
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
                <p className="eyebrow">검색 조건</p>
                <h2>직접 고르기</h2>
              </div>
            </div>
            <form onSubmit={submit}>
              <Filter label="버스번호" options={options?.routes ?? []} value={route} onChange={setRoute} />
              <Filter label="요일" options={[allValue, ...(options?.weekdays ?? [])]} value={weekday} onChange={setWeekday} />
              <Filter label="시간" options={[allValue, ...(options?.times ?? [])]} value={time} onChange={setTime} />
              <Filter
                label="정류장"
                options={[allValue, ...filteredStations.map((item) => item.station_name)]}
                value={station}
                onChange={setStation}
              />
              <Filter label="날씨" options={[allValue, ...(options?.weatherConditions ?? [])]} value={weather} onChange={setWeather} />
              <button className="primaryButton" type="submit" disabled={loading}>
                {loading ? "불러오는 중" : "검색"}
              </button>
            </form>
          </aside>

          <section className="results">
            {!error && !loading && searchStats && Number(searchStats.summary?.sample_count ?? 0) === 0 ? (
              <div className="emptyState">조건에 맞는 수집 데이터가 아직 없습니다.</div>
            ) : null}
            {!searchStats && !loading ? (
              <div className="emptyState">검색 조건을 고른 뒤 검색 버튼을 누르면 결과가 표시됩니다.</div>
            ) : null}
            {searchStats ? (
              <SearchResult
                summary={searchStats.summary}
                byStation={searchStats.filteredByStation}
                route={route}
                weekday={weekday}
                time={time}
                station={station}
                weather={weather}
              />
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === "analysis" ? (
        <section className="analysisWorkspace">
          <section className="panel analysisControls">
            <div>
              <p className="eyebrow">분석 조건</p>
              <h2>버스별 분석</h2>
            </div>
            <label>
              <span>버스번호</span>
              <select value={analysisRoute} onChange={(event) => chooseAnalysisRoute(event.target.value)}>
                {(options?.routes ?? []).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </section>

          {analysisStats ? (
            <AnalysisView
              mode={analysisMode}
              onModeChange={setAnalysisMode}
              stats={analysisStats}
              route={analysisRoute}
            />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "데이터를 불러오지 못했습니다.");
  }
  return body as T;
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
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SearchResult({
  summary,
  byStation,
  route,
  weekday,
  time,
  station,
  weather,
}: {
  summary: Summary;
  byStation: GroupRow[];
  route: string;
  weekday: string;
  time: string;
  station: string;
  weather: string;
}) {
  return (
    <>
      <section className="panel noTopPadding">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">검색 결과</p>
            <h2>{route} 좌석 통계</h2>
          </div>
          <p>{dateRange(summary.first_collected_at, summary.last_collected_at)}</p>
        </div>
        <div className="querySummary">
          <span>요일: {weekday}</span>
          <span>시간: {time}</span>
          <span>정류장: {station}</span>
          <span>날씨: {weather}</span>
        </div>
        <div className="summaryStrip">
          <Metric label="표본" value={`${summary.sample_count ?? "0"}건`} />
          <Metric label="평균 잔여좌석" value={seatText(summary.avg_seat)} />
          <Metric label="만차확률" value={`${summary.full_probability ?? "0"}%`} />
          <Metric label="평균 도착예정" value={etaText(summary.avg_eta_seconds)} />
        </div>
      </section>
      <div>
        <AnalysisTable
          title="정류장별 결과"
          description="선택한 조건을 모두 반영한 정류장별 결과입니다. 정류장을 전체로 두면 해당 버스의 정류장이 모두 표시됩니다."
          columns={["정류장", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byStation.map(rowToCells)}
        />
      </div>
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
      <nav className="subTabs" aria-label="분석 종류">
        {analysisTabs.map((tab) => (
          <button className={mode === tab.id ? "active" : ""} key={tab.id} onClick={() => onModeChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      {mode === "station" ? <StationView rows={stats.byStation} selectedRoute={route} /> : null}
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
              비/눈 기준
            </button>
            <button className={weatherMode === "temperature" ? "active" : ""} onClick={() => setWeatherMode("temperature")}>
              온도 구간
            </button>
          </nav>
          {weatherMode === "precipitation" ? (
            <AnalysisTable
              title={`${route} 날씨별 보기`}
              description="강남 기준 비/눈 여부별 평균 잔여좌석과 만차확률을 비교합니다."
              columns={["날씨", "평균 잔여좌석", "최소", "만차확률", "표본"]}
              rows={stats.byWeather.map(rowToCells)}
            />
          ) : null}
          {weatherMode === "temperature" ? (
            <AnalysisTable
              title={`${route} 온도별 보기`}
              description="강남 기준 온도 구간별 평균 잔여좌석과 만차확률을 비교합니다."
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

function rowToCells(row: GroupRow) {
  return [row.label, seatText(row.avg_seat), `${row.min_seat ?? "-"}석`, `${row.full_probability ?? "0"}%`, `${row.sample_count}건`];
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
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
