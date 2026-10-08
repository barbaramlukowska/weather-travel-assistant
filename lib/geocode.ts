// City → coordinates and the place's canonical name. Plain fetch, nothing
// server-only, so it has two callers: the weather tools on the server and the
// remember tool in the browser (Open-Meteo sends
// access-control-allow-origin: *). A plain function, not a tool() — the model
// never calls it directly.
export type GeocodeResult =
  | { found: true; latitude: number; longitude: number; name: string; country: string }
  | { found: false };

// The shape callers inject in tests and evals instead of the real network.
export type Geocode = (city: string) => Promise<GeocodeResult>;

// `init` lets a caller pass a signal: the browser gives up on a hung request
// instead of freezing the chat (components/chat/client-tools.ts).
export async function geocodeCity(city: string, init?: RequestInit): Promise<GeocodeResult> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=en&format=json`,
    init,
  );
  // A failed request is a technical error, not "city not found" —
  // fail loudly so the two aren't confused. Callers' try/catch handles it.
  if (!res.ok) {
    throw new Error(`Geocoding request failed with status ${res.status}`);
  }
  const geo = await res.json();

  // Genuinely not found — a semantic result for the model to explain.
  if (!geo.results || geo.results.length === 0) {
    return { found: false };
  }

  const { latitude, longitude, name, country } = geo.results[0];
  return { found: true, latitude, longitude, name, country };
}
