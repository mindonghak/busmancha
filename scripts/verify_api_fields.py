import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIR = ROOT / "data" / "api_samples"


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def fetch_text(url: str, params: dict[str, str], timeout: int = 20) -> str:
    query = urllib.parse.urlencode(params, doseq=True, safe="%")
    request = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": "busmancha-api-validator/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} from API: {body[:500]}") from error


def xml_items(text: str, item_tag: str = "itemList") -> list[dict[str, str]]:
    root = ET.fromstring(text)
    items = []
    for item in root.iter(item_tag):
        row = {}
        for child in list(item):
            row[child.tag] = (child.text or "").strip()
        if row:
            items.append(row)
    return items


def save_sample(provider: str, name: str, payload: str) -> Path:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = SAMPLE_DIR / f"{now}_{provider}_{safe_name(name)}.xml"
    path.write_text(payload, encoding="utf-8")
    return path


def safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in value)


def summarize_rows(rows: list[dict[str, str]], fields: list[str]) -> dict:
    summary = {"row_count": len(rows), "fields": {}}
    for field in fields:
        values = [row.get(field, "") for row in rows if row.get(field, "") != ""]
        summary["fields"][field] = {
            "present_count": len(values),
            "sample_values": values[:5],
            "usable_count": sum(1 for value in values if is_usable_value(value)),
        }
    return summary


def is_usable_value(value: str) -> bool:
    stripped = value.strip()
    if stripped in {"", "-1", "255", "정보없음"}:
        return False
    return True


def print_json(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def validate_seoul(route_id: str) -> dict:
    key = env("SEOUL_SERVICE_KEY")
    if not key:
        raise SystemExit("SEOUL_SERVICE_KEY is required.")

    url = "http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll"
    payload = fetch_text(url, {"serviceKey": key, "busRouteId": route_id})
    sample_path = save_sample("seoul", route_id, payload)
    rows = xml_items(payload)
    fields = [
        "busRouteId",
        "rtNm",
        "routeType",
        "stId",
        "stNm",
        "reride_Num1",
        "reride_Num2",
        "rerdie_Div1",
        "rerdie_Div2",
        "brdrde_Num1",
        "brdrde_Num2",
        "brerde_Div1",
        "brerde_Div2",
        "full1",
        "full2",
        "plainNo1",
        "plainNo2",
        "exps1",
        "exps2",
        "kals1",
        "kals2",
    ]
    return {"provider": "seoul", "route_id": route_id, "sample_path": str(sample_path), **summarize_rows(rows, fields)}


def validate_gyeonggi_location(route_id: str) -> dict:
    key = env("GYEONGGI_SERVICE_KEY")
    if not key:
        raise SystemExit("GYEONGGI_SERVICE_KEY is required.")

    url = "https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2"
    payload = fetch_text(url, {"serviceKey": key, "routeId": route_id, "format": "xml"})
    sample_path = save_sample("gyeonggi_location", route_id, payload)
    rows = xml_items(payload, "busLocationList")
    fields = [
        "routeId",
        "routeTypeCd",
        "stationId",
        "stationSeq",
        "vehId",
        "plateNo",
        "remainSeatCnt",
        "crowded",
        "stateCd",
    ]
    return {"provider": "gyeonggi_location", "route_id": route_id, "sample_path": str(sample_path), **summarize_rows(rows, fields)}


def search_gyeonggi_route(route_name: str) -> dict:
    key = env("GYEONGGI_SERVICE_KEY")
    if not key:
        raise SystemExit("GYEONGGI_SERVICE_KEY is required.")

    url = "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2"
    payload = fetch_text(url, {"serviceKey": key, "keyword": route_name, "format": "xml"})
    sample_path = save_sample("gyeonggi_route_search", route_name, payload)
    rows = xml_items(payload, "busRouteList")
    fields = [
        "routeId",
        "routeName",
        "routeTypeCd",
        "routeTypeName",
        "regionName",
        "districtCd",
    ]
    return {
        "provider": "gyeonggi_route_search",
        "route_name": route_name,
        "sample_path": str(sample_path),
        "matches": rows[:20],
        **summarize_rows(rows, fields),
    }


def validate_gyeonggi_arrival(station_id: str, route_id: str, sta_order: str) -> dict:
    key = env("GYEONGGI_SERVICE_KEY")
    if not key:
        raise SystemExit("GYEONGGI_SERVICE_KEY is required.")

    url = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2"
    payload = fetch_text(
        url,
        {
            "serviceKey": key,
            "stationId": station_id,
            "routeId": route_id,
            "staOrder": sta_order,
            "format": "xml",
        },
    )
    sample_path = save_sample("gyeonggi_arrival", f"{route_id}_{station_id}_{sta_order}", payload)
    rows = xml_items(payload, "busArrivalItem")
    fields = [
        "routeId",
        "routeName",
        "routeTypeCd",
        "stationId",
        "staOrder",
        "vehId1",
        "vehId2",
        "plateNo1",
        "plateNo2",
        "remainSeatCnt1",
        "remainSeatCnt2",
        "predictTimeSec1",
        "predictTimeSec2",
        "flag",
    ]
    return {
        "provider": "gyeonggi_arrival",
        "route_id": route_id,
        "station_id": station_id,
        "sta_order": sta_order,
        "sample_path": str(sample_path),
        **summarize_rows(rows, fields),
    }


def validate_incheon_station(bstop_id: str) -> dict:
    key = env("INCHEON_SERVICE_KEY")
    if not key:
        raise SystemExit("INCHEON_SERVICE_KEY is required.")

    url = "http://apis.data.go.kr/6280000/busArrivalService/getAllRouteBusArrivalList"
    payload = fetch_text(url, {"ServiceKey": key, "pageNo": "1", "numOfRows": "100", "bstopId": bstop_id})
    sample_path = save_sample("incheon", bstop_id, payload)
    root = ET.fromstring(payload)
    rows = []
    for item in root.iter():
        if item.tag.lower() in {"item", "items"}:
            row = {child.tag: (child.text or "").strip() for child in list(item)}
            if row:
                rows.append(row)
    if not rows:
        rows = xml_items(payload, "msgBody")
    fields = [
        "BSTOPID",
        "ROUTEID",
        "BUSID",
        "BUS_NUM_PLATE",
        "REST_STOP_COUNT",
        "ARRIVALESTIMATETIME",
        "LATEST_STOP_ID",
        "LATEST_STOP_NAME",
        "REMAIND_SEAT",
        "CONGESTION",
        "LASTBUSYN",
        "DIRCD",
    ]
    return {"provider": "incheon", "bstop_id": bstop_id, "sample_path": str(sample_path), **summarize_rows(rows, fields)}


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Validate bus seat-related fields from official APIs.")
    subparsers = parser.add_subparsers(dest="provider", required=True)

    seoul = subparsers.add_parser("seoul")
    seoul.add_argument("--route-id", required=True)

    gg_loc = subparsers.add_parser("gyeonggi-location")
    gg_loc.add_argument("--route-id", required=True)

    gg_search = subparsers.add_parser("gyeonggi-route-search")
    gg_search.add_argument("--route-name", required=True)

    gg_arr = subparsers.add_parser("gyeonggi-arrival")
    gg_arr.add_argument("--station-id", required=True)
    gg_arr.add_argument("--route-id", required=True)
    gg_arr.add_argument("--sta-order", required=True)

    incheon = subparsers.add_parser("incheon")
    incheon.add_argument("--bstop-id", default=env("INCHEON_BSTOP_ID"))

    args = parser.parse_args()

    if args.provider == "seoul":
        result = validate_seoul(args.route_id)
    elif args.provider == "gyeonggi-route-search":
        result = search_gyeonggi_route(args.route_name)
    elif args.provider == "gyeonggi-location":
        result = validate_gyeonggi_location(args.route_id)
    elif args.provider == "gyeonggi-arrival":
        result = validate_gyeonggi_arrival(args.station_id, args.route_id, args.sta_order)
    elif args.provider == "incheon":
        if not args.bstop_id:
            raise SystemExit("--bstop-id or INCHEON_BSTOP_ID is required.")
        result = validate_incheon_station(args.bstop_id)
    else:
        raise SystemExit(f"Unsupported provider: {args.provider}")

    print_json(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
