import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

card = os.path.join('packages', 'cards', 'src', 'forecast', 'forecast-days-card.ts')
with open(card, encoding='utf-8') as handle:
    text = handle.read()


def swap(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'anchor missing: {label}')
    text = text.replace(old, new, 1)
    print('patched', label)


swap(
    """  /** Sensors whose attributes carry the hours of a day (Solcast and friends): one day each, all of them summed per day. */
  forecast?: readonly string[];""",
    """  /** One sensor per day, starting today: a day's total, its hours in attributes when it has them. */
  forecast?: readonly string[];""",
    'config docs',
)

swap(
    """  /** The days ahead, each with what the forecast sensors say about it (null when none of them reaches that day). */
  private ahead(): AheadDay[] {
    const hass = this.hass as HomeAssistant | undefined;
    if (!hass) return [];
    const zone = houseZone(hass);
    const today = houseMidnight(hass, new Date()).getTime();
    const ids = (this.config?.forecast ?? []).filter((id) => id !== '');
    const days: AheadDay[] = [];
    for (let offset = 0; offset < this.span; offset += 1) {
      const at = new Date(today + offset * 24 * HOUR + 12 * HOUR);
      let total: number | null = null;
      for (const id of ids) {
        const view = this.entity(id);
        if (view.status !== 'ok') continue;
        const hourly = hourlyForecast(view, at, zone);
        const factor = hourly ? KWH[hourly.unit] : undefined;
        if (!hourly || factor === undefined) continue;
        const kWh = sum(hourly.hours) * factor;
        total = (total ?? 0) + kWh;
      }
      days.push({ at, label: this.dayLabel(at), value: total });
    }
    return days;""",
    """  /** A sensor's state as kWh, for the days whose sensor states the total but carries no hours. */
  private stated(id: string, at: Date, zone: string): number | null {
    const view = this.entity(id);
    if (view.status !== 'ok') return null;
    const hourly = hourlyForecast(view, at, zone);
    if (hourly) {
      const factor = KWH[hourly.unit];
      if (factor !== undefined) return sum(hourly.hours) * factor;
    }
    const value = Number(view.state);
    if (!Number.isFinite(value)) return null;
    const factor = KWH[view.unit ?? 'kWh'] ?? 1;
    return value * factor;
  }

  /** The days ahead, each with what the forecast sensors say about it (null when none of them reaches that day). */
  private ahead(): AheadDay[] {
    const hass = this.hass as HomeAssistant | undefined;
    if (!hass) return [];
    const zone = houseZone(hass);
    const today = houseMidnight(hass, new Date()).getTime();
    const ids = (this.config?.forecast ?? []).filter((id) => id !== '');
    const days: AheadDay[] = [];
    for (let offset = 0; offset < this.span; offset += 1) {
      const at = new Date(today + offset * 24 * HOUR + 12 * HOUR);
      // a sensor per day: today's first, tomorrow's second, "Forecast Day 3" third. A house that hands the card a
      // single sensor for several days falls back to summing whatever hours each of them carries for the day.
      let total: number | null = null;
      if (offset < ids.length) {
        total = this.stated(ids[offset] as string, at, zone);
      } else {
        for (const id of ids) {
          const value = this.stated(id, at, zone);
          if (value === null) continue;
          total = (total ?? 0) + value;
        }
      }
      days.push({ at, label: this.dayLabel(at), value: total });
    }
    return days;""",
    'per-day sensors',
)

with open(card, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(text)
print('done')
