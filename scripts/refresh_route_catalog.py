"""Generate a route-order snapshot from the official API; no seat records."""
import json
from datetime import datetime
from pathlib import Path
import collector as c


def main():
    c.load_dotenv()
    config = json.loads((c.ROOT / "config/collection-routes.json").read_text())
    catalog = {}
    for name, route_id in {**config["public"], **config["private"]}.items():
        stations = c.get_route_stations(route_id)
        info = c.xml_items(c.fetch_text(
            "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteInfoItemv2",
            {"serviceKey": c.service_key(), "routeId": route_id, "format": "xml"},
        ), "busRouteInfoItem")
        if not stations or not info:
            raise RuntimeError(f"Missing official route metadata: {name}")
        catalog[name] = {"routeId": route_id, "updatedAt": datetime.now().isoformat(),
                         "info": info[0], "stations": stations}
    target = c.ROOT / "config/route-catalog.json"
    target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({name: {"stops": len(r["stations"]), "info": r["info"]} for name, r in catalog.items()}, ensure_ascii=True))


if __name__ == "__main__":
    main()
