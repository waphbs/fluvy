import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def patch(path, pairs):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    for old, new, label in pairs:
        if old not in text:
            raise SystemExit(f'anchor missing in {path}: {label}')
        text = text.replace(old, new, 1)
        print('patched', os.path.basename(path), label)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


roles = os.path.join('packages', 'cards', 'src', 'strategy', 'energy-roles.ts')
patch(
    roles,
    [
        (
            """  const forecastDays = energies.filter(forecastDay);
  const solarForecastTomorrow = forecastDays.find((id) => TOMORROW.test(home.label(id)));
  const solarForecast = forecastDays.find(
    (id) =>
      id !== solarForecastTomorrow &&
      (TODAY.test(home.label(id)) || DAILY.test(home.label(id))),
  );""",
            """  const forecastDays = energies.filter(forecastDay);
  // A forecast that names its day outright ("Forecast Day 3"): the day's total is its state, and the hours may be
  // missing, so the card reads the state when there are none. Today and tomorrow come first, an explicit "Day 3"
  // beats the "today" their device's name lends them.
  const DAY_OF = /(?:day|día|dia|jour|tag|journée|giorno|dzień|día|dag|日目|일)\\s*_?\\s*(\\d+)/i;
  const dayOf = (id: string): number | null => {
    const words = `${home.label(id)} ${id}`;
    const named = DAY_OF.exec(words);
    if (named?.[1] !== undefined) return Math.max(0, Number(named[1]) - 1);
    if (TOMORROW.test(words)) return 1;
    if (TODAY.test(words) || DAILY.test(words)) return 0;
    return null;
  };
  const byDay = new Map<number, string>();
  for (const id of energies) {
    if (!forecastReading(id)) continue;
    const offset = dayOf(id);
    if (offset === null || byDay.has(offset)) continue;
    byDay.set(offset, id);
  }
  const solarForecastDays: string[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const id = byDay.get(offset);
    if (id === undefined) break;
    solarForecastDays.push(id);
  }
  const solarForecastTomorrow =
    byDay.get(1) ?? forecastDays.find((id) => TOMORROW.test(home.label(id)));
  const solarForecast =
    byDay.get(0) ??
    forecastDays.find(
      (id) =>
        id !== solarForecastTomorrow &&
        (TODAY.test(home.label(id)) || DAILY.test(home.label(id))),
    );""",
            'day-indexed forecasts',
        ),
        (
            """  const forecastDay = (id: string): boolean =>
    (FORECAST.test(home.label(id)) || FORECAST.test(id)) &&
    !FORECAST_SKIP.test(home.label(id)) &&
    !FORECAST_SKIP_ID.test(id) &&
    home.hasState(id) &&
    reading(id) &&
    HOURY.some((name) => home.hasAttr(id, name));""",
            """  const forecastReading = (id: string): boolean =>
    (FORECAST.test(home.label(id)) || FORECAST.test(id)) &&
    !FORECAST_SKIP.test(home.label(id)) &&
    !FORECAST_SKIP_ID.test(id) &&
    home.hasState(id) &&
    reading(id);
  const forecastDay = (id: string): boolean =>
    forecastReading(id) && HOURY.some((name) => home.hasAttr(id, name));""",
            'forecast reading predicate',
        ),
        (
            """    solarForecast,
    solarForecastTomorrow,""",
            """    solarForecast,
    solarForecastTomorrow,
    solarForecastDays,""",
            'roles return',
        ),
    ],
)

types = os.path.join('packages', 'cards', 'src', 'strategy', 'types.ts')
patch(
    types,
    [
        (
            """  readonly solarForecastTomorrow: string | undefined;""",
            """  readonly solarForecastTomorrow: string | undefined;
  /** Forecast sensors that name their day, in order from today ("Forecast Day 3" and friends). */
  readonly solarForecastDays: readonly string[];""",
            'solarForecastDays type',
        ),
    ],
)

views = os.path.join('packages', 'cards', 'src', 'strategy', 'views', 'energy.ts')
patch(
    views,
    [
        (
            """  const { solarToday, solarForecast, solarForecastTomorrow } = energy;""",
            """  const { solarToday, solarForecast, solarForecastTomorrow, solarForecastDays } = energy;""",
            'destructure days',
        ),
        (
            """      full('forecast-days', {
        forecast: [solarForecast, solarForecastTomorrow].filter(
          (id): id is string => id !== undefined,
        ),
        days: 7,
      }),""",
            """      full('forecast-days', {
        forecast: solarForecastDays.length
          ? solarForecastDays
          : [solarForecast, solarForecastTomorrow].filter((id): id is string => id !== undefined),
        days: 7,
      }),""",
            'feed days',
        ),
    ],
)
print('done')
