const summaryStats = [
  { label: "평균 잔여좌석", value: "18.6석", note: "선택 조건 기준" },
  { label: "만차확률", value: "12%", note: "잔여좌석 0석 기준" },
  { label: "중앙값", value: "17석", note: "이상치 영향 완화" },
  { label: "표본 수", value: "4,312행", note: "수집 중" },
];

const filters = [
  { label: "버스번호", value: "M4130" },
  { label: "요일", value: "월요일" },
  { label: "시간", value: "07:30" },
  { label: "정류장", value: "반도3차.금강1차" },
  { label: "날씨", value: "전체" },
];

const stationRows = [
  { station: "호수자이파밀리에.아이원", avg: 34.1, full: "2%", samples: 116 },
  { station: "반도3차.금강1차", avg: 18.6, full: "12%", samples: 98 },
  { station: "한화.린스트라우스", avg: 14.2, full: "19%", samples: 84 },
  { station: "현대트랜시스", avg: 9.8, full: "31%", samples: 72 },
];

const timeRows = [
  { time: "07:00", avg: 28.4, full: "4%" },
  { time: "07:10", avg: 21.7, full: "9%" },
  { time: "07:20", avg: 15.2, full: "17%" },
  { time: "07:30", avg: 8.9, full: "34%" },
  { time: "07:40", avg: 4.1, full: "58%" },
];

const weatherRows = [
  { weather: "맑음", avg: 19.8, full: "10%", sample: "동탄/화성 22.1도" },
  { weather: "흐림", avg: 16.3, full: "18%", sample: "습도 67%" },
  { weather: "비", avg: 10.4, full: "39%", sample: "강수 1mm 이상" },
  { weather: "강풍", avg: 13.7, full: "24%", sample: "풍속 4m/s 이상" },
];

const viewModes = [
  "직접 설정",
  "정류장별 보기",
  "시간대별 보기",
  "날씨별 보기",
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">광역버스 잔여좌석 통계</p>
          <h1>버스만차</h1>
        </div>
        <div className="status">
          <span className="dot" />
          버스 + 날씨 수집 중
        </div>
      </header>

      <section className="hero">
        <div>
          <h2>조건을 고르면 과거 좌석 패턴을 보여주고, 비워둔 조건은 비교표로 펼칩니다.</h2>
          <p>
            버스번호, 요일, 시간, 정류장, 날씨를 조합해 평균 잔여좌석과 만차확률을 조회합니다.
            날씨를 고르지 않으면 날씨별 차이를, 시간을 고르지 않으면 시간대별 차이를 함께 보여줍니다.
          </p>
        </div>
        <div className="metricGrid">
          {summaryStats.map((stat) => (
            <div className="metric" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace">
        <aside className="filterPanel">
          <div className="sectionHead compact">
            <div>
              <p className="eyebrow">직접 설정</p>
              <h2>조회 조건</h2>
            </div>
          </div>
          <div className="filterList">
            {filters.map((filter) => (
              <label key={filter.label}>
                <span>{filter.label}</span>
                <select defaultValue={filter.value}>
                  <option>{filter.value}</option>
                  <option>전체</option>
                </select>
              </label>
            ))}
          </div>
          <button className="primaryButton">통계 조회</button>
          <p className="helperText">
            선택하지 않은 항목은 자동으로 비교 축이 됩니다. 예: 날씨 전체 선택 시 날씨별 좌석 차이 표시.
          </p>
        </aside>

        <section className="results">
          <nav className="tabs" aria-label="보기 모드">
            {viewModes.map((mode, index) => (
              <button className={index === 0 ? "active" : ""} key={mode}>
                {mode}
              </button>
            ))}
          </nav>

          <div className="panel noTopPadding">
            <div className="sectionHead">
              <div>
                <p className="eyebrow">조건 기반 요약</p>
                <h2>M4130 / 월요일 / 07:30 / 반도3차.금강1차</h2>
              </div>
              <p>날씨: 전체 비교</p>
            </div>
            <div className="summaryStrip">
              {summaryStats.map((stat) => (
                <div key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="splitGrid">
            <AnalysisTable
              title="정류장별 보기"
              description="정류장을 고르지 않았을 때 노선 내 정류장별 차이를 보여줍니다."
              columns={["정류장", "평균 잔여좌석", "만차확률", "표본"]}
              rows={stationRows.map((row) => [row.station, `${row.avg}석`, row.full, `${row.samples}건`])}
            />
            <AnalysisTable
              title="시간대별 보기"
              description="시간을 고르지 않았을 때 10분 단위 좌석 변화를 보여줍니다."
              columns={["시간", "평균 잔여좌석", "만차확률"]}
              rows={timeRows.map((row) => [row.time, `${row.avg}석`, row.full])}
            />
          </div>

          <AnalysisTable
            title="날씨별 보기"
            description="날씨를 고르지 않았을 때 기상 조건별 좌석 차이를 보여줍니다."
            columns={["날씨", "평균 잔여좌석", "만차확률", "날씨 샘플"]}
            rows={weatherRows.map((row) => [row.weather, `${row.avg}석`, row.full, row.sample])}
          />
        </section>
      </section>
    </main>
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
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
