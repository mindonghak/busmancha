const routeSummary = [
  { route: "M4137", rows: 317, avgSeat: 32.2, minSeat: 18, maxSeat: 67, latest: "2026-06-08 13:19" },
  { route: "M4130", rows: 405, avgSeat: 36.1, minSeat: 18, maxSeat: 52, latest: "2026-06-08 13:19" },
  { route: "G6009", rows: 260, avgSeat: 33.8, minSeat: -1, maxSeat: 40, latest: "2026-06-08 13:19" },
  { route: "6002", rows: 426, avgSeat: 39.5, minSeat: 15, maxSeat: 64, latest: "2026-06-08 13:14" },
];

const stationRisk = [
  { route: "M4130", station: "기흥휴게소(경유)", avgSeat: 11, minSeat: 11, eta: "80초" },
  { route: "M4130", station: "양재IC(경유)", avgSeat: 24, minSeat: 24, eta: "9초" },
  { route: "M4137", station: "금토JC(경유)", avgSeat: 23, minSeat: 23, eta: "68초" },
  { route: "6002", station: "신분당선강남역(중)", avgSeat: 18.3, minSeat: 15, eta: "최근 샘플" },
  { route: "G6009", station: "잠실광역환승센터", avgSeat: 33.8, minSeat: 25, eta: "최근 샘플" },
];

const metrics = [
  { label: "수집 노선", value: "4개" },
  { label: "저장 샘플", value: "1,408행" },
  { label: "수집 방식", value: "공식 API" },
  { label: "저장 주기", value: "조정 중" },
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
          실제 API 검증 완료
        </div>
      </header>

      <section className="intro">
        <div>
          <h2>어느 노선이, 어느 시간대에, 어느 정류장에서 만차가 되는지 분석합니다.</h2>
          <p>
            경기 광역버스 공식 API에서 수집한 잔여좌석, 차량, 정류장, 도착예정시간 데이터를 기반으로
            노선별 혼잡 패턴을 장기 분석하는 웹 서비스입니다.
          </p>
        </div>
        <div className="metricGrid">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">최근 수집 샘플</p>
            <h2>노선별 잔여좌석 요약</h2>
          </div>
          <p>대상: M4137, M4130, G6009, 화성 6002</p>
        </div>
        <div className="routeGrid">
          {routeSummary.map((route) => (
            <article className="routeCard" key={route.route}>
              <div className="routeTitle">
                <h3>{route.route}</h3>
                <span>{route.rows.toLocaleString()}행</span>
              </div>
              <div className="seatNumber">{route.avgSeat}</div>
              <p>평균 잔여좌석</p>
              <div className="range">
                <span>최저 {route.minSeat}</span>
                <span>최고 {route.maxSeat}</span>
              </div>
              <small>최근 수집 {route.latest}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">정류장별 분석 예시</p>
            <h2>잔여좌석이 낮게 관측된 지점</h2>
          </div>
          <p>초기 샘플 기준, 장기 수집 후 만차확률로 확장</p>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>노선</th>
                <th>정류장</th>
                <th>평균 잔여좌석</th>
                <th>최저 잔여좌석</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {stationRisk.map((row) => (
                <tr key={`${row.route}-${row.station}`}>
                  <td>{row.route}</td>
                  <td>{row.station}</td>
                  <td>{row.avgSeat}</td>
                  <td>{row.minSeat}</td>
                  <td>{row.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow">
        <div>
          <span>1</span>
          <strong>공식 API 수집</strong>
          <p>노선 정류장 목록과 도착정보 API를 호출합니다.</p>
        </div>
        <div>
          <span>2</span>
          <strong>원본 데이터 저장</strong>
          <p>수집시각, 요일, 정류장, 차량, 잔여좌석, ETA를 저장합니다.</p>
        </div>
        <div>
          <span>3</span>
          <strong>만차 패턴 분석</strong>
          <p>장기 데이터가 쌓이면 시간대별 만차확률을 계산합니다.</p>
        </div>
      </section>
    </main>
  );
}
