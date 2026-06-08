# API Validation Results

검증 시각: 2026-06-08 12:21~12:24 KST

## Summary

| Route | Route ID | Provider | Route lookup | Location seat data | Arrival ETA + seat data | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| M4137 | 234001622 | Gyeonggi | Confirmed | HTTP 401 on location endpoint | Arrival endpoint works, but selected stop had no vehicle/seat/ETA values | Needs more checks |
| M4130 | 234001577 | Gyeonggi | Confirmed | HTTP 401 on location endpoint | Arrival endpoint works, but selected stop had no vehicle/seat/ETA values | Needs more checks |
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

## Notes

- `M4130` and `M4137` route lookup works.
- Their main `routeId` values returned HTTP 401 on the location endpoint during this run.
- Their arrival endpoint did return a row, but the selected stops had no `vehId`, `plateNo`, `remainSeatCnt`, or `predictTimeSec` values at that moment.
- The practical MVP collector can begin with `G6009` and `6002`, while `M4130/M4137` are retried at different times and with route station list based stop selection.

