# Busmancha

서울/경기/인천 광역버스와 M버스의 잔여 좌석 데이터를 장기간 수집해, 노선/정류장/요일/시간대별 만차 패턴을 통계로 보여주는 웹 서비스입니다.

## Current Stage

현재 최우선 단계는 웹 개발이 아니라 API 검증입니다.

검증 질문:

- 서울/경기/인천 공식 버스 API에서 잔여좌석수가 실제로 제공되는가?
- 만차 여부 또는 만차 판정에 필요한 값이 제공되는가?
- 도착예정시간과 차량 식별 정보가 함께 제공되는가?
- 대상 노선에서 값이 `정보없음`이 아니라 실제 숫자로 내려오는가?

대상 예시 노선:

- M4137
- M4130
- G6009
- 6002

`6002`는 서울/공항버스와 경기/화성 노선명이 겹칠 수 있어 관할 API를 먼저 확인합니다.

## Planned Architecture

- Collector: Python
- Backend: FastAPI
- Frontend: Next.js
- Database: PostgreSQL

초기에는 원본 데이터를 우선 저장하고, 충분한 데이터가 쌓인 뒤 요약 테이블과 분석 모델을 설계합니다.

## First Verification

공식 문서상으로는 다음 필드들이 확인됩니다.

- 서울: 광역버스 잔여좌석/만차/차량번호/도착예정시간 계열 필드
- 경기: `remainSeatCnt`, `vehId`, `plateNo`, `predictTimeSec`
- 인천: `REMAIND_SEAT`, `BUSID`, `BUS_NUM_PLATE`, `ARRIVALESTIMATETIME`
- ODsay: 2024-06-27 릴리즈 노트에 재차인원/잔여좌석/혼잡도 추가 언급

자세한 검증 계획은 [docs/api-validation.md](docs/api-validation.md)를 봅니다.

현재 1차 실제 API 호출 결과는 [docs/validation-results.md](docs/validation-results.md)에 기록합니다.

1차 결론:

- `M4137`, `M4130`, `G6009`, 화성 `6002` 모두 경기 도착정보 API에서 잔여좌석과 ETA 수집 가능성이 확인되었습니다.
- `G6009`, 화성 `6002`는 경기 위치정보 API에서도 잔여좌석이 확인되었습니다.
- `M4137`, `M4130`은 위치정보 API에서는 HTTP 401이 나왔지만, 도착정보 API를 노선 정류장 목록과 함께 스캔하면 좌석값이 정상 확인됩니다.
- 초기 Collector는 `노선 정류장 목록 -> 정류장별 도착정보` 방식으로 만드는 것이 가장 안전합니다.

## Local Commands

이 환경에서는 `python` 명령이 바로 잡혀 있지 않을 수 있습니다. Codex 번들 Python 기준 실행 예시는 다음과 같습니다.

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/verify_api_fields.py gyeonggi-route-search --route-name M4137
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/verify_api_fields.py gyeonggi-location --route-id <ROUTE_ID>
```

## Collector

현재 PostgreSQL 대신 로컬 SQLite 파일에 실제 데이터를 먼저 쌓습니다.

- DB: `data/busmancha.sqlite3`
- Log: `data/collector.log`
- 수집 대상: `M4137`, `M4130`, `G6009`, 화성 `6002`

1회 수집:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --once
```

특정 노선만 1회 수집:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --once --routes M4137
```

반복 수집:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --interval-seconds 300
```

API 호출 한도를 아끼는 반복 수집:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/collector.py --interval-seconds 600 --first-stops-only
```

현재 Collector는 `노선 정류장 목록 -> 정류장별 도착정보` 방식으로 동작합니다.
정류장명에 `(경유)`가 들어간 정류장은 제외하고, 노선별 첫차~막차 시간 밖에서는 호출하지 않습니다.
