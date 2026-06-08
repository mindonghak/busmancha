# Data Collection

## Current Storage

PostgreSQL이 아직 로컬에 준비되어 있지 않아, 현재는 SQLite로 실제 데이터를 먼저 쌓습니다.

- DB path: `data/busmancha.sqlite3`
- Log path: `data/collector.log`
- Provider: Gyeonggi
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

