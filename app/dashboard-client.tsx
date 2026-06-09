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
  weatherAreas: string[];
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
};

type ViewMode = "direct" | "station" | "time" | "weather";

const allValue = "전체";
const tabLabels: { id: ViewMode; label: string }[] = [
  { id: "direct", label: "직접 설정" },
  { id: "station", label: "정류장별 보기" },
  { id: "time", label: "시간대별 보기" },
  { id: "weather", label: "날씨별 보기" },
];

export default function DashboardClient() {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [route, setRoute] = useState(allValue);
  const [weekday, setWeekday] = useState(allValue);
  const [time, setTime] = useState(allValue);
  const [station, setStation] = useState(allValue);
  const [weather, setWeather] = useState(allValue);
  const [activeView, setActiveView] = useState<ViewMode>("station");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredStations = useMemo(() => {
    if (!options) return [];
    return options.stations.filter((item) => route === allValue || item.route_name === route);
  }, [options, route]);

  const weatherOptions = useMemo(() => {
    if (!options) return [];
    return [...options.weatherConditions, ...options.weatherAreas];
  }, [options]);

  const fetchStats = async (nextRoute = route) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (nextRoute !== allValue) params.set("route", nextRoute);
    if (weekday !== allValue) params.set("weekday", weekday);
    if (time !== allValue) params.set("time", time);
    if (station !== allValue) params.set("station", station);
    if (weather !== allValue) params.set("weather", weather);

    const response = await fetch(`/api/stats?${params.toString()}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "통계를 불러오지 못했습니다.");
    }
    setStats(body);
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/options", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "선택지를 불러오지 못했습니다.");
        if (ignore) return;

        setOptions(body);
        const firstRoute = body.routes?.[0] ?? allValue;
        setRoute(firstRoute);

        const params = new URLSearchParams();
        if (firstRoute !== allValue) params.set("route", firstRoute);
        const statsResponse = await fetch(`/api/stats?${params.toString()}`, { cache: "no-store" });
        const statsBody = await statsResponse.json();
        if (!statsResponse.ok) throw new Error(statsBody.error ?? "통계를 불러오지 못했습니다.");
        if (!ignore) setStats(statsBody);
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
      await fetchStats();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    }
  };

  const chooseRoute = async (nextRoute: string) => {
    setRoute(nextRoute);
    setStation(allValue);
    try {
      await fetchStats(nextRoute);
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
        <h2>버스번호, 요일, 시간, 정류장, 날씨를 고르면 과거 좌석 데이터를 통계로 보여줍니다.</h2>
        <p>
          고르지 않은 조건은 비교 항목으로 남겨서 노선별, 정류장별, 시간대별, 날씨별 차이를 함께 볼 수 있습니다.
        </p>
      </section>

      <section className="workspace">
        <aside className="filterPanel">
          <div className="sectionHead compact">
            <div>
              <p className="eyebrow">직접 설정</p>
              <h2>조회 조건</h2>
            </div>
          </div>
          <form onSubmit={submit}>
            <Filter label="버스번호" options={[allValue, ...(options?.routes ?? [])]} value={route} onChange={setRoute} />
            <Filter label="요일" options={[allValue, ...(options?.weekdays ?? [])]} value={weekday} onChange={setWeekday} />
            <Filter label="시간" options={[allValue, ...(options?.times ?? [])]} value={time} onChange={setTime} />
            <Filter
              label="정류장"
              options={[allValue, ...filteredStations.map((item) => item.station_name)]}
              value={station}
              onChange={setStation}
            />
            <Filter label="날씨" options={[allValue, ...weatherOptions]} value={weather} onChange={setWeather} />
            <button className="primaryButton" type="submit" disabled={loading}>
              {loading ? "불러오는 중" : "통계 조회"}
            </button>
          </form>
          <p className="helperText">
            예를 들어 날씨를 전체로 두면 아래 날씨별 보기에서 강수 여부나 지역별 좌석 차이가 비교됩니다.
          </p>
        </aside>

        <section className="results">
          <nav className="tabs" aria-label="보기 모드">
            {tabLabels.map((tab) => (
              <button className={activeView === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveView(tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>

          {error ? <div className="errorBox">{error}</div> : null}
          {!error && !loading && Number(stats?.summary?.sample_count ?? 0) === 0 ? (
            <div className="emptyState">조건에 맞는 수집 데이터가 아직 없습니다.</div>
          ) : null}

          {stats ? (
            <>
              {activeView === "direct" ? <DirectSummary summary={stats.summary} byRoute={stats.byRoute} byWeekday={stats.byWeekday} /> : null}
              {activeView === "station" ? (
                <StationView rows={stats.byStation} routes={options?.routes ?? []} selectedRoute={route} onChooseRoute={chooseRoute} />
              ) : null}
              {activeView === "time" ? (
                <AnalysisTable
                  title="시간대별 보기"
                  description="선택한 조건에서 시간대별 평균 잔여좌석과 만차확률을 보여줍니다."
                  columns={["시간", "평균 잔여좌석", "최소", "만차확률", "표본"]}
                  rows={stats.byTime.map(rowToCells)}
                />
              ) : null}
              {activeView === "weather" ? (
                <AnalysisTable
                  title="날씨별 보기"
                  description="선택한 조건에서 날씨 조건별 평균 잔여좌석과 만차확률을 비교합니다."
                  columns={["날씨", "평균 잔여좌석", "최소", "만차확률", "표본"]}
                  rows={stats.byWeather.map(rowToCells)}
                />
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
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

function DirectSummary({ summary, byRoute, byWeekday }: { summary: Summary; byRoute: GroupRow[]; byWeekday: GroupRow[] }) {
  return (
    <>
      <section className="panel noTopPadding">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">직접 설정 결과</p>
            <h2>선택 조건 요약</h2>
          </div>
          <p>{dateRange(summary.first_collected_at, summary.last_collected_at)}</p>
        </div>
        <div className="summaryStrip">
          <Metric label="표본" value={`${summary.sample_count ?? "0"}건`} />
          <Metric label="평균 잔여좌석" value={seatText(summary.avg_seat)} />
          <Metric label="만차확률" value={`${summary.full_probability ?? "0"}%`} />
          <Metric label="평균 도착예정" value={etaText(summary.avg_eta_seconds)} />
        </div>
      </section>
      <div className="splitGrid">
        <AnalysisTable
          title="버스별 비교"
          description="버스번호를 전체로 둔 경우 노선별 차이를 확인합니다."
          columns={["버스", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byRoute.map(rowToCells)}
        />
        <AnalysisTable
          title="요일별 비교"
          description="요일을 전체로 둔 경우 요일별 패턴을 확인합니다."
          columns={["요일", "평균 잔여좌석", "최소", "만차확률", "표본"]}
          rows={byWeekday.map(rowToCells)}
        />
      </div>
    </>
  );
}

function StationView({
  rows,
  routes,
  selectedRoute,
  onChooseRoute,
}: {
  rows: GroupRow[];
  routes: string[];
  selectedRoute: string;
  onChooseRoute: (route: string) => void;
}) {
  return (
    <section className="panel routePanel">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">정류장별 보기</p>
          <h2>{selectedRoute === allValue ? "전체 노선" : selectedRoute} 정류장 순서와 좌석 통계</h2>
        </div>
        <p>노선 버튼을 누르면 해당 버스만 필터링하고, 정류장 순서대로 평균 좌석과 만차확률을 표시합니다.</p>
      </div>
      <div className="routeChips">
        {[allValue, ...routes].map((item) => (
          <button className={item === selectedRoute ? "selected" : ""} key={item} onClick={() => onChooseRoute(item)}>
            {item}
          </button>
        ))}
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
