const OPENF1_BASE = "https://api.openf1.org/v1";
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const OPENF1_ENDPOINTS = new Set([
  "car_data",
  "championship_drivers",
  "championship_teams",
  "drivers",
  "intervals",
  "laps",
  "location",
  "meetings",
  "overtakes",
  "pit",
  "position",
  "race_control",
  "sessions",
  "stints",
  "weather"
]);
const OPENF1_QUERY_KEYS = new Set([
  "date",
  "date_end",
  "date_start",
  "driver_number",
  "lap_number",
  "meeting_key",
  "session_key",
  "speed",
  "year"
]);
const WEATHER_QUERY_KEYS = new Set([
  "forecast_days",
  "hourly",
  "latitude",
  "longitude",
  "temperature_unit",
  "timezone",
  "wind_speed_unit"
]);
const WEATHER_FIELDS = new Set([
  "precipitation",
  "precipitation_probability",
  "temperature_2m",
  "weather_code",
  "wind_speed_10m"
]);
const OPENF1_TTL = {
  sessions: 43200,
  meetings: 43200,
  drivers: 21600,
  championship_drivers: 1800,
  championship_teams: 1800,
  position: 1800,
  default: 3600
};

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Expose-Headers": "Retry-After",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function validQuery(searchParams, allowedKeys) {
  if ([...searchParams].length > 32) return false;
  for (const [key, value] of searchParams) {
    const field = key.replace(/(?:>=|<=|>|<)$/, "");
    if (!allowedKeys.has(field) || value.length > 200) return false;
  }
  return true;
}

function openF1CacheTtl(endpoint) {
  return OPENF1_TTL[endpoint] || OPENF1_TTL.default;
}

async function cachedFetch(request, url, ttl) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = url.search;
  cacheUrl.pathname = url.pathname;
  cacheUrl.searchParams.sort();
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  let cached;
  try {
    cached = await cache.match(cacheKey);
  } catch (error) {
    console.error("Cloudflare cache lookup failed.", error);
  }
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-Shared-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: request.signal
  });
  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Accept");
  headers.set("Access-Control-Expose-Headers", "Retry-After");
  headers.set("X-Content-Type-Options", "nosniff");

  if (upstream.ok) {
    headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
    headers.set("X-Shared-Cache", "MISS");
    const result = new Response(upstream.body, { status: upstream.status, headers });
    try {
      await cache.put(cacheKey, result.clone());
    } catch (error) {
      console.error("Cloudflare cache write failed.", error);
    }
    return result;
  }

  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

function validateWeatherParams(params) {
  if (!validQuery(params, WEATHER_QUERY_KEYS)) return false;
  const latitude = Number(params.get("latitude"));
  const longitude = Number(params.get("longitude"));
  const days = Number(params.get("forecast_days"));
  const hourly = (params.get("hourly") || "").split(",");
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isInteger(days) && days >= 1 && days <= 16
    && hourly.length > 0 && hourly.length <= WEATHER_FIELDS.size
    && hourly.every((field) => WEATHER_FIELDS.has(field))
    && params.get("timezone") === "auto";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return response(null, 204);
    if (request.method !== "GET") return response('{"error":"Method not allowed."}', 405);

    try {
      if (url.pathname.startsWith("/v1/")) {
        const endpoint = url.pathname.slice(4);
        if (!OPENF1_ENDPOINTS.has(endpoint) || !validQuery(url.searchParams, OPENF1_QUERY_KEYS)) {
          return response('{"error":"Unsupported OpenF1 request."}', 400);
        }
        const upstream = new URL(`${OPENF1_BASE}/${endpoint}`);
        upstream.search = url.search;
        return await cachedFetch(request, upstream, openF1CacheTtl(endpoint));
      }

      if (url.pathname === "/weather") {
        if (!validateWeatherParams(url.searchParams)) {
          return response('{"error":"Unsupported weather request."}', 400);
        }
        const upstream = new URL(OPEN_METEO_BASE);
        upstream.search = url.search;
        return await cachedFetch(request, upstream, 1800);
      }

      return response('{"error":"Not found."}', 404);
    } catch (error) {
      if (error.name === "AbortError") return response('{"error":"Request aborted."}', 408);
      return response('{"error":"Upstream service unavailable."}', 502);
    }
  }
};
