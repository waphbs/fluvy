import {
  formatNumber,
  valueParts,
  type EntityView,
  type HomeAssistant,
  type ValueParts,
} from '@fluvy/core';
import { convert, unitClass } from '../history-bars/units.js';
import {
  decimalsOf,
  figuresOf,
  LADDERS,
  precisionOf,
  writeFigure,
  type Figures,
  type NumberOptions,
} from '../shared/units.js';

/**
 * Energy arithmetic shared by the energy cards. Home Assistant lets every integration pick its own unit — one house
 * happily reports the grid in W, the inverter in kW and the meter in MWh — so everything is brought to a base unit
 * (W for power, Wh for energy) before it is compared, summed or drawn, and a whole diagram is then displayed in ONE
 * unit: the one the card asks for, else the one chosen from its largest figure (`shared/units.ts`, the one rule).
 */

export type Family = 'power' | 'energy';

/** The watt ladders, power and energy: what a card of the family offers its figures in, whatever it draws. */
export const WATT_LADDERS: readonly string[] = [...LADDERS.power, ...LADDERS.energy];

/** A set's unit and its decimals, as the family's cards hold them (`Figures` of the one rule). */
export type { Figures as Scale } from '../shared/units.js';

const BASE: Readonly<Record<Family, 'W' | 'Wh'>> = { power: 'W', energy: 'Wh' };

/** The unit decides; a sensor that carries none is read by its device class. Anything else is not ours to convert. */
export function family(view: EntityView): Family | null {
  const unit = view.unit.trim();
  if (unit) {
    const kind = unitClass(unit);
    return kind === 'power' || kind === 'energy' ? kind : null;
  }
  return view.deviceClass === 'power' ? 'power' : view.deviceClass === 'energy' ? 'energy' : null;
}

/**
 * Watts of a sensor the config declares as power (`solar_power`, `grid_power` …): no unit means W.
 * `null` when there is no usable number or the unit is not a power unit — a wrong figure is worse than "—".
 */
export function watts(view: EntityView): number | null {
  if (view.status !== 'ok' || view.number === null) return null;
  const unit = view.unit.trim();
  if (unit && unitClass(unit) !== 'power') return null;
  return unit ? convert(view.number, unit, 'W') : view.number;
}

/** The base-unit value (W or Wh) of a sensor that may be either family, so rows can be compared and summed. */
export function baseValue(view: EntityView): number | null {
  const kind = family(view);
  if (!kind || view.status !== 'ok' || view.number === null) return null;
  return convert(view.number, view.unit, BASE[kind]);
}

/**
 * One unit for a set of figures: the one asked, else the largest decides. 3 200 W and 400 W read as "3.2 kW" and
 * "0.4 kW", never as "3.2 kW" beside "400 W".
 */
export function scaleOf(
  values: readonly (number | null)[],
  base: 'W' | 'Wh',
  asked: NumberOptions = {},
): Figures {
  let peak = 0;
  for (const v of values) if (v !== null && Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
  return figuresOf(undefined, asked, base, peak);
}

/**
 * A base-unit figure in the set's unit, at the set's decimals: "450" W, "3.2" kW, "286" kWh. `null` prints the em
 * dash: a missing number is never a 0.
 */
export function scaled(
  hass: HomeAssistant | undefined,
  value: number | null,
  scale: Figures,
): string {
  return value === null || !Number.isFinite(value) ? '—' : writeFigure(hass, value, scale);
}

/** "Garage battery power" → "Garage battery": a device's name, without the words that say which of its sensors it is. */
export function deviceName(view: EntityView): string {
  const trimmed = view.name
    .replace(
      /\b(energy|energía|energia|power|potencia|today|hoy|day|día|dia|daily|consumption|consumo|yield|producción|produccion)\b/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  return trimmed || view.name;
}

/** "Washing machine Energy today" → "Washing machine": a legend label is the device, not the sensor's full name. */
export function shortName(view: EntityView): string {
  const name = deviceName(view);
  // an 11/600 uppercase label holds about 11 characters in a 96 px column: "Kitchen speaker" becomes "Speaker", never "KITCHEN SPEA…"
  // a name written without spaces at all (Chinese, Japanese) is not cut: its last "word" would be the whole subject
  const words = name.split(' ').filter(Boolean);
  if (words.length < 2) return name;
  const latin = words.every((word) => /^[\p{Script=Latin}\p{Number}.,%°/-]+$/u.test(word));
  return latin && name.length > 11 ? (words[words.length - 1] as string) : name;
}

/** Safe share: 0 when the total is 0 or missing, never NaN and never Infinity. */
export const share = (part: number, total: number): number =>
  total > 0 && Number.isFinite(part) ? Math.min(1, Math.max(0, part / total)) : 0;

/**
 * What a readout prints for a power or energy sensor: the unit the card asks for, else the one its own figure asks
 * for (3 200 W → "3.2 kW", 11 200 Wh → "11.2 kWh", 450 W → "450 W"); its decimals, else the sensor's own precision in
 * its own unit. Only the watt ladder is rescaled on its own — a meter in MJ or a price keeps Home Assistant's own unit
 * and formatting, display precision included, unless a unit of its class is asked for.
 */
export function readoutParts(
  hass: HomeAssistant | undefined,
  view: EntityView,
  raw?: number,
  asked: NumberOptions = {},
): ValueParts {
  const kind = family(view);
  const unit = view.unit.trim();
  const base = kind === 'power' ? 'W' : 'Wh';
  // `raw` is a figure in the entity's own unit (a point of its history); without it, the entity's reading
  const value =
    raw === undefined ? baseValue(view) : Number.isFinite(raw) ? convert(raw, unit, base) : null;
  const digits = decimalsOf(asked.decimals);
  const named = typeof asked.unit === 'string' && unitClass(asked.unit) === kind;
  if (!kind || value === null || (unit !== '' && !unit.endsWith(base) && !named))
    return raw === undefined
      ? valueParts(hass, view, digits === undefined ? {} : { digits, minDigits: digits })
      : {
          value: formatNumber(hass, raw, {
            digits: digits ?? (Math.abs(raw) >= 100 ? 0 : 1),
            ...(digits === undefined ? {} : { minDigits: digits }),
          }),
          unit,
        };
  const figures = figuresOf(hass, asked, base, value, view);
  return { value: writeFigure(hass, value, figures), unit: figures.unit };
}

/**
 * A row of readouts read together: every energy figure in ONE unit and every power figure in ONE unit, each chosen
 * by the largest of its family ("0.2 kWh" beside "1.2 kWh", never "230 Wh") — or by what the card asks (`asked`), and
 * an item that asks for its own (`own`) reads as it asks. A sensor of any other kind keeps what Home Assistant
 * would print.
 */
export function legendParts(
  hass: HomeAssistant | undefined,
  views: readonly EntityView[],
  asked: NumberOptions = {},
  own: ReadonlyArray<NumberOptions | undefined> = [],
): ValueParts[] {
  const bases = views.map((view) => ({ kind: family(view), value: baseValue(view) }));
  const scale = (kind: Family): Figures =>
    scaleOf(
      bases.filter((b) => b.kind === kind).map((b) => b.value),
      BASE[kind],
      asked,
    );
  const scales = { power: scale('power'), energy: scale('energy') };
  return views.map((view, index) => {
    const { kind, value } = bases[index] ?? { kind: null, value: null };
    const mine = own[index];
    const itself = mine !== undefined && (mine.unit !== undefined || mine.decimals !== undefined);
    if (!kind || value === null || itself)
      return readoutParts(hass, view, undefined, { ...asked, ...mine });
    return { value: scaled(hass, value, scales[kind]), unit: scales[kind].unit };
  });
}

/**
 * A price or a running cost: money is written to the cent ("0.30", not "0.3") unless the user set a precision — a
 * card's `decimals` is for its energy figures, never its money.
 */
export function costParts(hass: HomeAssistant | undefined, view: EntityView): ValueParts {
  if (view.status !== 'ok' || view.number === null) return valueParts(hass, view);
  const digits = precisionOf(hass, view) ?? 2;
  return { value: formatNumber(hass, view.number, { digits, minDigits: digits }), unit: view.unit };
}
