/** Distancia total en km siguiendo el camino real (no línea recta) entre una lista de puntos en orden. */
export async function fetchRouteDistanceKm(points: { lat: number; lng: number }[]): Promise<number | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token || points.length < 2) return null;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  try {
    const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`);
    if (!res.ok) return null;
    const data = await res.json();
    const meters = data.routes?.[0]?.distance;
    return typeof meters === "number" ? meters / 1000 : null;
  } catch {
    return null;
  }
}
