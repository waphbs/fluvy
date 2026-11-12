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


patch(
    os.path.join('packages', 'cards', 'src', 'strategy', 'energy-roles.ts'),
    [
        (
            """  const solarForecastDays: string[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const id = byDay.get(offset);
    if (id === undefined) break;
    solarForecastDays.push(id);
  }""",
            """  // a day the forecast skips keeps its place as an empty string: the card draws it hollow rather than sliding the
  // days after it back
  const lastDay = Math.max(-1, ...byDay.keys());
  const solarForecastDays: string[] = [];
  for (let offset = 0; offset <= lastDay && offset < 14; offset += 1) {
    solarForecastDays.push(byDay.get(offset) ?? '');
  }""",
            'holes stay hollow',
        ),
    ],
)

patch(
    os.path.join('packages', 'cards', 'src', 'strategy', 'energy-roles.test.ts'),
    [
        (
            """    expect(roles.solarForecastDays).toEqual([
      'sensor.solcast_forecast_today',
      'sensor.solcast_forecast_tomorrow',
      'sensor.solcast_forecast_day_3',
      'sensor.solcast_forecast_day_5',
    ]);""",
            """    // "Forecast Day 4" is missing: it keeps its hollow place rather than sliding day 5 back
    expect(roles.solarForecastDays).toEqual([
      'sensor.solcast_forecast_today',
      'sensor.solcast_forecast_tomorrow',
      'sensor.solcast_forecast_day_3',
      '',
      'sensor.solcast_forecast_day_5',
    ]);""",
            'hollow day',
        ),
    ],
)

card = os.path.join('packages', 'cards', 'src', 'forecast', 'forecast-days-card.ts')
with open(card, encoding='utf-8') as handle:
    text = handle.read()

old = """    const ids = (this.config?.forecast ?? []).filter((id) => id !== '');"""
new = """    // an empty string is a day the forecast does not reach: the bar stands hollow
    const ids = this.config?.forecast ?? [];"""
if old not in text:
    raise SystemExit('card ids anchor missing')
text = text.replace(old, new, 1)

old = """      if (offset < ids.length) {
        total = this.stated(ids[offset] as string, at, zone);
      } else {"""
new = """      const forDay = ids[offset];
      if (forDay !== undefined) {
        total = forDay === '' ? null : this.stated(forDay, at, zone);
      } else {"""
if old not in text:
    raise SystemExit('card branch anchor missing')
text = text.replace(old, new, 1)

with open(card, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(text)
print('patched forecast-days-card holes')
print('done')
