# API Validation Results

검증 시각: 2026-06-08 12:21~12:24 KST

## Summary

| Route | Route ID | Provider | Route lookup | Location seat data | Arrival ETA + seat data | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| M4137 | 234001622 | Gyeonggi | Confirmed | HTTP 401 on location endpoint | Confirmed by scanning route stations | Usable via arrival endpoint |
| M4130 | 234001577 | Gyeonggi | Confirmed | HTTP 401 on location endpoint | Confirmed by scanning route stations | Usable via arrival endpoint |
| G6009 | 233000322 | Gyeonggi | Confirmed | Confirmed | Confirmed | Usable |
| 6002 | 233000136 | Gyeonggi | Confirmed | Confirmed | Confirmed | Usable |

## Route Lookup

### M4137

- `routeId`: `234001622`
- `routeName`: `M4137`
- `routeTypeCd`: `14`
- `routeTypeName`: `광역급행형시내버스`
- Start: `아이파크.호수부영4차`
- End: `서울역버스환승센터(6번승강장)(중)`

Reservation route:

- `routeId`: `233000461`
- `routeName`: `M4137(예약)`

### M4130

- `routeId`: `234001577`
- `routeName`: `M4130`
- `routeTypeCd`: `14`
- `routeTypeName`: `광역급행형시내버스`
- Start: `호수자이파밀리에.아이원`
- End: `서울역버스환승센터(6번승강장)(중)`

Reservation route:

- `routeId`: `233000460`
- `routeName`: `M4130(예약)`

### G6009

- `routeId`: `233000322`
- `routeName`: `G6009`
- `routeTypeCd`: `11`
- `routeTypeName`: `직행좌석형시내버스`
- Start: `호수자이파밀리에.아이원`
- End: `잠실광역환승센터`

Reservation route:

- `routeId`: `233000459`
- `routeName`: `G6009(예약)`

### 6002

- `routeId`: `233000136`
- `routeName`: `6002`
- `routeTypeCd`: `11`
- `routeTypeName`: `직행좌석형시내버스`
- Start: `동탄2차고지`
- End: `신분당선강남역(중)`

Reservation route:

- `routeId`: `233000457`
- `routeName`: `6002(예약)`

## Confirmed Seat Data

### M4137 Arrival

Endpoint:

- `busarrivalservice/v2/getBusArrivalItemv2`

Route station scan:

- Total stations: `64`
- Checked stations: `64`
- Stations with usable seat data: `63`

Confirmed fields:

- `vehId1`
- `vehId2`
- `remainSeatCnt1`
- `remainSeatCnt2`
- `predictTimeSec1`
- `predictTimeSec2`

Sample observed values:

- `A74블럭(경유)`: `remainSeatCnt1=40`, `predictTimeSec1=46`, `vehId1=234000036`
- `동탄테크노벨리(중)`: `remainSeatCnt1=50`, `remainSeatCnt2=40`, `predictTimeSec1=402`, `predictTimeSec2=1362`
- `금토JC(경유)`: `remainSeatCnt1=23`, `remainSeatCnt2=50`, `predictTimeSec1=68`, `predictTimeSec2=1568`

Location endpoint note:

- `buslocationservice/v2/getBusLocationListv2` returned HTTP 401 for `routeId=234001622` during this run.
- Arrival endpoint provides enough seat, vehicle, station, and ETA data for collection.

### M4130 Arrival

Endpoint:

- `busarrivalservice/v2/getBusArrivalItemv2`

Route station scan:

- Total stations: `66`
- Checked stations: `66`
- Stations with usable seat data: `62`

Confirmed fields:

- `vehId1`
- `vehId2`
- `remainSeatCnt1`
- `remainSeatCnt2`
- `predictTimeSec1`
- `predictTimeSec2`

Sample observed values:

- `반도3차.금강1차`: `remainSeatCnt1=41`, `predictTimeSec1=188`, `vehId1=234000125`
- `기흥휴게소(경유)`: `remainSeatCnt1=11`, `remainSeatCnt2=41`, `predictTimeSec1=80`, `predictTimeSec2=1632`
- `양재IC(경유)`: `remainSeatCnt1=24`, `remainSeatCnt2=11`, `predictTimeSec1=9`, `predictTimeSec2=1182`

Location endpoint note:

- `buslocationservice/v2/getBusLocationListv2` returned HTTP 401 for `routeId=234001577` during this run.
- Arrival endpoint provides enough seat, vehicle, station, and ETA data for collection.

### G6009 Location

Endpoint:

- `buslocationservice/v2/getBusLocationListv2`

Confirmed fields:

- `stationId`
- `stationSeq`
- `vehId`
- `plateNo`
- `remainSeatCnt`
- `crowded`
- `stateCd`

Sample observed values:

- `remainSeatCnt`: `36`, `5`, `31`, `34`, `28`
- `plateNo`: `경기76아4446`, `경기76아4443`, `경기76아4441`

### G6009 Arrival

Endpoint:

- `busarrivalservice/v2/getBusArrivalItemv2`

Validated stop:

- `stationId`: `123000611`
- `staOrder`: `29`

Confirmed fields:

- `vehId1`: `233000901`
- `vehId2`: `233000903`
- `plateNo1`: `경기76아4441`
- `plateNo2`: `경기76아4443`
- `remainSeatCnt1`: `31`
- `remainSeatCnt2`: `5`
- `predictTimeSec1`: `357`
- `predictTimeSec2`: `1893`

### 6002 Location

Endpoint:

- `buslocationservice/v2/getBusLocationListv2`

Confirmed fields:

- `stationId`
- `stationSeq`
- `vehId`
- `plateNo`
- `remainSeatCnt`
- `crowded`
- `stateCd`

Sample observed values:

- `remainSeatCnt`: `42`, `39`, `12`, `27`, `62`
- `plateNo`: `경기76아3540`, `경기77바1081`, `경기76아3366`

### 6002 Arrival

Endpoint:

- `busarrivalservice/v2/getBusArrivalItemv2`

Validated stop:

- `stationId`: `121000086`
- `staOrder`: `35`

Confirmed fields:

- `vehId1`: `233000342`
- `vehId2`: `233000330`
- `plateNo1`: `경기76아3379`
- `plateNo2`: `경기76아3366`
- `remainSeatCnt1`: `27`
- `remainSeatCnt2`: `12`
- `predictTimeSec1`: `606`
- `predictTimeSec2`: `1658`

## Why M4137/M4130 Looked Broken Initially

The first check used only the first stop of each route.

- `M4137`: `아이파크.호수부영4차`, station sequence `1`
- `M4130`: `호수자이파밀리에.아이원`, station sequence `1`

At those exact stops and that exact time, the arrival endpoint returned a route row but no upcoming vehicle fields. Because of that, `vehId`, `remainSeatCnt`, and `predictTimeSec` were empty.

After fetching the full route station list and scanning every stop, both routes returned usable seat data from later stops. The initial issue was stop selection, not lack of seat data.

## Notes

- `M4130` and `M4137` route lookup works.
- Their main `routeId` values returned HTTP 401 on the location endpoint during this run.
- Their arrival endpoint does return usable seat and ETA data when scanned across route stations.
- The practical MVP collector should use route station list + arrival endpoint as the primary path for all four target routes.
- Location endpoint can still be used for routes where it works, such as `G6009` and `6002`, but should not be required for MVP collection.
