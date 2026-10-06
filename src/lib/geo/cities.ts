/**
 * Reference cities used to label Qloo heatmap cells, compute the "obvious" (population-ranked)
 * baseline route and order tour stops. Metro populations are rounded (millions) and only used
 * for the baseline comparison.
 */
export type Region = "north-america" | "europe" | "latin-america" | "asia-pacific";

export interface City {
  name: string;
  country: string;
  region: Region;
  lat: number;
  lon: number;
  /** Metro population, millions (rounded). */
  pop: number;
}

export const CITIES: City[] = [
  // North America
  { name: "New York", country: "US", region: "north-america", lat: 40.7128, lon: -74.006, pop: 19.5 },
  { name: "Los Angeles", country: "US", region: "north-america", lat: 34.0522, lon: -118.2437, pop: 12.8 },
  { name: "Chicago", country: "US", region: "north-america", lat: 41.8781, lon: -87.6298, pop: 9.3 },
  { name: "Dallas", country: "US", region: "north-america", lat: 32.7767, lon: -96.797, pop: 8.1 },
  { name: "Houston", country: "US", region: "north-america", lat: 29.7604, lon: -95.3698, pop: 7.5 },
  { name: "Washington", country: "US", region: "north-america", lat: 38.9072, lon: -77.0369, pop: 6.3 },
  { name: "Philadelphia", country: "US", region: "north-america", lat: 39.9526, lon: -75.1652, pop: 6.2 },
  { name: "Miami", country: "US", region: "north-america", lat: 25.7617, lon: -80.1918, pop: 6.1 },
  { name: "Atlanta", country: "US", region: "north-america", lat: 33.749, lon: -84.388, pop: 6.3 },
  { name: "Boston", country: "US", region: "north-america", lat: 42.3601, lon: -71.0589, pop: 4.9 },
  { name: "Phoenix", country: "US", region: "north-america", lat: 33.4484, lon: -112.074, pop: 5.1 },
  { name: "San Francisco", country: "US", region: "north-america", lat: 37.7749, lon: -122.4194, pop: 4.6 },
  { name: "Seattle", country: "US", region: "north-america", lat: 47.6062, lon: -122.3321, pop: 4.1 },
  { name: "Minneapolis", country: "US", region: "north-america", lat: 44.9778, lon: -93.265, pop: 3.7 },
  { name: "San Diego", country: "US", region: "north-america", lat: 32.7157, lon: -117.1611, pop: 3.3 },
  { name: "Denver", country: "US", region: "north-america", lat: 39.7392, lon: -104.9903, pop: 3.0 },
  { name: "Portland", country: "US", region: "north-america", lat: 45.5152, lon: -122.6784, pop: 2.5 },
  { name: "Austin", country: "US", region: "north-america", lat: 30.2672, lon: -97.7431, pop: 2.4 },
  { name: "Nashville", country: "US", region: "north-america", lat: 36.1627, lon: -86.7816, pop: 2.1 },
  { name: "New Orleans", country: "US", region: "north-america", lat: 29.9511, lon: -90.0715, pop: 1.3 },
  { name: "Salt Lake City", country: "US", region: "north-america", lat: 40.7608, lon: -111.891, pop: 1.3 },
  { name: "Asheville", country: "US", region: "north-america", lat: 35.5951, lon: -82.5515, pop: 0.5 },
  { name: "Boulder", country: "US", region: "north-america", lat: 40.015, lon: -105.2705, pop: 0.3 },
  { name: "Toronto", country: "CA", region: "north-america", lat: 43.6532, lon: -79.3832, pop: 6.7 },
  { name: "Montreal", country: "CA", region: "north-america", lat: 45.5019, lon: -73.5674, pop: 4.3 },
  { name: "Vancouver", country: "CA", region: "north-america", lat: 49.2827, lon: -123.1207, pop: 2.8 },
  // Europe
  { name: "London", country: "GB", region: "europe", lat: 51.5072, lon: -0.1276, pop: 14.8 },
  { name: "Paris", country: "FR", region: "europe", lat: 48.8566, lon: 2.3522, pop: 12.3 },
  { name: "Madrid", country: "ES", region: "europe", lat: 40.4168, lon: -3.7038, pop: 6.8 },
  { name: "Barcelona", country: "ES", region: "europe", lat: 41.3874, lon: 2.1686, pop: 5.6 },
  { name: "Berlin", country: "DE", region: "europe", lat: 52.52, lon: 13.405, pop: 4.6 },
  { name: "Milan", country: "IT", region: "europe", lat: 45.4642, lon: 9.19, pop: 4.3 },
  { name: "Rome", country: "IT", region: "europe", lat: 41.9028, lon: 12.4964, pop: 4.3 },
  { name: "Hamburg", country: "DE", region: "europe", lat: 53.5511, lon: 9.9937, pop: 3.4 },
  { name: "Lisbon", country: "PT", region: "europe", lat: 38.7223, lon: -9.1393, pop: 2.9 },
  { name: "Manchester", country: "GB", region: "europe", lat: 53.4808, lon: -2.2426, pop: 2.8 },
  { name: "Amsterdam", country: "NL", region: "europe", lat: 52.3676, lon: 4.9041, pop: 2.5 },
  { name: "Stockholm", country: "SE", region: "europe", lat: 59.3293, lon: 18.0686, pop: 2.4 },
  { name: "Brussels", country: "BE", region: "europe", lat: 50.8503, lon: 4.3517, pop: 2.1 },
  { name: "Vienna", country: "AT", region: "europe", lat: 48.2082, lon: 16.3738, pop: 2.0 },
  { name: "Copenhagen", country: "DK", region: "europe", lat: 55.6761, lon: 12.5683, pop: 2.1 },
  { name: "Dublin", country: "IE", region: "europe", lat: 53.3498, lon: -6.2603, pop: 1.5 },
  { name: "Glasgow", country: "GB", region: "europe", lat: 55.8642, lon: -4.2518, pop: 1.7 },
  { name: "Lyon", country: "FR", region: "europe", lat: 45.764, lon: 4.8357, pop: 2.3 },
  { name: "Bristol", country: "GB", region: "europe", lat: 51.4545, lon: -2.5879, pop: 0.7 },
  { name: "Utrecht", country: "NL", region: "europe", lat: 52.0907, lon: 5.1214, pop: 0.9 },
  { name: "Leipzig", country: "DE", region: "europe", lat: 51.3397, lon: 12.3731, pop: 0.6 },
  // Latin America
  { name: "Mexico City", country: "MX", region: "latin-america", lat: 19.4326, lon: -99.1332, pop: 21.8 },
  { name: "São Paulo", country: "BR", region: "latin-america", lat: -23.5558, lon: -46.6396, pop: 22.4 },
  { name: "Buenos Aires", country: "AR", region: "latin-america", lat: -34.6037, lon: -58.3816, pop: 15.4 },
  { name: "Bogotá", country: "CO", region: "latin-america", lat: 4.711, lon: -74.0721, pop: 11.3 },
  { name: "Santiago", country: "CL", region: "latin-america", lat: -33.4489, lon: -70.6693, pop: 6.9 },
  { name: "Guadalajara", country: "MX", region: "latin-america", lat: 20.6597, lon: -103.3496, pop: 5.3 },
  { name: "Medellín", country: "CO", region: "latin-america", lat: 6.2442, lon: -75.5812, pop: 4.1 },
  { name: "San Juan", country: "PR", region: "latin-america", lat: 18.4655, lon: -66.1057, pop: 2.0 },
  // Asia-Pacific
  { name: "Tokyo", country: "JP", region: "asia-pacific", lat: 35.6762, lon: 139.6503, pop: 37.1 },
  { name: "Seoul", country: "KR", region: "asia-pacific", lat: 37.5665, lon: 126.978, pop: 25.5 },
  { name: "Osaka", country: "JP", region: "asia-pacific", lat: 34.6937, lon: 135.5023, pop: 19.0 },
  { name: "Manila", country: "PH", region: "asia-pacific", lat: 14.5995, lon: 120.9842, pop: 14.4 },
  { name: "Bangkok", country: "TH", region: "asia-pacific", lat: 13.7563, lon: 100.5018, pop: 11.2 },
  { name: "Jakarta", country: "ID", region: "asia-pacific", lat: -6.2088, lon: 106.8456, pop: 11.1 },
  { name: "Singapore", country: "SG", region: "asia-pacific", lat: 1.3521, lon: 103.8198, pop: 6.0 },
  { name: "Sydney", country: "AU", region: "asia-pacific", lat: -33.8688, lon: 151.2093, pop: 5.3 },
  { name: "Melbourne", country: "AU", region: "asia-pacific", lat: -37.8136, lon: 144.9631, pop: 5.2 },
  { name: "Auckland", country: "NZ", region: "asia-pacific", lat: -36.8485, lon: 174.7633, pop: 1.7 },
];

export const REGION_LABELS: Record<Region, string> = {
  // The North American heatmap is scoped to the United States (see REGION_LOCATION_QUERY).
  "north-america": "US",
  europe: "Europe",
  "latin-america": "Latin America",
  "asia-pacific": "Asia-Pacific",
};

/** Name Qloo understands for `filter.location.query` when scoping a heatmap to a region. */
export const REGION_LOCATION_QUERY: Partial<Record<Region, string>> = {
  "north-america": "United States",
};

export function citiesIn(region: Region): City[] {
  return CITIES.filter((c) => c.region === region);
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest reference city within `maxKm`, or undefined. */
export function nearestCity(
  point: { lat: number; lon: number },
  maxKm = 80,
  pool: City[] = CITIES,
): City | undefined {
  let best: City | undefined;
  let bestKm = Infinity;
  for (const city of pool) {
    const km = haversineKm(point, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return bestKm <= maxKm ? best : undefined;
}

export function findCityByName(name: string): City | undefined {
  const n = normalizeName(name);
  return CITIES.find((c) => normalizeName(c.name) === n);
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Detects a region mentioned in free text ("US tour", "Europe", "LATAM"...). */
export function detectRegion(text: string): Region | undefined {
  const t = ` ${normalizeName(text)} `;
  if (/ (europe|european|eu|uk|germany|france|spain|italy) /.test(t)) return "europe";
  if (/ (latin america|latam|south america|mexico|brazil|argentina|colombia) /.test(t)) return "latin-america";
  if (/ (asia|apac|japan|australia|korea|pacific) /.test(t)) return "asia-pacific";
  if (/ (us|usa|u s|united states|america|american|north america|canada|stateside) /.test(t))
    return "north-america";
  return undefined;
}
