import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cls } from "../../lib/cls";

// Phase-8 hybrid map card (06-hybrid-map-spec.md).
//
// A STATUS VIEW, not a pannable map: every gesture is disabled so a finger
// that starts on the card still scrolls the page. It renders the geofence
// circle, the live pin and the state chip; if the tile host is blocked or
// offline, the CSS street placeholder underneath stays visible and the
// overlays still read correctly (spec acceptance).
//
// It never calls geolocation itself — it only draws the fix EmployeeToday
// already has, and the in/out-of-zone verdict is computed by the caller with
// the SAME helper the RPC path uses, so UI and server can't disagree.

const TILE_URL = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_URL_LIGHT = "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = "© OpenStreetMap · © CARTO";

const ZONE_STYLE = {
  in: { fill: "rgba(67,217,160,.08)", stroke: "rgba(67,217,160,.35)" },
  poor: { fill: "rgba(255,184,77,.08)", stroke: "rgba(255,184,77,.38)" },
  out: { fill: "rgba(255,107,112,.07)", stroke: "rgba(255,107,112,.4)" },
  unknown: { fill: "rgba(180,196,210,.05)", stroke: "rgba(180,196,210,.22)" },
};

export default function LocationMap({ center, radiusMeters, position, state, chipText }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  // mapReady: Leaflet booted, so the geo-accurate circle + pin are drawn.
  // tilesOk: at least one tile really arrived — only then do we hide the
  // placeholder streets. Leaflet's own `load` event fires even when every
  // tile 404s/is blocked, so it can't be trusted for this.
  const [mapReady, setMapReady] = useState(false);
  const [tilesOk, setTilesOk] = useState(false);

  // Leaflet is loaded lazily: the map is below the fold on first paint and
  // employees who never open اليوم shouldn't pay for it.
  useEffect(() => {
    let alive = true;
    let map;
    import("leaflet").then(({ default: L }) => {
      if (!alive || !hostRef.current || mapRef.current) return;
      map = L.map(hostRef.current, {
        center: [center.lat, center.lng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        tap: false,
        inertia: false,
      });
      const dark = !document.documentElement.classList.contains("light");
      const tiles = L.tileLayer(dark ? TILE_URL : TILE_URL_LIGHT, {
        maxZoom: 19,
        attribution: TILE_ATTRIBUTION,
        crossOrigin: true,
      });
      // Per-tile success — a blocked/offline host never fires this, so the
      // placeholder streets stay visible while the overlays still render.
      tiles.on("tileload", () => { if (alive) setTilesOk(true); });
      tiles.addTo(map);

      const circle = L.circle([center.lat, center.lng], {
        radius: radiusMeters,
        weight: 1.5,
        color: ZONE_STYLE.unknown.stroke,
        fillColor: ZONE_STYLE.unknown.fill,
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);

      const pin = L.marker([center.lat, center.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "lmap-pin-icon",
          html: '<span class="lmap-pin"><i></i></span><span class="lmap-pin-stem"></span>',
          iconSize: [25, 34],
          iconAnchor: [12, 34],
        }),
        opacity: 0,
      }).addTo(map);

      mapRef.current = map;
      layersRef.current = { L, tiles, circle, pin };
      setMapReady(true);
    }).catch(() => {
      // Leaflet chunk unavailable (offline first visit) — placeholder only.
    });

    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center.lat, center.lng, radiusMeters]);

  // Repaint the zone colour when the verdict changes. `mapReady` is a dep so
  // the first paint also runs once Leaflet finishes booting (the layers don't
  // exist yet on the initial render).
  useEffect(() => {
    const { circle } = layersRef.current;
    if (!circle) return;
    const style = ZONE_STYLE[state] || ZONE_STYLE.unknown;
    circle.setStyle({ color: style.stroke, fillColor: style.fill });
  }, [state, mapReady]);

  // Move the pin as fixes arrive, and always frame the whole geofence circle
  // (plus the pin when it sits outside it) so the zone is readable — fitting
  // to the two points alone zooms so far in that the circle leaves the card.
  useEffect(() => {
    const map = mapRef.current;
    const { L, pin, circle } = layersRef.current;
    if (!map || !circle) return;
    if (position) {
      pin.setLatLng([position.lat, position.lng]);
      pin.setOpacity(1);
    }
    const bounds = circle.getBounds();
    if (position) bounds.extend([position.lat, position.lng]);
    // Extra top padding keeps a far-away pin from hiding under the chip.
    map.fitBounds(bounds, {
      paddingTopLeft: [18, 46],
      paddingBottomRight: [18, 22],
      animate: mapReady,
    });
  }, [position?.lat, position?.lng, center.lat, center.lng, radiusMeters, mapReady]);

  return (
    <div className={cls("lmap", tilesOk && "has-tiles", mapReady && "has-map")} data-state={state}>
      {/* Placeholder streets: visible until tiles load, and the permanent
          look when the tile host is blocked/offline. */}
      <span className="lmap-streets" aria-hidden="true">
        <i /><i /><i /><i />
        <b /><b /><b /><b />
      </span>
      {/* Leaflet draws the geo-accurate circle + pin even with no tiles. */}
      <div className="lmap-canvas" ref={hostRef} aria-hidden="true" />
      {/* Pure-CSS stand-in only when Leaflet itself never booted. */}
      {!mapReady ? (
        <span className="lmap-fallback-zone" aria-hidden="true">
          <span className="lmap-fallback-circle" />
          {position ? <span className="lmap-fallback-pin"><i /></span> : null}
        </span>
      ) : null}
      <span className="lmap-chip" role="status" aria-live="polite">
        <i aria-hidden="true" />
        {chipText}
      </span>
      <span className="lmap-scrim" aria-hidden="true" />
    </div>
  );
}
