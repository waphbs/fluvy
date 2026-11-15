import {
  formatNumber,
  isUsable,
  localize,
  readText,
  writeText,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import {
  clamp,
  decimalsOf,
  head,
  label,
  LOW_BATTERY,
  options,
  readout,
  rulerLabels,
  stepper,
  type DialArc,
  type DialChangeDetail,
  type GlyphName,
  type OptionItem,
  type RulerChangeDetail,
  type Tone,
} from '@fluvy/ui';

import { climateStyles } from '@fluvy/ui/styles/climate';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { DEFAULT_MODES, SHOWN, thermostatHeight } from '../climate-family.js';

import { Card, type CardEditor, type ControlHost } from '../shared/base.js';

import { iconOf } from '../shared/domain.js';

import { HeadFit, type FittedHead } from '../energy/head.js';
import { optionCell, optionColumnsFor, optionsHold, valuesHeld } from '../shared/options.js';
import { BrokenPictures, imageEntity, imageOf } from '../shared/picture.js';
import type { WhenOff } from '../shared/config.js';
import { chipRow, type Choice } from '../shared/chips.js';
import { haWord, modeWord, pretty } from '../shared/mode-words.js';
import { fitValueRow, STEPPER, STEPPER_HALVES, valueRowClass } from '../shared/value-row.js';
import { degrees, doing, setpoint, type Doing } from './doing.js';
import { batteryLevel, humidityOf, valveOf, windowBy, type ReadingsAsk } from './readings.js';

export type ThermostatVariant = 'dial' | 'compact' | 'ruler';
export type RowStyle = 'chips' | 'full';

export interface ThermostatCardConfig extends FluvyCardConfig, ReadingsAsk {
  /** The line under the name; empty hides it. Default: the area (left out where it is the name) and the humidity. */
  subtitle?: string;
  /** The word for what it is doing, in the head (default); hidden, nothing says it. */
  show_state?: boolean;
  /**
   * A picture of the person's own in the circle's place (#99): an address, or an entity whose picture it is (an air
   * conditioner's product picture, `image.living_ac`). The circle's glyph where it cannot be read.
   */
  image?: string;
  show_presets?: boolean;
  show_fan?: boolean;
  /** `dial` (default): the ring. `compact`: the target as a readout with its stepper, no dial. `ruler`: the readout, the stepper and a horizontal ruler. */
  variant?: ThermostatVariant;
  /** The − and + under the dial and beside the readout (default). Off: the target is set on the dial or the ruler, or from the card's tap — the readout is then that tap. */
  show_stepper?: boolean;
  /** The reading beside the target ("Target · Now 20.6°") and in the dial (default). */
  show_current?: boolean;
  /** The modes and their label (default). */
  show_modes?: boolean;
  /** The modes to show, in this order (`['off', 'heat', 'cool']`). Default: every mode the entity offers, in the card's order. */
  modes?: readonly string[];
  /** Modes as option tiles (default), as content-sized chips, or as chips filling the row. */
  modes_style?: 'tiles' | RowStyle;
  /** Presets and fan speeds as content-sized chips (default) or as chips filling the row. */
  preset_style?: RowStyle;
  fan_style?: RowStyle;
  /** While the device is off: everything (default), or `essentials` — the head, the value and the modes; presets and fan speeds wait for a mode. */
  when_off?: WhenOff;
}

/** A thermostat as its card and its details sheet draw it. */
export interface ThermostatModel {
  readonly kind: 'climate' | 'water_heater' | 'humidifier';
  readonly tone: Tone;
  readonly off: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly target: number | undefined;
  readonly low: number | undefined;
  readonly high: number | undefined;
  readonly current: number | undefined;
  /** A climate's `hvac_action`: a range's stepper drives its low end while heating, its high end while cooling. */
  readonly action: string | undefined;
  /** What the entity can show besides a target, whatever it shows now: a range, the word for off. */
  readonly canRange: boolean;
  readonly canOff: boolean;
  readonly arc: DialArc;
  /** What it is doing, as its head says it (`doing`). */
  readonly doing: Doing;
  /** Every mode the entity offers, in `modeOrder`. */
  readonly modes: readonly OptionItem[];
  readonly presets: readonly string[];
  readonly preset: string | undefined;
  readonly fans: readonly string[];
  readonly fan: string | undefined;
}

const MODE_GLYPH: Record<string, GlyphName> = {
  heat: 'flame',
  cool: 'snow',
  heat_cool: 'auto',
  auto: 'auto',
  dry: 'humid',
  fan_only: 'fan',
  off: 'power',
  eco: 'leaf',
  boost: 'bolt',
  performance: 'bolt',
  electric: 'bolt',
  gas: 'flame',
  heat_pump: 'heater',
  high_demand: 'bolt',
  sleep: 'moon',
  normal: 'auto',
  away: 'away',
  comfort: 'home',
  baby: 'person',
  home: 'home',
};
const MODE_TONE: Record<string, Tone> = {
  heat: 'heat',
  cool: 'cool',
  heat_cool: 'accent',
  auto: 'accent',
  dry: 'dry',
  fan_only: 'fan',
  off: 'neutral',
};
/** A climate's modes, in Home Assistant's order: the card draws them so, and has a word for each. */
export const MODE_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];
/** A climate's `supported_features` bit for a low and a high end. */
const TARGET_RANGE = 2;

/**
 * The fan speeds Fluvy names in every language (the core catalogue's `fan` words, and a mode's for auto), by the words
 * integrations send.
 */
const SPEEDS = new Map<string, MessageKey>([
  ['auto', 'climate.mode.auto'],
  ['low', 'fan.low'],
  ['mid', 'fan.mid'],
  ['middle', 'fan.mid'],
  ['medium', 'fan.mid'],
  ['high', 'fan.high'],
]);

/**
 * Every mode a thermostat card's entity offers, in the order the card draws them and its editor lists them: a
 * climate's in Home Assistant's order (Off first), any other after them in the entity's own; a water heater's
 * operations as it lists them; a humidifier's Off, then its modes. Read from what Home Assistant writes whatever the
 * state (an entity gone missing: as this page last read it).
 */
export function modeOrder(view: EntityView): string[] {
  const list = (key: string): string[] => {
    const value = view.attr<unknown>(key);
    return Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : [];
  };
  const domain = view.domain;
  if (domain === 'humidifier')
    return ['off', ...list('available_modes').filter((m) => m !== 'off')];
  if (domain === 'water_heater') return list('operation_list');
  const rank = (m: string): number => {
    const at = MODE_ORDER.indexOf(m);
    return at < 0 ? MODE_ORDER.length : at;
  };
  return list('hvac_modes').sort((a, b) => rank(a) - rank(b));
}

/** The modes drawn where the config lists none: a climate's all, a water heater's and a humidifier's first six. */
export const defaultModes = <T>(climate: boolean, modes: readonly T[]): T[] =>
  climate ? [...modes] : modes.slice(0, SHOWN);

/**
 * A mode's word, the same on the card and in its editor: Fluvy's for a climate's seven and for Off; else Home
 * Assistant's own where Fluvy speaks the page's language (a water heater's "eco", a humidifier's "sleep": `haWord`,
 * `hass` the page's); else the mode, tidied.
 */
export function modeLabel(hass: HomeAssistant | undefined, view: EntityView, mode: string): string {
  if (mode === 'off' || (view.domain === 'climate' && MODE_ORDER.includes(mode)))
    return localize(hass, `climate.mode.${mode}` as MessageKey);
  if (view.domain === 'humidifier') return modeWord(hass, view, 'mode', mode);
  const stateObj = view.stateObj;
  return (
    (stateObj && haWord(hass, mode, (h) => h.formatEntityState?.({ ...stateObj, state: mode }))) ||
    pretty(mode)
  );
}

/**
 * One step of a target from its stepper, on the step's grid and inside the entity's range; of a range, the end chosen
 * (`end`: 0 the low one, 1 the high one), kept a step clear of the other end, which stays where it is.
 */
export function stepTarget(
  target: DialChangeDetail,
  direction: 1 | -1,
  { min, max, step }: { readonly min: number; readonly max: number; readonly step: number },
  end: 0 | 1 = 0,
): DialChangeDetail {
  const digits = decimalsOf(step);
  const grid = (value: number): number => Number(value.toFixed(digits));
  const next = (value: number, from: number, to: number): number =>
    clamp(grid(Math.round((value + direction * step) / step) * step), from, to);
  const { value, low, high } = target;
  if (low !== undefined && high !== undefined)
    return end === 0
      ? { low: next(low, min, grid(high - step)), high }
      : { low, high: next(high, grid(low + step), max) };
  return value === undefined ? target : { value: next(value, min, max) };
}

/* The setpoint each mode was last used at, so an inactive mode tile can say "Cool · 24°". */
const rememberSetpoint = (entityId: string, mode: string, value: string): void =>
  writeText(`fluvy:setpoint:${entityId}:${mode}`, value);
const recallSetpoint = (entityId: string, mode: string): string =>
  readText(`fluvy:setpoint:${entityId}:${mode}`);

/**
 * What reading a thermostat asks of whoever draws it (its card, its details sheet): the house in the language Fluvy
 * speaks and as the page has it, the state it shows (the expected one while a change is in flight), and the modes it
 * lists where the entity has never said its own.
 */
export interface ThermostatHost {
  readonly hass: HomeAssistant | undefined;
  readonly rawHass: HomeAssistant | undefined;
  state(view: EntityView): string;
  readonly modes?: readonly string[] | undefined;
  /** What it is asked to say beyond its action (`doing`): nothing, where its card asks nothing. */
  readonly ask?: ReadingsAsk | undefined;
}

/**
 * A climate, a water heater or a humidifier read as one thermostat: its range, its target (or its low and high), what
 * it measures, the tone and the arc its dial takes, its state's word, and its modes, presets and fan speeds.
 */
export function thermostatModel(host: ThermostatHost, view: EntityView): ThermostatModel {
  const num = (key: string): number | undefined => {
    const v = view.attr<number | null>(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const state = host.state(view);
  // a climate this page has never read (missing since it opened) keeps its row of modes: those its config lists,
  // else the commonest three
  const offered = modeOrder(view);
  const modes =
    offered.length || view.stateObj || view.domain !== 'climate'
      ? offered
      : (host.modes ?? DEFAULT_MODES);
  const word = (m: string): string => modeLabel(host.rawHass, view, m);
  // a mode's setpoint from when it last ran ("Cool · 24°"), while the device can be read
  const recall = (m: string): string => (view.status === 'ok' ? recallSetpoint(view.id, m) : '');
  if (view.domain === 'humidifier') {
    // on runs a mode, off is Off; out of reach is neither
    const off = state === 'off';
    const on = state === 'on';
    const mode = view.attr<string>('mode');
    const target = num('humidity');
    return {
      kind: 'humidifier',
      tone: 'water',
      off,
      min: num('min_humidity') ?? 0,
      max: num('max_humidity') ?? 100,
      step: 1,
      unit: '%',
      target,
      low: undefined,
      high: undefined,
      current: num('current_humidity'),
      action: undefined,
      canRange: false,
      canOff: true,
      arc: 'to-target',
      doing: doing(host, view, state, off ? 'neutral' : 'water', host.ask),
      modes: modes.map((m): OptionItem =>
        m === 'off'
          ? {
              key: m,
              label: word(m),
              value: off ? localize(host.hass, 'climate.standby') : '',
              glyph: 'power',
              tone: 'neutral',
              active: off,
            }
          : {
              key: m,
              label: word(m),
              value:
                on && m === mode && target !== undefined
                  ? `${formatNumber(host.hass, target, { digits: 0 })} %`
                  : '',
              glyph: MODE_GLYPH[m] ?? 'humid',
              tone: 'water',
              active: on && m === mode,
            },
      ),
      presets: [],
      preset: undefined,
      fans: [],
      fan: undefined,
    };
  }
  // the house's unit: Home Assistant gives a climate's and a water heater's temperatures in it; where an entity says
  // no range or step of its own, its defaults are Home Assistant's, in that unit
  const unit = host.hass?.config.unit_system.temperature ?? '°C';
  const fahrenheit = unit === '°F';
  if (view.domain === 'water_heater') {
    const off = state === 'off';
    const target = num('temperature');
    return {
      kind: 'water_heater',
      tone: 'heat',
      off,
      min: num('min_temp') ?? (fahrenheit ? 110 : 43),
      max: num('max_temp') ?? (fahrenheit ? 140 : 60),
      step: num('target_temp_step') ?? 1,
      unit,
      target,
      low: undefined,
      high: undefined,
      current: num('current_temperature'),
      action: undefined,
      canRange: false,
      canOff: modes.includes('off'),
      arc: 'to-target',
      doing: doing(host, view, state, off ? 'neutral' : 'heat', host.ask),
      modes: modes.map((m): OptionItem => ({
        key: m,
        label: word(m),
        value:
          m === state
            ? m === 'off'
              ? localize(host.hass, 'climate.standby')
              : degrees(host.hass, target, 1)
            : recall(m),
        glyph: MODE_GLYPH[m] ?? 'heater',
        tone: m === 'off' ? 'neutral' : 'heat',
        active: m === state,
      })),
      presets: [],
      preset: undefined,
      fans: [],
      fan: undefined,
    };
  }
  // a whole degree in Fahrenheit, a half in Celsius, as Home Assistant's own thermostat steps
  const step = num('target_temp_step') ?? (fahrenheit ? 1 : 0.5);
  const off = state === 'off';
  const action = view.attr<string>('hvac_action');
  const low = num('target_temp_low');
  const high = num('target_temp_high');
  const isRange =
    (state === 'heat_cool' || state === 'auto') && low !== undefined && high !== undefined;
  const tone: Tone = off
    ? 'neutral'
    : action === 'cooling' || state === 'cool'
      ? 'cool'
      : state === 'dry'
        ? 'dry'
        : state === 'fan_only'
          ? 'fan'
          : isRange
            ? 'accent'
            : 'heat';
  const target = num('temperature');
  const set = setpoint(host.hass, view, state);
  if (!off && view.status === 'ok') rememberSetpoint(view.id, state, set);
  return {
    kind: 'climate',
    tone,
    off,
    min: num('min_temp') ?? (fahrenheit ? 45 : 7),
    max: num('max_temp') ?? (fahrenheit ? 95 : 35),
    step,
    unit,
    target: isRange ? undefined : target,
    low: isRange ? low : undefined,
    high: isRange ? high : undefined,
    current: num('current_temperature'),
    action,
    canRange:
      (view.supports(TARGET_RANGE) || isRange) &&
      (modes.includes('heat_cool') || modes.includes('auto')),
    canOff: modes.includes('off'),
    arc: isRange
      ? 'range'
      : tone === 'cool'
        ? 'from-target'
        : state === 'fan_only' || state === 'dry'
          ? 'none'
          : 'to-target',
    doing: doing(host, view, state, tone, host.ask),
    modes: modes.map((m): OptionItem => ({
      key: m,
      label: word(m),
      value:
        m === state
          ? m === 'off'
            ? localize(host.hass, 'climate.standby')
            : set
          : m === 'off'
            ? ''
            : recall(m),
      glyph: MODE_GLYPH[m] ?? 'thermo',
      tone: MODE_TONE[m] ?? 'accent',
      active: m === state,
    })),
    presets: view.attr<string[]>('preset_modes') ?? [],
    preset: view.attr<string>('preset_mode'),
    fans: view.attr<string[]>('fan_modes') ?? [],
    fan: view.attr<string>('fan_mode'),
  };
}

/**
 * The call that sets a thermostat's target from its dial: a humidifier's humidity, a water heater's temperature, a
 * climate's temperature or its low and high; none where the dial says neither.
 */
export function targetCall(
  m: ThermostatModel,
  { value, low, high }: DialChangeDetail,
): readonly [service: string, data: Record<string, number>] | undefined {
  if (m.kind === 'climate' && low !== undefined && high !== undefined)
    return ['set_temperature', { target_temp_low: low, target_temp_high: high }];
  if (value === undefined) return undefined;
  return m.kind === 'humidifier'
    ? ['set_humidity', { humidity: value }]
    : ['set_temperature', { temperature: value }];
}

/**
 * Chooses a mode, shown at once: a climate's HVAC mode, a water heater's operation, a humidifier's mode — Off switching
 * it off, any other switching it on first where it is off.
 */
export function chooseMode(
  host: ControlHost,
  view: EntityView,
  m: ThermostatModel,
  key: string,
): void {
  if (m.kind === 'humidifier') {
    if (key === 'off') {
      host.expect(view.id, 'off');
      host.call('humidifier', 'turn_off', {}, view.id);
      return;
    }
    if (m.off) {
      host.expect(view.id, 'on');
      host.call('humidifier', 'turn_on', {}, view.id);
    }
    host.call('humidifier', 'set_mode', { mode: key }, view.id);
    return;
  }
  host.expect(view.id, key);
  if (m.kind === 'water_heater')
    host.call('water_heater', 'set_operation_mode', { operation_mode: key }, view.id);
  else host.call('climate', 'set_hvac_mode', { hvac_mode: key }, view.id);
}

/**
 * A head's line with the warnings it begins with in the warning ink (a low battery, a window open where the word leads
 * the line): `warnings` in the order the line may begin with them; the line as it is where it begins with none.
 */
function warned(sub: string, warnings: readonly string[]): string | TemplateResult {
  let lead = 0;
  for (const warning of warnings.filter(Boolean)) {
    const next = sub.slice(lead && lead + 3);
    if (next !== warning && !next.startsWith(`${warning} · `)) break;
    lead += (lead && 3) + warning.length;
  }
  return lead ? html`<span class="cl-warn">${sub.slice(0, lead)}</span>${sub.slice(lead)}` : sub;
}

/**
 * Thermostat, water heater and humidifier on one card: the dial with its knob on the ring (two for a
 * heat/cool range), the measured value as a dot outside it, the stepper, then the modes as option
 * tiles and presets / fan speeds as chips. Every null the integrations send is survived.
 */
export class FluvyThermostatCard extends Card<ThermostatCardConfig> {
  /** The card's height at a 360 column from its config alone: Off · Heat · Cool (`thermostatHeight`). */
  static override layoutHeight(config: ThermostatCardConfig): number {
    return thermostatHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    climateStyles,
    css`
      .fv-options {
        row-gap: 4px;
      }
      /* a column under 292 cannot hold a 16/600 option value ("Standby" is 65 px in 60): the value drops to 14 before it would ever be cut */
      .is-narrow .fv-option__value {
        font-size: 14px;
        letter-spacing: -0.01em;
      }
      /* what the head's line warns of (a low battery, an open window) before the rest of it */
      .cl-warn {
        color: var(--fluvy-warning);
      }
    `,
  ];

  static override editor(): Promise<CardEditor> {
    return import('./thermostat-editor.js');
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ThermostatCardConfig {
    return {
      type: 'custom:fluvy-thermostat-card',
      entity: entities.find((id) => /^(climate|water_heater|humidifier)\./.test(id)) ?? '',
    };
  }

  protected override prepare(config: ThermostatCardConfig): ThermostatCardConfig {
    if (!config.entity) throw new Error('fluvy-thermostat-card: "entity" is required');
    // defaults are written into the config so the visual editor shows the switches as they behave
    return {
      ...config,
      show_presets: config.show_presets ?? true,
      show_fan: config.show_fan ?? true,
    };
  }

  /** The device, and the entity its picture is read from (`image`): its new picture draws the card again. */
  protected override watched(): readonly string[] {
    const image = imageEntity(this.config?.image);
    return image ? [...super.watched(), image] : super.watched();
  }

  override getCardSize(): number {
    return { dial: 7, ruler: 6, compact: 4 }[this.variant()];
  }
  /**
   * The dial needs its width; the ruler card and the compact one half a section, never less (as Home Assistant's own
   * thermostat): in a third the stepper alone was wider than the column.
   */
  override getGridOptions(): LovelaceGridOptions {
    switch (this.variant()) {
      case 'compact':
        return { columns: 6, rows: 'auto', min_columns: 6 };
      case 'ruler':
        return { columns: 12, rows: 'auto', min_columns: 6 };
      default:
        return { columns: 12, rows: 'auto', min_columns: 8 };
    }
  }

  private model(view: EntityView): ThermostatModel {
    return thermostatModel(
      {
        hass: this.hass,
        rawHass: this.rawHass,
        state: (shown) => this.stateOf(shown),
        modes: this.config?.modes,
        ask: this.config,
      },
      view,
    );
  }

  /**
   * The head fitted to its column: the name over its line, and what the thermostat is doing as its badge — the word,
   * and beside it how far its valve is open where the card asks ("Heating · 42 %"). The line leads with a low battery
   * where the card asks ("Battery 8 %", in the warning ink), then says the card's own (`subtitle`), else the area
   * where it says more than the name ("Garderobe / Garderobe" said it twice) and the room's humidity. The word is
   * never lost (#185): where its badge cannot stand beside the name and the line it steps down into the line, after
   * the battery and before the rest, which gives way after it — Home Assistant's word to Fluvy's own where even alone
   * it would not hold. What the line reads of other entities is watched while it reads them.
   */
  private fitHead(
    view: EntityView,
    m: ThermostatModel,
    name: string,
  ): FittedHead & { readonly line: string | TemplateResult } {
    const ask: ReadingsAsk & Pick<ThermostatCardConfig, 'show_state'> = this.config ?? {};
    const percent = (value: number): string => `${formatNumber(this.hass, value, { digits: 0 })} %`;
    const valve = valveOf(this.hass, view, ask);
    const battery = batteryLevel(this.hass, view, ask);
    const humidity = humidityOf(this.hass, view, ask);
    for (const read of [valve, battery, humidity, windowBy(this.hass, view, ask)])
      this.follows(read?.entity);
    this.follows(ask.state_entity);
    const said = m.doing;
    const shown = ask.show_state !== false;
    // out of reach, the word is the state's alone
    const figure = valve && isUsable(view) ? percent(valve.value) : '';
    const low =
      battery && battery.value <= LOW_BATTERY
        ? this.t('climate.battery', { value: percent(battery.value) })
        : '';
    const own = this.subtitle(
      [view.areaName === name ? '' : view.areaName, humidity ? `${percent(humidity.value)} RH` : '']
        .filter(Boolean)
        .join(' · '),
    );
    const led = (...first: readonly string[]): string =>
      [low, ...first, own.sub.trim() && own.sub].filter(Boolean).join(' · ');
    const width = this.contentWidth;
    let fitted = this.head.fit({
      width,
      title: name,
      ...(low ? { sub: led() } : own),
      badge: shown
        ? { text: [said.text, figure].filter(Boolean).join(' · '), tone: said.tone }
        : null,
    });
    const stepped = shown && fitted.badge === nothing;
    if (stepped)
      fitted = this.head.fit({
        width,
        title: name,
        sub: led(said.text, figure),
        shorter: said.short && !low ? [led(said.short, figure)] : [],
      });
    return {
      ...fitted,
      line: warned(fitted.sub, [low, stepped && said.tone === 'warning' ? said.text : '']),
    };
  }

  private setTarget(view: EntityView, m: ThermostatModel, detail: DialChangeDetail): void {
    const call = targetCall(m, detail);
    if (call) this.call(m.kind, call[0], call[1], view.id);
  }

  private setMode(view: EntityView, m: ThermostatModel, key: string): void {
    chooseMode(this.controlHost, view, m, key);
  }

  private readonly head = new HeadFit(this);
  /** The person's picture (`image`) that would not load: the circle takes its place. */
  private readonly pictures = new BrokenPictures(this);

  /**
   * The target the value row shows while a stepped change is on its way (5 s at most; released as soon as the entity
   * reports it): the value, or a range's two ends.
   */
  private held: DialChangeDetail | null = null;
  private heldTimer = 0;
  private sendTimer = 0;
  /** The end of a range the stepper drives once one was pressed; until then the low one, the high one while cooling. */
  private rangeEnd: 0 | 1 | null = null;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.heldTimer);
    clearTimeout(this.sendTimer);
  }

  private end(m: ThermostatModel): 0 | 1 {
    return this.rangeEnd ?? (m.action === 'cooling' ? 1 : 0);
  }

  /**
   * One step of the target, or of a range's chosen end, from the value row's stepper: shown at once, sent after the
   * taps settle (650 ms, like the light card).
   */
  private nudge(view: EntityView, m: ThermostatModel, direction: 1 | -1): void {
    const shown: DialChangeDetail =
      this.held ??
      (m.low !== undefined && m.high !== undefined
        ? { low: m.low, high: m.high }
        : m.target !== undefined
          ? { value: m.target }
          : {});
    if (shown.value === undefined && shown.low === undefined) return;
    const next = stepTarget(shown, direction, m, this.end(m));
    this.held = next;
    clearTimeout(this.heldTimer);
    this.heldTimer = window.setTimeout(() => {
      this.held = null;
      this.requestUpdate();
    }, 5000);
    clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => this.setTarget(view, m, next), 650);
    this.requestUpdate();
  }

  private variant(): ThermostatVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'ruler' ? v : 'dial';
  }

  /**
   * The value row of the compact and ruler variants: the target as a large readout ("Target · Now 20.8°" over it) and
   * its stepper, laid out once from the width, the config and every figure the entity can show (`fitValueRow`), never
   * from its state: stepping 9.5 → 10.0, a mode, the device going off move nothing — the stepper stays, still, while
   * there is nothing to set. A range's ends are buttons: the one pressed is the end the stepper drives. Without a
   * stepper (or in a column too narrow for even its halves) the readout is the card's tap. The ruler variant adds the
   * ruler(s).
   */
  private renderValueRow(
    view: EntityView,
    m: ThermostatModel,
    name: string,
    unusable: boolean,
    figure: (v: number) => string,
    edge: (v: number) => string,
    now: string,
  ): TemplateResult {
    const range = m.target === undefined && m.low !== undefined && m.high !== undefined;
    const held = this.held;
    if (held && (range ? held.low === m.low && held.high === m.high : held.value === m.target))
      this.held = null;
    const shown = this.held?.value ?? m.target;
    const low = this.held?.low ?? m.low;
    const high = this.held?.high ?? m.high;
    const idle = unusable || m.off;
    const off = this.t('climate.mode.off');
    const target = this.t('climate.target');
    const ends = [figure(m.min), figure(m.max)];
    const widest = ends.reduce((a, b) => (b.length > a.length ? b : a));
    const fit = fitValueRow(this.head.ruler, {
      width: this.contentWidth,
      control: this.config?.show_stepper === false ? 0 : STEPPER,
      narrow: STEPPER_HALVES,
      labels: now ? [`${target} · ${now}`, target] : [target],
      figures: [
        ...ends.map((value) => ({ value, unit: m.unit })),
        ...(m.canRange ? [{ value: `${widest} – ${widest}`, unit: m.unit }] : []),
        ...(m.canOff ? [{ value: off }] : []),
      ],
    });
    const stepped = fit.layout !== 'alone';
    const unit = idle || (shown === undefined && !range) ? '' : m.unit;
    const text = unusable
      ? '—'
      : m.off
        ? off
        : range
          ? `${figure(low as number)} – ${figure(high as number)}`
          : shown === undefined
            ? '—'
            : figure(shown);
    // a range's ends, each a button that gives the stepper to its end (the one it drives in the accent's ink); the
    // words between them as the row was measured with ("20.0 – 24.0")
    const end = this.end(m);
    const endButton = (index: 0 | 1, value: number): TemplateResult =>
      html`<button
        class="cl-end ${index === end ? 'is-on' : ''}"
        aria-pressed=${index === end ? 'true' : 'false'}
        aria-label="${name} · ${this.t(index ? 'climate.high' : 'climate.low')} ${figure(value)} ${m.unit}"
        @click=${() => {
          this.rangeEnd = index;
          this.requestUpdate();
        }}
      >
        ${figure(value)}
      </button>`;
    const value =
      range && stepped && !idle
        ? html`${endButton(0, low as number)} – ${endButton(1, high as number)}`
        : text;
    const w = this.contentWidth;
    const tone: Tone = idle ? 'neutral' : m.tone;
    const ruler = (value: number, ariaLabel: string, commit: (v: number) => void): TemplateResult =>
      html`<fluvy-ruler
          .value=${value}
          .min=${m.min}
          .max=${m.max}
          .step=${m.step}
          .length=${w}
          .tone=${tone}
          ?disabled=${idle}
          ?inactive=${m.off}
          .unit=${m.unit}
          .label=${ariaLabel}
          .format=${figure}
          @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => commit(e.detail.value)}
        ></fluvy-ruler
        >${rulerLabels([
          [0, edge(m.min)],
          [1, edge(m.max)],
        ])}`;
    return html`<div class="cl-value ${valueRowClass(fit.layout)}">
        ${readout({ label: fit.label, value, unit, size: fit.size })}
        ${
          stepped
            ? stepper((direction) => this.nudge(view, m, direction), {
                disabled: idle || (!range && shown === undefined),
                decrease: `${name} · ${this.t('common.decrease')}`,
                increase: `${name} · ${this.t('common.increase')}`,
              })
            : this.readoutTap(view.id, `${name} · ${fit.label} ${text} ${unit}`)
        }
      </div>
      ${
        this.variant() === 'ruler'
          ? range
            ? html`<div class="cl-range">
                ${label(this.t('climate.low'))}${ruler(low as number, `${name} · ${this.t('climate.low')}`, (v) => this.setTarget(view, m, { low: v, high: Math.max(v, high as number) }))}
                ${label(this.t('climate.high'))}${ruler(high as number, `${name} · ${this.t('climate.high')}`, (v) => this.setTarget(view, m, { low: Math.min(v, low as number), high: v }))}
              </div>`
            : html`<div class="cl-bubble-row"></div>
                ${ruler(shown ?? m.min, `${name} · ${this.t('climate.target')}`, (v) => {
                  this.held = { value: v };
                  this.setTarget(view, m, { value: v });
                })}`
          : nothing
      }`;
  }

  /**
   * The modes the config asks for, in its order (a humidifier's older `__off` is its `off`), those the entity offers;
   * else what the card shows by default (`defaultModes`). None where the config hides the row.
   */
  private shownModes(m: ThermostatModel): readonly OptionItem[] {
    if (this.config?.show_modes === false) return [];
    if (!this.config?.modes?.length) return defaultModes(m.kind === 'climate', m.modes);
    return this.config.modes
      .map((key) => m.modes.find((o) => o.key === (key === '__off' ? 'off' : key)))
      .filter((o): o is OptionItem => o !== undefined);
  }

  /**
   * The fan speeds as chips: what the entity offers, and — where it runs at a speed it does not list (an ESPHome
   * air conditioner on "middle" beside a list of Low and High, its own firmware's list narrower than the unit) — that
   * speed ahead of them, chosen and unselectable, so the row says what it runs at instead of nothing.
   */
  private fanChoices(
    m: ThermostatModel,
    view: EntityView,
    unusable: boolean,
  ): readonly Choice[] {
    const choices: Choice[] = m.fans.map((f) => {
      const speed = SPEEDS.get(f.toLowerCase());
      return {
        key: f,
        label: modeWord(this.rawHass, view, 'fan_mode', f, speed),
        ...(speed ? { own: localize(this.hass, speed) } : {}),
        active: f === m.fan,
        unavailable: unusable,
      };
    });
    const fan = m.fan;
    if (fan && !m.fans.some((f) => f.toLowerCase() === fan.toLowerCase()))
      choices.unshift({
        key: fan,
        label: modeWord(this.rawHass, view, 'fan_mode', fan, SPEEDS.get(fan.toLowerCase())),
        active: true,
        unavailable: true,
      });
    return choices;
  }

  private renderModes(
    view: EntityView,
    m: ThermostatModel,
    modes: readonly OptionItem[],
  ): TemplateResult {
    const style = this.config?.modes_style ?? 'tiles';
    const select = (key: string): void => this.setMode(view, m, key);
    // tiles only while every mode's word holds its cell (a water heater's "Performance" in a 211 column does not):
    // else the chips, which give way in their order and never cut a word
    const measure = (text: string): number => this.head.ruler.width('fv-option__label', text);
    const tiled =
      style === 'tiles' &&
      optionsHold(
        modes.map((o) => o.label),
        this.contentWidth,
        4,
        measure,
      );
    if (tiled) {
      const columns = optionColumnsFor(
        modes.map((o) => o.label),
        this.contentWidth,
        4,
        measure,
      );
      // a value's word the cell cannot hold (de's "Bereitschaft" under Off in a 211 column) is dropped, never cut
      const held = valuesHeld(modes, optionCell(this.contentWidth, 4, columns), (text) =>
        this.head.ruler.width('fv-option__value', text),
      );
      return options(held, select, 4, 84, columns);
    }
    return chipRow(
      modes.map((o) => ({
        key: o.key,
        label: o.label,
        active: o.active ?? false,
        unavailable: o.unavailable ?? false,
        ...(o.glyph ? { glyph: o.glyph } : {}),
      })),
      select,
      style === 'tiles' ? 'full' : style,
      { ruler: this.head.ruler, width: this.contentWidth },
    );
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    // out of reach, the card keeps its anatomy and its size: the dial or the readout at "—", the modes, presets and
    // fan speeds where they stand, nothing taking a tap; only the colours change (1.9)
    const unusable = !isUsable(view);
    const m = this.model(view);
    const tone: Tone = unusable ? 'off' : m.tone;
    const isPct = m.unit === '%';
    const figure = (v: number): string =>
      formatNumber(this.hass, v, { digits: m.step < 1 ? 1 : 0, minDigits: m.step < 1 ? 1 : 0 });
    const now =
      m.current !== undefined && this.config?.show_current !== false
        ? this.t('climate.current', {
            value: isPct
              ? `${formatNumber(this.hass, m.current, { digits: 0 })} %`
              : `${formatNumber(this.hass, m.current, { digits: 1 })}°`,
          })
        : '';
    const edge = (v: number): string =>
      isPct
        ? `${formatNumber(this.hass, v, { digits: 0 })} %`
        : `${formatNumber(this.hass, v, { digits: 0 })}°`;

    const fitted = this.fitHead(view, m, name);
    // out of reach, a mode, a preset and a fan speed keep their place at rest: the dashed tile or chip takes no tap
    const modes = this.shownModes(m).map((o) => (unusable ? { ...o, unavailable: true } : o));
    // the essentials while off: the head, the value and the modes stay; presets and fan speeds wait for a mode
    const essentials = m.off && this.config?.when_off === 'essentials';
    // the dial's ring from the column: 84 where it has 216, down to 56 — the box is twice the ring, its 10 ticks and
    // their 12, on the 4 grid
    const radius = Math.min(84, Math.max(56, Math.floor(this.contentWidth / 8) * 4 - 22));
    return html`<article
      class="fv-card cl-card ${unusable ? 'is-unavailable is-off' : ''} ${this.contentWidth < 292 ? 'is-narrow' : ''}"
      data-card
    >
      ${head({ icon: fitted.icon ? iconOf(view, this.config?.icon) : null, picture: this.pictures.shown(imageOf(this.hass, this.config?.image)), pictureFailed: this.pictures.failed, tone, title: name, sub: fitted.line, trailing: fitted.badge, name: true, cut: fitted.cut, ...this.headActions(view.id) })}
      ${
        this.variant() !== 'dial'
          ? this.renderValueRow(view, m, name, unusable, figure, edge, now)
          : html`<div class="cl-dial-row">
              <fluvy-dial
                .radius=${radius}
                .tick=${10}
                .large=${false}
                .stepper=${this.config?.show_stepper !== false}
                .tone=${m.off || unusable ? 'neutral' : m.tone}
                .min=${m.min}
                .max=${m.max}
                .step=${m.step}
                .arc=${m.arc}
                .value=${m.target}
                .low=${m.low}
                .high=${m.high}
                .current=${m.current}
                .unit=${m.unit}
                .sub=${now}
                .text=${unusable ? '—' : m.off ? this.t('climate.mode.off') : m.target === undefined && m.low === undefined ? '—' : undefined}
                min-label=${edge(m.min)}
                max-label=${edge(m.max)}
                ?disabled=${m.off || unusable || (m.target === undefined && m.low === undefined)}
                .format=${figure}
                @fluvy-change=${(e: CustomEvent<DialChangeDetail>) => this.setTarget(view, m, e.detail)}
              ></fluvy-dial>
            </div>`
      }
      ${modes.length ? html`${label(this.t('climate.mode'))}${this.renderModes(view, m, modes)}` : nothing}
      ${
        m.presets.length && !essentials && this.config?.show_presets !== false
          ? html`${label(this.t('climate.preset'))}${chipRow(
              m.presets.map((p) => ({
                key: p,
                label: modeWord(this.rawHass, view, 'preset_mode', p),
                active: p === m.preset,
                unavailable: unusable,
              })),
              (key) => this.call('climate', 'set_preset_mode', { preset_mode: key }),
              this.config?.preset_style,
              { ruler: this.head.ruler, width: this.contentWidth },
            )}`
          : nothing
      }
      ${
        m.fans.length && !essentials && this.config?.show_fan !== false
          ? html`${label(this.t('climate.fan'))}${chipRow(
              this.fanChoices(m, view, unusable),
              (key) => this.call('climate', 'set_fan_mode', { fan_mode: key }),
              this.config?.fan_style,
              { ruler: this.head.ruler, width: this.contentWidth },
            )}`
          : nothing
      }
    </article>`;
  }
}
