"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, Star, X } from "lucide-react";
import type { RouteOption } from "@/lib/public-routes";

const storageKey = "busmancha.favoriteRoutes.v1";

export function useFavoriteRoutes() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const ready = useRef(false);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(value)) setFavorites(value.filter((r): r is string => typeof r === "string"));
    } catch { /* Storage may be unavailable in private browsing. */ }
    ready.current = true;
  }, []);
  const toggleFavorite = (name: string) => setFavorites(current => {
    const next = current.includes(name) ? current.filter(r => r !== name) : [...current, name];
    if (ready.current) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep session favorites. */ }
    }
    return next;
  });
  return { favorites, toggleFavorite };
}

export type RouteSelectorProps = {
  routes: RouteOption[]; value: string; onChange: (route: string) => void;
  favorites: string[]; toggleFavorite: (route: string) => void;
};

export default function RouteSelector({ routes, value, onChange, favorites, toggleFavorite }: RouteSelectorProps) {
  const [open, setOpen] = useState(!value);
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState("all");
  const [limit, setLimit] = useState(30);
  const active = routes.find(r => r.name === value);
  const saved = routes.filter(r => favorites.includes(r.name));
  const matches = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase();
    return routes.filter(r => (scope !== "favorites" || favorites.includes(r.name)) &&
      `${r.name} ${r.region} ${r.start} ${r.end}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => Number(favorites.includes(b.name)) - Number(favorites.includes(a.name)) ||
        Number(b.name.toLowerCase() === needle) - Number(a.name.toLowerCase() === needle) ||
        a.name.localeCompare(b.name, "en", { numeric: true }));
  }, [routes, favorites, scope, term]);
  const choose = (name: string) => { onChange(name); setOpen(false); };
  const star = (name: string) => <button type="button" className={`favoriteButton ${favorites.includes(name) ? "isFavorite" : ""}`}
    aria-label={`${name} 즐겨찾기 ${favorites.includes(name) ? "해제" : "등록"}`}
    title={`즐겨찾기 ${favorites.includes(name) ? "해제" : "등록"}`} aria-pressed={favorites.includes(name)}
    onClick={() => toggleFavorite(name)}><Star size={18} fill={favorites.includes(name) ? "currentColor" : "none"} /></button>;

  return <div className="busSelector">
    <div className="busSelectorLabel"><span>버스번호</span><small>{routes.length ? `${routes.length}개 노선` : "노선 불러오는 중"}</small></div>
    {saved.length > 0 ? <div className="favoriteShortcuts" aria-label="즐겨찾는 버스">
      {saved.map(r => <button type="button" key={r.name} aria-pressed={value === r.name} onClick={() => choose(r.name)}><Star size={13} fill="currentColor" />{r.name}</button>)}
    </div> : null}
    <div className="selectedBus">
      <button type="button" className="busPickerToggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span><strong>{active?.name ?? "버스 찾기"}</strong>{active ? <small>{active.start} ↔ {active.end}</small> : <small>번호 또는 지역으로 검색</small>}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {active ? star(active.name) : null}
    </div>
    {open ? <div className="busBrowser">
      <div className="busSearch"><Search size={17} /><input aria-label="버스번호 또는 지역 검색" placeholder="예: 1550-1, 동탄, 수원" value={term} onChange={e => { setTerm(e.target.value); setLimit(30); }} />
        {term ? <button type="button" title="검색어 지우기" aria-label="검색어 지우기" onClick={() => setTerm("")}><X size={16} /></button> : null}
      </div>
      <div className="busScopes">{[["all", "전체 노선"], ["favorites", `즐겨찾기 ${saved.length}`]].map(([id, label]) => <button type="button" key={id} aria-pressed={scope === id} onClick={() => { setScope(id); setLimit(30); }}>{label}</button>)}<small>{matches.length}개</small></div>
      <div className="busList" aria-label="노선 검색 결과">
        {matches.slice(0, limit).map(r => <div className={`busRow ${value === r.name ? "selected" : ""}`} key={r.name}>
          <button type="button" className="busChoice" aria-pressed={value === r.name} onClick={() => choose(r.name)}>
            <span className="busName"><strong>{r.name}</strong>{r.samples < 300 || r.days < 3 ? <span className="sampleBadge">표본 적음</span> : null}</span>
            <span className="busEndpoints">{r.start} ↔ {r.end}</span>
            <small>{r.region} · {r.days}일 · {r.samples.toLocaleString("ko-KR")}건</small>
          </button>{star(r.name)}
        </div>)}
        {!matches.length ? <p className="busEmpty">{scope === "favorites" && !term ? "별을 눌러 자주 타는 버스를 등록해 주세요." : "일치하는 공개 노선이 없습니다."}</p> : null}
        {matches.length > limit ? <button type="button" className="busMore" onClick={() => setLimit(n => n + 30)}>노선 더 보기 ({matches.length - limit}개)</button> : null}
      </div>
      <p className="favoriteFootnote">즐겨찾기는 현재 기기·브라우저에 저장됩니다.</p>
    </div> : null}
    {active ? <p className="selectedCoverage">관측 {active.days}일 · {active.samples.toLocaleString("ko-KR")}건{active.lastDate ? ` · 최근 ${active.lastDate}` : ""}</p> : null}
  </div>;
}
