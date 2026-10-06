import Map, { Marker, Popup, type MapRef } from "react-map-gl";
import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapMarker = { id: string; lat: number; lng: number; label: string };

// Si no hay ningún camión activo con GPS todavía, en vez de abrir en una ciudad fija (quedó
// de pruebas en Managua, no tiene nada que ver con dónde opera cada empresa) se centra en la
// ubicación real de quien mira el panel - cada empresa ve SU zona, no la de otra.
const WORLD_VIEW = { latitude: 0, longitude: 0, zoom: 1.5 };

/** Mapa de rastreo en tiempo real. Sin VITE_MAPBOX_TOKEN configurado, muestra un aviso en vez de romper. */
export function RoutesMap({ markers }: { markers: MapMarker[] }) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const first = markers[0];

  const mapRef = useRef<MapRef>(null);
  const [geoCenter, setGeoCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  // La geolocalización NO bloquea el dibujo del mapa: se pide en segundo plano y, si llega,
  // el mapa se mueve a la zona de quien mira (antes esperaba hasta 5 s con un bloque gris).
  useEffect(() => {
    if (first || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeoCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { timeout: 5000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!first]);

  useEffect(() => {
    if (!geoCenter || first) return;
    mapRef.current?.flyTo({ center: [geoCenter.longitude, geoCenter.latitude], zoom: 12, duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoCenter]);

  if (!token) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">Mapa no configurado</p>
        <p>
          Definí <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">VITE_MAPBOX_TOKEN</code> para ver el
          rastreo en vivo (Mapbox tiene un tier gratuito de 50,000 cargas/mes).
        </p>
      </div>
    );
  }

  const view = first ? { latitude: first.lat, longitude: first.lng, zoom: 11 } : WORLD_VIEW;

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={view}
        style={{ width: "100%", height: "100%" }}
        // "Standard" (vector 3D con edificios/terreno/luz dinámica según la hora) se ve mucho
        // más real que una foto satelital plana - los estilos "light"/"dark" son casi en
        // escala de grises, pensados como fondo de UI, no un mapa real. Al ser vectorial (no
        // raster satelital) de paso pesa menos para quien lo abre con datos móviles.
        mapStyle="mapbox://styles/mapbox/standard"
      >
        {markers.map((m) => (
          <Marker key={m.id} latitude={m.lat} longitude={m.lng} onClick={() => setSelected(m)}>
            {/* Punto de marca propio (en vez del pin default de Mapbox) para que resalte igual en ambos estilos de mapa. */}
            <div className="h-3 w-3 rounded-full border-2 border-white bg-amber-400 shadow" />
          </Marker>
        ))}
        {selected && (
          <Popup latitude={selected.lat} longitude={selected.lng} onClose={() => setSelected(null)} closeButton>
            <span className="text-sm text-slate-900">{selected.label}</span>
          </Popup>
        )}
      </Map>
    </div>
  );
}
