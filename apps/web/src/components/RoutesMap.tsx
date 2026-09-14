import Map, { Marker, Popup } from "react-map-gl";
import { useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { useThemeStore } from "../store/theme";

export type MapMarker = { id: string; lat: number; lng: number; label: string };

const DEFAULT_CENTER = { latitude: 12.1364, longitude: -86.2514 }; // Managua, como fallback

/** Mapa de rastreo en tiempo real. Sin VITE_MAPBOX_TOKEN configurado, muestra un aviso en vez de romper. */
export function RoutesMap({ markers }: { markers: MapMarker[] }) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const theme = useThemeStore((s) => s.theme);

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

  const first = markers[0];

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <Map
        mapboxAccessToken={token}
        initialViewState={{
          latitude: first?.lat ?? DEFAULT_CENTER.latitude,
          longitude: first?.lng ?? DEFAULT_CENTER.longitude,
          zoom: 11,
        }}
        style={{ width: "100%", height: "100%" }}
        // El estilo del mapa sigue el tema de la app (claro/oscuro), en vez de quedar fijo en oscuro.
        mapStyle={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
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
