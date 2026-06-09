# Data Collection

## Current Storage

PostgreSQL이 아직 로컬에 준비되어 있지 않아, 현재는 SQLite로 실제 데이터를 먼저 쌓습니다.

- DB path: `data/busmancha.sqlite3`
- Log path: `data/collector.log`
- Provider: Gyeonggi
- Weather provider: KMA ultra-short-term nowcast
- Routes:
  - `M4137`
  - `M4130`
  - `G6009`
  - `6002`

`data/` 디렉터리는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

## Collection Method

1. `getBusRouteStationListv2`로 노선의 전체 정류장 목록을 가져옵니다.
2. 각 정류장에 대해 `getBusArrivalItemv2`를 호출합니다.
3. `vehId1/2`가 있는 도착 차량만 저장합니다.
4. `remainSeatCnt1/2`, `predictTimeSec1/2`, `plateNo1/2`를 함께 저장합니다.

## API Quota Strategy

정류장 전체를 매 5분마다 수집하면 호출 수가 너무 큽니다.

대략:

- `M4137`: 64 stops
- `M4130`: 66 stops
- `G6009`: 55 stops
- `6002`: 76 stops
- Total: about 261 arrival calls per full batch

5분마다 전체 수집을 하면 하루 약 `75,000+` 호출이 필요합니다. 공공데이터포털 기본 호출 한도에서는 버티기 어렵습니다.

초기 운영안:

- 전체 정류장 수집은 수동 검증 또는 낮은 빈도의 샘플링에만 사용합니다.
- 상시 수집은 `--first-stops-only`로 주요 승차 구간만 수집합니다.
- 수집 주기는 5분보다 길게 잡습니다. 예: 15~30분.
- 출근/퇴근 시간대에만 촘촘히 수집하고, 나머지 시간은 낮은 빈도로 수집합니다.
- 공공데이터포털에서 활용 목적을 작성해 일일 트래픽 증설을 신청합니다.

예시:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --interval-seconds 1800 --first-stops-only
```

한 번만 적은 호출로 확인:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --once --first-stops-only
```

## Table

Current SQLite table:

```sql
CREATE TABLE seat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collected_at TEXT NOT NULL,
    service_date TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    time_hhmm TEXT NOT NULL,
    provider TEXT NOT NULL,
    route_id TEXT NOT NULL,
    route_name TEXT NOT NULL,
    route_type_cd TEXT,
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    station_seq INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL,
    plate_no TEXT,
    arrival_order INTEGER NOT NULL,
    remain_seat INTEGER,
    is_full INTEGER,
    eta_seconds INTEGER,
    raw_flag TEXT
);
```

## Notes

- `is_full` is derived as `remain_seat <= 0` only when a vehicle exists.
- `remainSeatCnt2=0` is ignored unless `vehId2` exists.
- The first implementation intentionally stores raw-ish rows instead of summarized aggregates.
- SQLite is a temporary local store. The same shape can be migrated to PostgreSQL once PostgreSQL is installed or provisioned.

## Current Quota Plan

Operating account daily quota: `10,000` calls/day.

Current low-call collector mode:

- `M4137`: first 12 stops
- `M4130`: first 14 stops
- `G6009`: first 14 stops
- `6002`: first 18 stops
- Pass-through stations with `(경유)` in the name are excluded.
- Calls are skipped outside each route's first-to-last bus window.
- Arrival calls per batch: `58`
- Route station list calls per batch: `4`
- Total calls per batch: about `62`
- Batch interval: `600` seconds
- Batches per day: `144`
- Estimated daily calls: `62 * 144 = 8,928`

This leaves roughly `1,000+` calls/day as buffer for retries, manual checks, and weather collection.

Service windows currently configured from Gyeonggi route info:

- `M4137`: `05:00` to `00:10`
- `M4130`: `05:00` to `00:10`
- `G6009`: `05:10` to `00:00`
- `6002`: `05:00` to `23:55`

## Weather Data Plan

Use the official `기상청_단기예보 조회서비스` from the public data portal.

Recommended endpoints:

- `getUltraSrtNcst`: current ultra-short-term observed weather
- `getUltraSrtFcst`: ultra-short-term forecast
- `getVilageFcst`: short-term forecast

Useful weather fields:

- `T1H`: temperature
- `RN1`: 1-hour precipitation
- `REH`: humidity
- `WSD`: wind speed
- `PTY`: precipitation type
- `SKY`: sky condition, forecast endpoint
- `POP`: precipitation probability, forecast endpoint

Initial weather grid points:

- Dongtan/Hwaseong boarding area
- Gangnam area
- Seoul Station area
- Jamsil area

Weather does not need to be collected per bus stop. A few regional grid points every 10 to 30 minutes should be enough for correlation analysis.

Current weather collection:

- `동탄/화성`: `nx=62`, `ny=119`
- `강남`: `nx=61`, `ny=125`
- `서울역`: `nx=60`, `ny=126`
- `잠실`: `nx=62`, `ny=126`
- Collection interval: same as bus collector, currently 10 minutes
- Current endpoint: `getUltraSrtNcst`

Current SQLite weather table:

```sql
CREATE TABLE weather_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collected_at TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    area_key TEXT NOT NULL,
    area_name TEXT NOT NULL,
    nx INTEGER NOT NULL,
    ny INTEGER NOT NULL,
    base_date TEXT NOT NULL,
    base_time TEXT NOT NULL,
    temperature REAL,
    precipitation_1h REAL,
    humidity INTEGER,
    wind_speed REAL,
    precipitation_type TEXT,
    raw_payload TEXT
);
```
