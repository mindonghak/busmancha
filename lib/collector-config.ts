export type RouteName = "M4137" | "M4130" | "G6009" | "6002";

export const routes: Record<RouteName, string> = {
  M4137: "234001622",
  M4130: "234001577",
  G6009: "233000322",
  "6002": "233000136",
};

export const defaultStationLimits: Record<RouteName, number> = {
  M4137: 12,
  M4130: 14,
  G6009: 14,
  "6002": 18,
};

export const serviceWindows: Record<RouteName, [string, string]> = {
  M4137: ["05:00", "00:10"],
  M4130: ["05:00", "00:10"],
  G6009: ["05:10", "00:00"],
  "6002": ["05:00", "23:55"],
};

export const weatherPoints = {
  dongtan_hwaseong: { name: "동탄/화성", nx: 62, ny: 119 },
  gangnam: { name: "강남", nx: 61, ny: 125 },
  seoul_station: { name: "서울역", nx: 60, ny: 126 },
  jamsil: { name: "잠실", nx: 62, ny: 126 },
} as const;

export type WeatherAreaKey = keyof typeof weatherPoints;

export const gyeonggiRouteStationsUrl =
  "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2";
export const gyeonggiArrivalUrl = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2";
export const kmaUltraShortNowcastUrl =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
