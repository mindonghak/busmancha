const routeOptions = ["M4137", "M4130", "G6009", "6002"];
const weekdayOptions = ["전체", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const timeOptions = ["전체", "06:30", "07:00", "07:30", "08:00", "08:30", "18:00", "18:30", "19:00"];
const weatherOptions = ["전체", "맑음", "흐림", "비", "강풍"];

const stationOptions = [
  "전체",
  "호수자이파밀리에.아이원",
  "반도3차.금강1차",
  "한화.린스트라우스",
  "현대트랜시스(중)",
  "서울역버스환승센터",
];

const routeLines = {
  M4137: [
    { seq: 4, name: "창의고", area: "동탄/화성", avg: 36.0, full: "0%", samples: 1 },
    { seq: 5, name: "한신더휴", area: "동탄/화성", avg: 30.0, full: "0%", samples: 2 },
    { seq: 6, name: "예솔초.호반2차.대원2차", area: "동탄/화성", avg: 28.0, full: "0%", samples: 3 },
    { seq: 7, name: "신안2차.반도4차", area: "동탄/화성", avg: 28.0, full: "0%", samples: 3 },
    { seq: 10, name: "동탄테크노벨리(중)", area: "동탄/화성", avg: 23.5, full: "0%", samples: 4 },
    { seq: 29, name: "국가인권위.안중근활동터(중)", area: "서울역", avg: 8.1, full: "12%", samples: 8 },
    { seq: 31, name: "서울시청", area: "서울역", avg: 9.8, full: "12%", samples: 8 },
    { seq: 34, name: "서울역버스환승센터", area: "서울역", avg: 13.9, full: "12%", samples: 8 },
  ],
  M4130: [
    { seq: 7, name: "한화.린스트라우스", area: "동탄/화성", avg: 31.0, full: "0%", samples: 2 },
    { seq: 8, name: "포스코더샵.롯데캐슬", area: "동탄/화성", avg: 42.7, full: "0%", samples: 3 },
    { seq: 10, name: "상록.테크노밸리.GS자이", area: "동탄/화성", avg: 42.7, full: "0%", samples: 3 },
    { seq: 12, name: "현대트랜시스(중)", area: "동탄/화성", avg: 36.5, full: "0%", samples: 4 },
    { seq: 31, name: "국가인권위.안중근활동터(중)", area: "서울역", avg: 15.1, full: "0%", samples: 8 },
    { seq: 33, name: "서울시청", area: "서울역", avg: 15.1, full: "0%", samples: 8 },
    { seq: 36, name: "서울역버스환승센터", area: "서울역", avg: 28.6, full: "0%", samples: 8 },
    { seq: 41, name: "명동성당", area: "서울역", avg: 32.6, full: "0%", samples: 8 },
  ],
  G6009: [
    { seq: 4, name: "창의고", area: "동탄/화성", avg: 37.0, full: "0%", samples: 1 },
    { seq: 7, name: "신안2차.반도4차", area: "동탄/화성", avg: 45.0, full: "0%", samples: 4 },
    { seq: 10, name: "동탄테크노벨리(중)", area: "동탄/화성", avg: 45.0, full: "0%", samples: 4 },
    { seq: 11, name: "현대트랜시스(중)", area: "동탄/화성", avg: 46.2, full: "0%", samples: 5 },
    { seq: 21, name: "가천대", area: "동탄/화성", avg: 35.6, full: "0%", samples: 8 },
    { seq: 23, name: "장지역.가든파이브(중)", area: "잠실", avg: 35.6, full: "0%", samples: 8 },
    { seq: 24, name: "문정법조단지.건영아파트(중)", area: "잠실", avg: 35.6, full: "0%", samples: 8 },
    { seq: 25, name: "가락시장.가락시장역(중)", area: "잠실", avg: 27.4, full: "0%", samples: 8 },
  ],
  "6002": [
    { seq: 7, name: "호수공원행복주택.호수부영6차", area: "동탄/화성", avg: 43.0, full: "0%", samples: 1 },
    { seq: 8, name: "호수부영1차", area: "동탄/화성", avg: 43.0, full: "0%", samples: 1 },
    { seq: 10, name: "창의고", area: "동탄/화성", avg: 37.0, full: "0%", samples: 2 },
    { seq: 13, name: "예솔초.호반2차.대원2차", area: "동탄/화성", avg: 38.0, full: "0%", samples: 4 },
    { seq: 14, name: "신안2차.반도4차", area: "동탄/화성", avg: 38.0, full: "0%", samples: 4 },
    { seq: 18, name: "퍼스트파크.이지더원", area: "동탄/화성", avg: 33.7, full: "0%", samples: 6 },
    { seq: 19, name: "동탄2파출소.농협", area: "동탄/화성", avg: 30.1, full: "0%", samples: 7 },
  ],
};

const selectedRoute = "M4130";

const timeRows = [
  { time: "07:00", avg: 28.4, full: "4%", samples: 42 },
  { time: "07:10", avg: 21.7, full: "9%", samples: 39 },
  { time: "07:20", avg: 15.2, full: "17%", samples: 44 },
  { time: "07:30", avg: 8.9, full: "34%", samples: 41 },
  { time: "07:40", avg: 4.1, full: "58%", samples: 36 },
];

const weatherRows = [
  { weather: "맑음", avg: 19.8, full: "10%", sample: "동탄/화성 22.1도", samples: 82 },
  { weather: "흐림", avg: 16.3, full: "18%", sample: "습도 67%", samples: 44 },
  { weather: "비", avg: 10.4, full: "39%", sample: "강수 1mm 이상", samples: 12 },
  { weather: "강풍", avg: 13.7, full: "24%", sample: "풍속 4m/s 이상", samples: 9 },
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

      <section className="heroText">
        <h2>조건을 고르면 과거 좌석 패턴을 보여주고, 비워둔 조건은 비교표로 펼칩니다.</h2>
        <p>
          현재 화면은 조회 기능의 구성안입니다. 실제 DB 통계 API가 연결되면 선택한 조건은 필터로 쓰고,
          선택하지 않은 조건은 정류장별, 시간대별, 날씨별 비교로 보여줍니다.
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
          <Filter label="버스번호" options={routeOptions} value={selectedRoute} />
          <Filter label="요일" options={weekdayOptions} value="전체" />
          <Filter label="시간" options={timeOptions} value="전체" />
          <Filter label="정류장" options={stationOptions} value="전체" />
          <Filter label="날씨" options={weatherOptions} value="전체" />
          <button className="primaryButton">통계 조회</button>
          <p className="helperText">
            예: 날씨를 전체로 두면 날씨별 평균 잔여좌석과 만차확률을 함께 보여줍니다.
          </p>
        </aside>

        <section className="results">
          <nav className="tabs" aria-label="보기 모드">
            {["직접 설정", "정류장별 보기", "시간대별 보기", "날씨별 보기"].map((mode, index) => (
              <button className={index === 1 ? "active" : ""} key={mode}>
                {mode}
              </button>
            ))}
          </nav>

          <section className="panel routePanel">
            <div className="sectionHead">
              <div>
                <p className="eyebrow">정류장별 보기</p>
                <h2>{selectedRoute} 노선 순서와 좌석 통계</h2>
              </div>
              <p>정류장 순서, 날씨 권역, 평균 잔여좌석, 만차확률, 표본 수를 함께 표시합니다.</p>
            </div>
            <div className="routeChips">
              {routeOptions.map((route) => (
                <span className={route === selectedRoute ? "selected" : ""} key={route}>
                  {route}
                </span>
              ))}
            </div>
            <div className="routeLine">
              {routeLines[selectedRoute].map((station) => (
                <article className="stop" key={`${station.seq}-${station.name}`}>
                  <div className="marker">{station.seq}</div>
                  <div className="stopBody">
                    <div>
                      <strong>{station.name}</strong>
                      <span>{station.area}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>평균</dt>
                        <dd>{station.avg}석</dd>
                      </div>
                      <div>
                        <dt>만차확률</dt>
                        <dd>{station.full}</dd>
                      </div>
                      <div>
                        <dt>표본</dt>
                        <dd>{station.samples}건</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="splitGrid">
            <AnalysisTable
              title="시간대별 보기"
              description="시간을 고르지 않았을 때 10분 단위 좌석 변화를 보여줍니다."
              columns={["시간", "평균 잔여좌석", "만차확률", "표본"]}
              rows={timeRows.map((row) => [row.time, `${row.avg}석`, row.full, `${row.samples}건`])}
            />
            <AnalysisTable
              title="날씨별 보기"
              description="날씨를 고르지 않았을 때 기상 조건별 좌석 차이를 보여줍니다."
              columns={["날씨", "평균 잔여좌석", "만차확률", "표본"]}
              rows={weatherRows.map((row) => [row.weather, `${row.avg}석`, row.full, `${row.samples}건`])}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function Filter({ label, options, value }: { label: string; options: string[]; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <select defaultValue={value}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
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
