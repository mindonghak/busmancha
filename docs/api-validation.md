# API Validation Notes

## Purpose

이 문서는 서울/경기/인천 광역버스 잔여좌석 데이터 수집 가능성을 검증하기 위한 1단계 기록입니다.

핵심은 문서상 필드 존재가 아니라, 실제 대상 노선에서 유효한 값이 오는지 확인하는 것입니다.

## Required Fields

수집 후보 원본 필드:

- collected_at
- route_id
- route_name
- station_id
- station_name
- vehicle_id
- vehicle_plate_no
- remain_seat
- is_full
- eta_seconds
- provider
- raw_payload

## Provider Findings

### Seoul

공식/공공데이터 문서 기준:

- API: 서울특별시 버스도착정보조회 서비스
- 주요 endpoint:
  - `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll`
  - `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid`
- 확인된 필드:
  - `reride_Num1`, `reride_Num2`
  - `rerdie_Div1`, `rerdie_Div2`
  - `brdrde_Num1`, `brdrde_Num2`
  - `brerde_Div1`, `brerde_Div2`
  - `full1`, `full2`
  - `plainNo1`, `plainNo2`
  - `exps1`, `exps2`, `kals1`, `kals2`
  - `stId`, `stNm`, `busRouteId`, `rtNm`, `routeType`

문서 해석:

- `routeType = 6` 서울시 광역버스에서 `reride_Num*` 또는 `brdrde_Num*`가 잔여좌석수로 쓰일 수 있습니다.
- `full1`, `full2`가 만차 여부 후보입니다.
- 실제 M버스/광역 노선에서 어느 필드가 채워지는지는 라이브 호출로 확인해야 합니다.

### Gyeonggi

공식 경기버스정보 문서 기준:

- API: 경기도 버스위치정보/버스도착정보 조회 서비스
- 주요 endpoint:
  - `https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2`
  - `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2`
  - `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2`
  - `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2`
- 확인된 필드:
  - `remainSeatCnt`
  - `remainSeatCnt1`, `remainSeatCnt2`
  - `vehId`, `vehId1`, `vehId2`
  - `plateNo`, `plateNo1`, `plateNo2`
  - `predictTimeSec1`, `predictTimeSec2`
  - `stationId`, `stationSeq`, `stationNm1`, `stationNm2`

문서 해석:

- `remainSeatCnt = -1`은 정보없음입니다.
- 제공 노선유형에는 직행좌석, 좌석, 광역급행, 경기순환, 준공영제직행좌석 등이 포함됩니다.
- M4403, M4434, 5000A, 5500-1, 9007은 경기 API 우선 검증 대상입니다.

### Incheon

공공데이터 문서 기준:

- API: 인천광역시 도착정보 조회
- 주요 endpoint:
  - `http://apis.data.go.kr/6280000/busArrivalService/getAllRouteBusArrivalList`
- 확인된 필드:
  - `REMAIND_SEAT`
  - `CONGESTION`
  - `BUSID`
  - `BUS_NUM_PLATE`
  - `ARRIVALESTIMATETIME`
  - `BSTOPID`, `ROUTEID`

문서 해석:

- `REMAIND_SEAT = 255`는 사용안함입니다.
- 인천 문서에는 서울/경기 차량 사용안함이라는 설명이 있으므로 인천 관할 노선부터 검증해야 합니다.
- 2025년 이후 인천 광역버스 잔여좌석 안내 서비스 확대 보도가 있어, 실제 API 반영 여부 확인 가치가 큽니다.

### ODsay

ODsay 릴리즈 노트 기준:

- 2024-06-27 실시간 버스 도착정보에 재차인원, 잔여좌석, 버스 혼잡도 추가 언급
- ODsay는 공식 지자체 API 검증 후 보조 수단으로 사용합니다.

주의:

- ODsay의 상세 응답 필드는 계정/레퍼런스 화면에서 추가 확인이 필요할 수 있습니다.
- 상표 표시 정책과 상업적 이용 조건을 별도로 검토해야 합니다.

## Validation Criteria

우선 검증 대상 노선은 다음으로 잡습니다.

| 노선 | 1차 API | 메모 |
| --- | --- | --- |
| M4137 | 경기 | 화성 동탄 - 서울역 광역급행 |
| M4130 | 경기 | 화성 동탄 - 서울역 광역급행 |
| G6009 | 경기 | 화성 직행좌석/G버스 |
| 6002 | 경기/서울/인천 확인 | 서울 공항버스와 경기 노선명이 겹칠 수 있음 |

노선별로 다음 결과를 기록합니다.

- `field_present`: 응답에 좌석/만차/ETA/차량 필드가 있는가
- `value_usable`: 값이 `-1`, `255`, `0 only`, 빈 문자열이 아니라 실제 분석 가능한 값인가
- `vehicle_joinable`: 같은 차량을 시간 흐름상 추적할 수 있는가
- `station_context`: 정류장 기준으로 어느 위치에서 만차가 되는지 계산 가능한가
- `eta_context`: 도착예정시간과 좌석값을 같은 row에서 저장 가능한가

## Next Step

1. 공공데이터포털에서 서울/경기/인천 API 활용신청을 완료합니다.
2. `.env`에 키를 넣습니다.
3. `scripts/verify_api_fields.py`로 노선명을 검색해 provider별 `routeId`를 확인합니다.
4. 확인된 `routeId`로 실제 응답 샘플을 `data/api_samples/`에 저장합니다.
5. 유효 좌석값이 확인되면 Collector와 PostgreSQL 저장으로 넘어갑니다.

예시:

```powershell
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/verify_api_fields.py gyeonggi-route-search --route-name M4137
& 'C:\Users\dongh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/verify_api_fields.py gyeonggi-location --route-id <ROUTE_ID>
```
