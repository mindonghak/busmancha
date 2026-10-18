"""Generate a route-order snapshot from the official API; no seat records."""
import json
from datetime import datetime
from pathlib import Path
import collector as c


def main():
    c.load_dotenv()
    config = json.loads((c.ROOT / "config/collection-routes.json").read_text())
    target = c.ROOT / "config/route-catalog.json"
    existing = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    catalog = {}
    failures = []
    for name, route_id in {**config["public"], **config["private"]}.items():
        try:
            stations = c.get_route_stations(route_id)
            info = c.xml_items(c.fetch_text(
                "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteInfoItemv2",
                {"serviceKey": c.service_key(), "routeId": route_id, "format": "xml"},
            ), "busRouteInfoItem")
            if not stations or not info or info[0].get("routeName", "").upper() != name.upper():
                raise RuntimeError("Missing or mismatched route metadata")
            catalog[name] = {"routeId": route_id, "updatedAt": datetime.now().isoformat(),
                             "info": info[0], "stations": stations}
        except Exception as exc:
            failures.append(name)
            # Preserve its original age: stale metadata still expires normally.
            if name in existing and existing[name]["routeId"] == route_id:
                catalog[name] = existing[name]
            c.log(f"catalog route={name} error={type(exc).__name__}")
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)
    print(json.dumps({name: {"stops": len(r["stations"]), "info": r["info"]} for name, r in catalog.items()}, ensure_ascii=True))
    if failures:
        raise SystemExit(f"Could not refresh routes: {', '.join(failures)}")


if __name__ == "__main__":
    main()
