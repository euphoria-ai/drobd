/**
 * Current conditions for the user's location.
 *
 * Feeds two things: the line above today's suggested outfit, and the `weather`
 * label handed to the stylist so its picks are dressed for the day. Both are
 * nice-to-haves -- if permission is denied, the device has no fix, or the
 * forecast service is unreachable, this must fail soft to `null` rather than
 * blocking the home screen. It never throws to the UI.
 */

import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

export interface Weather {
  /** Best available place name, or null when reverse-geocoding gave nothing. */
  city: string | null;
  /** Whole degrees Celsius, or null if the forecast omitted it. */
  tempC: number | null;
  /** Human-facing condition, e.g. "Cloudy". */
  condition: string;
  /** Lower-case shorthand suitable to pass to the stylist, e.g. "cloudy". */
  label: string;
}

/**
 * Map a WMO weather code (open-meteo's `weather_code`) to a short condition.
 * Grouped rather than exhaustive: the stylist and the header only need the
 * gist, not "light freezing drizzle".
 */
function describeWeatherCode(code: number): { condition: string; label: string } {
  if (code === 0) return { condition: 'Clear', label: 'clear' };
  if (code <= 2) return { condition: 'Partly cloudy', label: 'partly cloudy' };
  if (code === 3) return { condition: 'Cloudy', label: 'cloudy' };
  if (code <= 48) return { condition: 'Foggy', label: 'foggy' };
  if (code <= 57) return { condition: 'Drizzle', label: 'drizzly' };
  if (code <= 67) return { condition: 'Rainy', label: 'rainy' };
  if (code <= 77) return { condition: 'Snowy', label: 'snowy' };
  if (code <= 82) return { condition: 'Rain showers', label: 'rainy' };
  if (code <= 86) return { condition: 'Snow showers', label: 'snowy' };
  if (code <= 99) return { condition: 'Thunderstorm', label: 'stormy' };
  return { condition: 'Clear', label: 'clear' };
}

export const weatherKeys = {
  current: ['weather', 'current'] as const,
};

interface ForecastResponse {
  current?: { temperature_2m?: number; weather_code?: number };
}

export function useWeather() {
  return useQuery<Weather | null>({
    queryKey: weatherKeys.current,
    queryFn: async (): Promise<Weather | null> => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return null;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const { latitude, longitude } = position.coords;

        // Best-effort: a name makes the header friendlier but the forecast
        // works without one.
        let city: string | null = null;
        try {
          const places = await Location.reverseGeocodeAsync({ latitude, longitude });
          const place = places[0];
          city = place?.city ?? place?.subregion ?? place?.region ?? null;
        } catch {
          city = null;
        }

        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
          `&longitude=${longitude}&current=temperature_2m,weather_code`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = (await response.json()) as ForecastResponse;
        const current = data.current;
        if (!current) return null;

        const tempC =
          typeof current.temperature_2m === 'number'
            ? Math.round(current.temperature_2m)
            : null;
        const { condition, label } = describeWeatherCode(current.weather_code ?? 0);

        return { city, tempC, condition, label };
      } catch {
        // Any failure -- no fix, offline, denied mid-flight -- degrades to no
        // weather rather than an error surface.
        return null;
      }
    },
    // Conditions move slowly; refetching on every focus would spend a location
    // fix for nothing.
    staleTime: 30 * 60_000,
    retry: false,
  });
}
