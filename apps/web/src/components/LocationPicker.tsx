import { useEffect, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Input } from "./Input";
import { Button } from "./Button";
import { SearchIcon } from "./icons";

const DEFAULT_VIEW = { latitude: -0.1807, longitude: -78.4678, zoom: 6 }; // Ecuador, como fallback

// Si pegan coordenadas directo (ej. "0.018628, -78.158026"), se usan tal cual - no hace
// falta pasar por el geocodificador para eso.
function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

type Suggestion = { id: string; placeName: string; lat: number; lng: number };

/**
 * Selector de GPS propio: buscador de dirección con sugerencias en vivo (Mapbox Geocoding,
 * autocomplete) + mapa satelital donde también se puede tocar directo para ubicar el punto a
 * mano. Sin VITE_MAPBOX_TOKEN, avisa en vez de romper (mismo criterio que RoutesMap.tsx).
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
  className = "",
}: {
  lat: number | null;
  lng: number | null;
  onChange: (v: { lat: number; lng: number; address?: string }) => void;
  className?: string;
}) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [viewState, setViewState] = useState(lat != null && lng != null ? { latitude: lat, longitude: lng, zoom: 14 } : DEFAULT_VIEW);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sugerencias en vivo mientras se tipea (con debounce, para no pegarle a la API en cada tecla).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!token || trimmed.length < 3 || parseCoordinates(trimmed)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${token}&autocomplete=true&limit=5`
        );
        const data = await res.json();
        const features = (data.features ?? []) as { id: string; place_name: string; center: [number, number] }[];
        setSuggestions(features.map((f) => ({ id: f.id, placeName: f.place_name, lng: f.center[0], lat: f.center[1] })));
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token]);

  if (!token) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-100 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        Ubicación no configurada - falta <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">VITE_MAPBOX_TOKEN</code>.
      </div>
    );
  }

  function selectSuggestion(s: Suggestion) {
    setQuery(s.placeName);
    setSuggestions([]);
    setShowSuggestions(false);
    setViewState({ latitude: s.lat, longitude: s.lng, zoom: 15 });
    onChange({ lat: s.lat, lng: s.lng, address: s.placeName });
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setShowSuggestions(false);

    const coords = parseCoordinates(query);
    if (coords) {
      setViewState({ latitude: coords.lat, longitude: coords.lng, zoom: 15 });
      onChange(coords);
      setSearching(false);
      return;
    }

    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]!);
      setSearching(false);
      return;
    }

    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`);
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) {
        setSearchError("No se encontró esa dirección");
        return;
      }
      const [foundLng, foundLat] = feature.center as [number, number];
      setViewState({ latitude: foundLat, longitude: foundLng, zoom: 15 });
      onChange({ lat: foundLat, lng: foundLng, address: feature.place_name });
    } catch {
      setSearchError("No se pudo buscar la dirección");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative flex items-end gap-2">
        <Input
          preserveCase
          label="Buscar dirección"
          placeholder="Ej. Parque central, Cayambe"
          icon={<SearchIcon />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          containerClassName="flex-1"
        />
        <Button type="button" variant="secondary" onClick={search} disabled={searching}>
          {searching ? "..." : "Buscar"}
        </Button>

        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-300 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s)}
                  className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {s.placeName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {searchError && <p className="text-sm text-red-500 dark:text-red-400">{searchError}</p>}

      <div className="h-56 overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={token}
          // "Standard" (vector 3D con edificios/terreno/luz dinámica) se ve mucho más real que
          // una foto satelital plana, y de paso pesa menos por ser vectorial, no raster.
          mapStyle="mapbox://styles/mapbox/standard"
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
          cursor="crosshair"
        >
          {lat != null && lng != null && (
            <Marker latitude={lat} longitude={lng}>
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-400 shadow" />
            </Marker>
          )}
        </Map>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Buscá una dirección o tocá el mapa para ubicar el punto."}
      </p>
    </div>
  );
}
