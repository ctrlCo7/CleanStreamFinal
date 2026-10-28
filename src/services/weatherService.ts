/**
 * Rain forecast for a report's location, from Open-Meteo (free, no API key, PAGASA-
 * comparable global models). Used to raise the flood risk of waste that blocks a
 * waterway when heavy rain is coming. Best-effort: any failure just means no forecast.
 */
import { RainOutlook } from '../types';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: RainOutlook }>();

interface OpenMeteoHourly {
  hourly?: { time?: string[]; precipitation?: number[]; precipitation_probability?: number[] };
}

/** PAGASA's rainfall categories, per hour: light < 2.5 mm, moderate < 7.5, heavy beyond. */
export function rainOutlookFrom(json: OpenMeteoHourly, now: Date = new Date()): RainOutlook | undefined {
  const times = json.hourly?.time ?? [];
  const mm = json.hourly?.precipitation ?? [];
  const prob = json.hourly?.precipitation_probability ?? [];
  if (times.length === 0 || mm.length !== times.length) return undefined;

  let next24hMm = 0, next72hMm = 0, maxHourlyMm = 0, maxProbability = 0;
  times.forEach((t, i) => {
    // Open-Meteo returns local times without an offset when timezone=Asia/Manila.
    const at = new Date(`${t}:00+08:00`).getTime();
    const ahead = at - now.getTime();
    // Hours still (partly) ahead, up to 72 hours out.
    if (ahead <= -3600_000 || ahead >= 72 * 3600_000) return;
    const v = Math.max(0, mm[i] ?? 0);
    next72hMm += v;
    if (ahead < 24 * 3600_000) {
      next24hMm += v;
      maxHourlyMm = Math.max(maxHourlyMm, v);
      maxProbability = Math.max(maxProbability, prob[i] ?? 0);
    }
  });

  const level: RainOutlook['level'] =
    next24hMm >= 50 || maxHourlyMm >= 7.5 ? 'heavy'
      : next24hMm >= 15 || maxHourlyMm >= 2.5 ? 'moderate'
        : next24hMm >= 1 ? 'light'
          : 'none';
  return {
    level,
    next24hMm: Math.round(next24hMm * 10) / 10,
    next72hMm: Math.round(next72hMm * 10) / 10,
    maxProbability: Math.round(maxProbability),
    fetchedAt: now.toISOString(),
  };
}

export async function getRainOutlook(latitude: number, longitude: number, timeoutMs = 6000): Promise<RainOutlook | undefined> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) return undefined;
  // ~1 km grid: nearby reports share one request.
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const url = `${ENDPOINT}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}`
    + '&hourly=precipitation,precipitation_probability&forecast_days=4&timezone=Asia%2FManila';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return undefined;
    const value = rainOutlookFrom(await res.json());
    if (value) cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn('[Weather] Forecast unavailable (non-fatal):', e);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
