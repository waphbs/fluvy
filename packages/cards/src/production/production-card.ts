import { productionHeight } from '../energy-family.js';
import {
  clock12,
  dateFormat,
  formatNumber,
  houseZone,
  isUsable,
  strings as words,
  wallClock,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { axis, head, readout, sheetStyles, type Tone } from '@fluvy/ui';
import {
  chartDefaultsFor,
  chartSection,
  chartStyles,
  drawChart,
  styleOf,
  scrub,
  ScrubController,
  seriesPaint,
  type ChartSeries,
  type SeriesColour,
  type ResolvedStyle,
} from '../chart/engine/index.js';
import type { ChartCaps, ChartKeys } from '../shared/chart-config.js';
import { energyStyles } from '@fluvy/ui/styles/energy';

import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import {
  COLLECTION_LABEL,
  collectionChoices,
  collectionField,
  collectionHelper,
} from '../energy/collection-field.js';
import { HeadFit } from '../energy/head.js';
import { legendColumns } from '../energy/legend-row.js';
import { family, scaled, scaleOf } from '../energy/power.js';
import { CollectionFollower, collectionKeyOf, followedMoment } from '../energy-model/collection.js';
import { houseMidnight } from '../energy-model/period.js';
import { rangeWords } from '../energy-model/range-words.js';
import { RecordedSensors } from '../energy-model/recorded.js';

import {
  baseOf,
  ceilingFor,
  figuresOf,
  toBase,
  writeFigure,
  type NumberKeys,
} from '../shared/units.js';

import { Card, HEAD_BASE } from '../shared/base.js';
import { stateWord } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  hasLadder,
  iconField,
  nameField,
  NUMBER_DEFAULTS,
  numberFields,
  selectField,
  showIconField,
  textField,
  unitChoicesOf,
} from '../shared/form.js';
import { Refresher } from '../shared/refresh.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { houseDay, loadDay, loadPowerDay, type DayRecord } from './day.js';

import { hourlyForecast } from './forecast.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { statsRow, type StatText } from '../shared/readouts.js';
import { sideStacked } from '../shared/value-row.js';

const strings = words('production');

/** One array of panels: its own power or energy sensor, and its name in the legend. */
export interface ProductionArray {
  entity: string;
  name?: EntityName;
}

/**
 * The chart keys (`shared/chart-config.ts`): the bars' style — classic, soft, or columns —, an hour a highlight
 * lights, the marker at now, and motion.
 */
export interface ProductionCardConfig
  extends
    FluvyCardConfig,
    NumberKeys,
    Pick<ChartKeys, 'chart' | 'highlight' | 'show_now' | 'animate'> {
  subtitle?: string;
  /** Today's forecast: its state is the day's total, its attributes may carry the hours (Solcast, Open-Meteo, a template). */
  forecast_entity?: string;
  show_forecast?: boolean;
  /** A power sensor that holds today's peak. Without it the best hour stands in. */
  peak_entity?: string;
  /** The peak and its hour under the bars (default). */
  show_peak?: boolean;
  /** `full` (default): the total, the bars, their axis and the figures. `compact`: the head, the bars and their axis. */
  variant?: 'full' | 'compact';
  /** Several arrays (east and west roofs): each hour's bar stacked per array, and a legend of each one's day. */
  arrays?: ReadonlyArray<string | ProductionArray>;
  /** An Energy date picker's key (`energy_…`): the card draws the last day of its range (the day so far while it holds today). */
  collection_key?: string;
  /** Test hook, as in the clock cards: an ISO instant the card takes for "now". */
  _now?: string;
}

const HOURS = 24;
const BAR_HEIGHT = 80;
/** The arrays' chart: 112 tall, an 8 bar centred in each hour's slot, 2 between an hour's arrays. */
const CHART_HEIGHT = 112;
const BAR = 8;
const STACK_GAP = 2;
/**
 * An array's step on the solar ink's ramp, toward the card: the first array is the ink itself, the second 45 % of it
 * (the approved pair); a third and a fourth take two more steps of the same ramp, 72 % and 30 % — alternating dark
 * and light, so two neighbours in a stack always differ by a quarter or more (`.en-bar.is-third`, `.is-fourth`).
 */
const RAMP = ['', 'is-second', 'is-third', 'is-fourth'] as const;
const MAX_ARRAYS = RAMP.length;
/** Below this (half a column) the day's figure is a medium readout, alone. */
const NARROW = 200;
/** Below this the axis keeps its first, middle and last hour, so none crowds another (as a ruler does). */
const AXIS_FULL = 240;
/** Between the legend's columns (the gap its CSS sets). */
const LEGEND_GAP = 12;
/** A finished hour is compiled a few seconds after it ends; asking again picks it up, and keeps a long-lived dashboard honest. */

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * What the day's bars are drawn in: classic (1.10's: the sheet's bars over the forecast, the arrays stacked in the
 * ink's ramp), soft (rounded, the best hour in the ink and the rest quiet, a highlight's own lit) or columns (the arrays
 * stacked in the series' colours); in a style the hours to come are the forecast's, hollow, now marked.
 */
const DAY_CAPS: ChartCaps = {
  bars: true,
  now: true,
  styles: ['classic', 'soft', 'columns'],
  keys: ['highlight', 'show_now', 'animate'],
};
const ARRAYS_CAPS: ChartCaps = {
  bars: true,
  now: true,
  several: true,
  styles: ['classic', 'columns'],
  keys: ['show_now', 'animate'],
};
const capsIn = (data: Readonly<Record<string, unknown>>): ChartCaps =>
  Array.isArray(data['arrays']) && data['arrays'].length ? ARRAYS_CAPS : DAY_CAPS;

/**
 * A growing meter's day, hour by hour: the recorded hours as solid bars, the hour in progress read
 * live from the sensor, the forecast standing behind them and carrying on past "now", the day's
 * figures above and its peak below. With several arrays, each hour's bar is stacked per array — the
 * future hours the forecast, faint — over a legend of what each array made. "Today" is the house's:
 * it begins at the midnight Home Assistant shows, in the house's zone.
 */
export class FluvyProductionCard extends Card<ProductionCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ProductionCardConfig): number {
    return productionHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    energyStyles,
    chartStyles,
    css`
      /* the sheet paints the bars solar; another tone brings its own ink (a ruler tone class carries nothing but the tone's variables) */
      .so-bars .so-bar__fill {
        background: var(--tone-ink, var(--fluvy-state-energy-solar));
      }
      .so-bar__fill,
      .so-bar__forecast {
        transform-origin: 50% 100%;
        animation: fv-grow-y 560ms var(--fv-ease-out) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + var(--bar-delay, 0ms));
      }
      .so-skeleton {
        height: 80px;
        margin-top: 16px;
      }
      .so-cols .fv-readout__label {
        white-space: nowrap;
      } /* a label never drops onto its value */
      .fv-axis span {
        white-space: nowrap;
      } /* "12 AM" on a 12-hour clock is one label */
      /* the arrays' chart and legend: the card's tone is the ramp's ink */
      .pr-chart,
      .pr-legend {
        --ink: var(--tone-ink, var(--fluvy-state-energy-solar));
      }
      .pr-chart {
        touch-action: pan-y;
      }
      .pr-legend {
        column-gap: 12px;
      }
      .pr-chart .so-skeleton {
        height: 112px;
        margin-top: 0;
      }
      .pr-hour {
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: fv-grow-y 560ms var(--fv-ease-out) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + var(--bar-delay, 0ms));
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .pr-chart.is-scrub .pr-hour:not(.is-hover) {
        opacity: 0.4;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    day_: { state: true },
    arrays_: { state: true },
  };

  /** The hour under the pointer (0–23); null: the day's total. */
  private readonly scrubber = new ScrubController(this, (fraction) =>
    Math.min(HOURS - 1, Math.floor(fraction * HOURS)),
  );

  /** undefined while the day loads, null when the recorder knows nothing about the sensor. */
  declare day_: DayRecord | null | undefined;
  /** Each array's day (same), undefined while they load. */
  declare arrays_: ReadonlyArray<DayRecord | null> | undefined;

  private readonly history = new Refresher<DayRecord | null>();
  private readonly arrayHistory = new Refresher<ReadonlyArray<DayRecord | null>>();
  private readonly head = new HeadFit(this);
  private readonly follower = new CollectionFollower(this);
  /** The card's meter while it is missing from the house: as the recorder describes it (its unit). */
  private readonly recorded = new RecordedSensors(this);

  /** The card's meter as it is read: one no longer in the house in the unit the recorder kept it in. */
  protected override entity(id: string | undefined = this.config?.entity): EntityView {
    const view = super.entity(id);
    return id === this.config?.entity ? this.recorded.view(view) : view;
  }

  constructor() {
    super();
    this.day_ = undefined;
    this.arrays_ = undefined;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<ProductionCardConfig>()([
    'subtitle',
    'forecast_entity',
    'show_forecast',
    'peak_entity',
    'show_peak',
    'variant',
    'arrays',
    'collection_key',
    'unit',
    'decimals',
    'chart',
    'highlight',
    'show_now',
    'animate',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'arrays',
      title: 'production.editor_arrays',
      domains: ['sensor'],
      keys: ['entity', 'name'],
      schema: [entityField(['sensor']), nameField()],
    },
  ];
  /** The card's head is its meter's name (`title` was the older word for it). */
  static override aliases: AliasSpec = {
    keys: [{ from: 'title', to: 'name' }],
    items: { arrays: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = (config) => ({
    variant: 'full',
    show_forecast: true,
    show_peak: true,
    collection_key: '',
    ...NUMBER_DEFAULTS,
    ...chartDefaultsFor(config, capsIn(config)),
  });
  /** The date pickers on the dashboard, for the key; the units the editor offers are the meter's class's. */
  static override choices: EditorChoices = (config, hass) => ({
    collection_key: collectionChoices(hass),
    ...unitChoicesOf(config, hass),
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor']),
        fieldRow(nameField(), textField('subtitle')),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        fieldRow(
          { name: 'forecast_entity', selector: { entity: { domain: ['sensor'] } } },
          { name: 'peak_entity', selector: { entity: { domain: ['sensor'] } } },
        ),
        fieldRow(boolField('show_forecast'), boolField('show_peak')),
        fieldRow(selectField('variant', ['full', 'compact']), collectionField()),
        // the day's bars, or the arrays' stacks
        chartSection([DAY_CAPS, ARRAYS_CAPS], capsIn),
        numberFields({ when: hasLadder }),
        actionFields(),
      ],
      ...editorLabels(
        strings,
        { forecast_entity: 'forecast_entity', peak_entity: 'peak_entity' },
        COLLECTION_LABEL,
      ),
      computeHelper: collectionHelper,
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): ProductionCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    return {
      type: 'custom:fluvy-production-card',
      entity:
        sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'energy') ??
        sensors[0] ??
        '',
    };
  }

  protected override prepare(config: ProductionCardConfig): ProductionCardConfig {
    if (!config.entity) throw new Error('fluvy-production-card: "entity" is required');
    collectionKeyOf(config, 'fluvy-production-card');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil(FluvyProductionCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.compact
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private get compact(): boolean {
    return this.config?.variant === 'compact';
  }

  /** The arrays, at most four (the ramp has four steps). */
  private arrayList(): ProductionArray[] {
    return (this.config?.arrays ?? [])
      .map((a) => (typeof a === 'string' ? { entity: a } : a))
      .filter((a) => typeof a.entity === 'string' && a.entity !== '')
      .slice(0, MAX_ARRAYS);
  }

  protected override watched(): readonly string[] {
    return [
      this.config?.entity ?? '',
      this.config?.forecast_entity ?? '',
      this.config?.peak_entity ?? '',
      ...this.arrayList().map((a) => a.entity),
    ].filter(Boolean);
  }

  /** The clock (a test's, `_now`). */
  private clock(): Date {
    const frozen = this.config?._now;
    if (frozen) {
      const date = new Date(frozen);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  /** The moment the day is read up to: the clock, or the end of the last day a date picker holds. */
  private now(): Date {
    const range = this.follower.range();
    return range ? followedMoment(range, this.clock()) : this.clock();
  }

  /** The day read is over (a picker on a past day): the meter's reading now, its forecast and its peak are not its. */
  private get closed(): boolean {
    return this.now().getTime() < this.clock().getTime();
  }

  /** "Today", or the followed day. */
  private dayWords(): string {
    const now = this.now();
    return this.follower.range()
      ? rangeWords(this.hass, { start: houseMidnight(this.hass, now), end: now }, this.clock())
      : this.t('common.today');
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.follower.attach(this.hass, this.config?.collection_key || undefined);
    this.loadHours();
  }

  /** Once per entity and hour, and again when the answer has gone stale; the bars on screen stay until the new day arrives. */
  private loadHours(): void {
    const hass = this.hass;
    const view = this.entity();
    // a meter out of reach, even one no longer there, keeps the day the recorder holds of it
    if (!hass || !this.recorded.ready(view)) return;
    const now = this.now();
    const day = `${view.id}|${houseDay(hass, now)}`;
    const previous = this.history.request(
      `${day}|${wallClock(now, houseZone(hass)).hour}`,
      () => loadDay(hass, view.id, view.unit, now),
      (record) => (this.day_ = record),
    );
    if (previous !== null && !previous.startsWith(`${day}|`)) this.day_ = undefined;
    this.loadArrays(hass, now);
  }

  /** Every array's day, asked again every five minutes (a power sensor's hour in progress comes from its statistics). */
  private loadArrays(hass: HomeAssistant, now: Date): void {
    const arrays = this.arrayList();
    if (!arrays.length) return;
    const views = arrays.map((a) => this.entity(a.entity));
    const day = `${views.map((v) => `${v.id}:${v.unit}`).join(',')}|${houseDay(hass, now)}`;
    const previous = this.arrayHistory.request(
      `${day}|${Math.floor(now.getTime() / 300_000)}`,
      () =>
        Promise.all(
          views.map((view) => {
            const kind = family(view);
            if (kind === 'power') return loadPowerDay(hass, view.id, now).catch(() => null);
            if (kind === 'energy') return loadDay(hass, view.id, view.unit, now);
            return Promise.resolve(null);
          }),
        ),
      (records) => (this.arrays_ = records),
    );
    if (previous !== null && !previous.startsWith(`${day}|`)) this.arrays_ = undefined;
  }

  private get hour12(): boolean {
    return clock12(this.hass);
  }

  /** "12:00" on a 24 h clock, "12 PM" on a 12 h one: a whole hour never needs its minutes twice. */
  private hourLabel(hour: number): string {
    if (!this.hour12) return `${String(hour).padStart(2, '0')}:00`;
    return dateFormat(this.hass?.language ?? 'en', { hour: 'numeric', hour12: true }).format(
      new Date(2026, 0, 1, hour % 24),
    );
  }

  /**
   * An array's Wh in each hour of the day: its recorded hours, and — for an energy meter — the hour in progress read
   * live from it. `null` while it loads or when it cannot be read (no statistics, a unit that is neither power nor
   * energy).
   */
  private arrayHours(index: number, view: EntityView, hourNow: number): number[] | null {
    const record = this.arrays_?.[index];
    if (!record) return null;
    const kind = family(view);
    if (kind === 'power') return record.hours.map((v) => Math.max(0, v ?? 0));
    const base = toBase(1, view.unit);
    if (kind !== 'energy' || base.unit !== 'Wh') return null;
    const hours = record.hours.map((v) => Math.max(0, v ?? 0) * base.value);
    if (record.baseline !== null && view.number !== null && !this.closed) {
      const gain = view.number - record.baseline;
      hours[hourNow] =
        (hours[hourNow] ?? 0) + (gain >= 0 ? gain : Math.max(0, view.number)) * base.value;
    }
    return hours;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    // out of reach, the card is the live one in the off skin (the owner's rule, 1.9): the day so far is the recorder's
    const unusable = !isUsable(view);
    const tone: Tone = unusable ? 'off' : toneOf(this.config, 'solar');
    const compact = this.compact;
    const now = this.now();
    const zone = houseZone(this.hass);
    const wall = wallClock(now, zone);
    const hourNow = wall.hour;
    const minutes = wall.minute;
    const base = toBase(1, view.unit);
    const record = this.day_;
    const loading = record === undefined;
    const arrays = this.arrayList();

    // finished hours from the recorder, the hour in progress from the meter itself
    const produced = Array.from(
      { length: HOURS },
      (_unused, hour) => Math.max(0, record?.hours[hour] ?? 0) * base.value,
    );
    const closed = this.closed;
    if (record && record.baseline !== null && view.number !== null && !closed) {
      const gain = view.number - record.baseline;
      produced[hourNow] =
        (produced[hourNow] ?? 0) + (gain >= 0 ? gain : Math.max(0, view.number)) * base.value; // a meter below its last reading has reset
    }
    const known = record !== null && record !== undefined;
    const hovered = known ? this.scrubber.value : null;
    const total = sum(produced);

    // today's forecast and today's peak are not another day's
    const forecastView =
      this.config?.forecast_entity && this.config.show_forecast !== false && !closed
        ? this.entity(this.config.forecast_entity)
        : null;
    const hourly =
      forecastView && forecastView.status === 'ok' ? hourlyForecast(forecastView, now, zone) : null;
    const hourlyBase = hourly ? toBase(1, hourly.unit || view.unit) : null;
    const forecast =
      hourly && hourlyBase && hourlyBase.unit === base.unit
        ? hourly.hours.map((value) => value * hourlyBase.value)
        : null;
    const forecastState = forecastView ? baseOf(forecastView) : null;
    const forecastTotal =
      forecastState && forecastState.unit === base.unit
        ? forecastState.value
        : forecast
          ? sum(forecast)
          : null;

    // the forecast readout follows the pointer too: the hour's forecast while one is held, the day's otherwise
    const hourForecast = hovered !== null && forecast ? (forecast[hovered] ?? 0) : null;

    // like against like: what came in against what was forecast up to this very minute
    const expected = forecast
      ? sum(forecast.slice(0, hourNow)) + (forecast[hourNow] ?? 0) * (minutes / 60)
      : 0;
    const delta =
      known && !unusable && expected > 0
        ? Math.max(-9.99, Math.min(9.99, total / expected - 1))
        : null;

    const scale = figuresOf(
      this.hass,
      this.config,
      base.unit,
      Math.max(total, forecastTotal ?? 0),
      view,
    );
    const shown = (raw: number): string => writeFigure(this.hass, raw, scale);

    const peakHour = produced.reduce(
      (best, value, hour) => (value > (produced[best] ?? 0) ? hour : best),
      0,
    );
    const peakValue = produced[peakHour] ?? 0;
    const peakView =
      this.config?.peak_entity && !closed ? this.entity(this.config.peak_entity) : null;
    const peakBase = peakView ? baseOf(peakView) : null;
    const peakScale = peakBase
      ? figuresOf(this.hass, this.config, peakBase.unit, peakBase.value, peakView ?? undefined)
      : null;
    const peak = peakView
      ? peakBase && peakScale
        ? { value: writeFigure(this.hass, peakBase.value, peakScale), unit: peakScale.unit }
        : { value: '—', unit: '' }
      : known
        ? { value: shown(peakValue), unit: scale.unit }
        : { value: '—', unit: '' };

    // the sheet's bars: 80 px under a round ceiling, in 4 px steps — an hour below half a step draws nothing and is no sun hour
    const ceiling = ceilingFor(Math.max(...produced, ...(forecast ?? [])));
    const step = (raw: number): number =>
      ceiling > 0 ? Math.round(((Math.max(0, raw) / ceiling) * BAR_HEIGHT) / 4) * 4 : 0;
    // finished hours that produced, plus the elapsed part of the hour in progress: "7.4 h", not a count that jumps at the hour
    const sunHours = produced.reduce(
      (total, value, hour) => total + (step(value) > 0 ? (hour === hourNow ? minutes / 60 : 1) : 0),
      0,
    );

    const narrow = this.contentWidth < NARROW;
    const forecastShown = !compact && forecastTotal !== null && forecastTotal > 0 && !narrow;
    const fit = (versus: boolean, compared = true) =>
      this.head.fit({
        width: this.contentWidth,
        title: name,
        sub:
          this.config?.subtitle ??
          (versus ? `${this.dayWords()} · ${strings(this.hass, 'vs_forecast')}` : this.dayWords()),
        badge: unusable
          ? { text: stateWord(this.hass, view), tone: 'off' }
          : delta !== null && compared
            ? {
                text: `${delta >= 0 ? '+' : '−'}${formatNumber(this.hass, Math.abs(delta) * 100, { digits: 0 })} %`,
                tone: delta >= 0 ? tone : 'neutral',
              }
            : null,
      });
    // "vs forecast" only while something is compared: the badge's delta or the forecast's own readout — and the
    // delta never comes back beside a plain "Today", which would not say what it compares
    let fitted = fit(forecastTotal !== null);
    if (forecastTotal !== null && fitted.badge === nothing && !forecastShown)
      fitted = fit(false, false);

    // 24 bars of 8 spread over the column: the boundary between hour h−1 and h is where the label for h belongs
    const pitch = (this.contentWidth - 8) / 23;
    const boundary = (hour: number): number => (hour * pitch - (pitch - 8) / 2) / this.contentWidth;
    // the arrays' chart and a style centre a bar in each hour's slot: the boundary of hour h is h / 24
    const style = styleOf(this.config, arrays.length ? ARRAYS_CAPS : DAY_CAPS);
    const classic = style.preset === 'classic';
    const at = (hour: number): number =>
      arrays.length || !classic ? hour / HOURS : boundary(hour);
    const top = narrow ? 'm' : 'l';
    // the day's figure with the forecast beside it, in the longest of its words that leaves the forecast its room
    // ("So far" where "So far today" would wrap); else the forecast under it, and the longest the column holds:
    // measured at the day's widest figure and on what an hour of the bars says, so reading them never moves the row
    const widest = { value: shown(Math.max(total, forecastTotal ?? 0)), unit: scale.unit };
    const hour = { label: `${this.hourLabel(10)} – ${this.hourLabel(11)}`, ...widest };
    const side =
      forecastShown && forecastTotal !== null
        ? [{ label: strings(this.hass, 'forecast'), value: shown(forecastTotal), unit: scale.unit }]
        : [];
    const labels = [strings(this.hass, 'so_far'), strings(this.hass, 'so_far_short')] as const;
    const beside = side.length
      ? labels.find(
          (label) =>
            !sideStacked(this.head.ruler, this.contentWidth, [{ label, ...widest }, hour], side),
        )
      : undefined;
    const stacked = side.length > 0 && beside === undefined;
    const soFar =
      beside ??
      labels.find(
        (label) =>
          this.head.ruler.width('fv-readout > fv-readout__label', label) <= this.contentWidth,
      ) ??
      labels[1];
    const ticks: [number, string][] = [
      [0, this.hourLabel(0)],
      [at(6), this.hourLabel(6)],
      [0.5, this.hourLabel(12)],
      [at(18), this.hourLabel(18)],
      [1, this.hour12 ? this.hourLabel(24) : '24:00'],
    ];
    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'sun') : null,
        tone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      ${
        compact
          ? nothing
          : html`<div class="so-top fv-value-row ${stacked ? 'is-stacked' : ''}">
              ${
                hovered !== null
                  ? readout({
                      label: `${this.hourLabel(hovered)} – ${this.hourLabel(hovered + 1)}`,
                      value: shown(produced[hovered] ?? 0),
                      unit: scale.unit,
                      size: top,
                    })
                  : readout({
                      label: soFar,
                      value: known ? shown(total) : '—',
                      unit: known ? scale.unit : '',
                      size: top,
                    })
              }
              ${
                forecastShown && forecastTotal !== null
                  ? html`<div class="so-top__side">
                      ${readout({ label: strings(this.hass, 'forecast'), value: shown(hourForecast ?? forecastTotal), unit: scale.unit, size: 's' })}
                    </div>`
                  : nothing
              }
            </div>`
      }
      ${
        arrays.length
          ? this.renderArrays(arrays, { hourNow, forecast, unusable, tone, name, hovered, style })
          : loading
            ? html`<div class="fv-skeleton so-skeleton"></div>`
            : !classic
              ? this.renderStyled(
                  style,
                  // the hours so far, then the forecast's, hollow
                  [
                    {
                      values: produced.map((value, hour) =>
                        hour <= hourNow || closed ? value : (forecast?.[hour] ?? null),
                      ),
                    },
                  ],
                  { now: closed ? null : hourNow, unusable, tone, name, hovered },
                )
              : html`<div
                  class="so-bars fv-tone--${unusable ? 'neutral' : tone} ${hovered !== null ? 'is-scrub' : ''}"
                  role="img"
                  aria-label=${known ? `${strings(this.hass, 'so_far')}: ${shown(total)} ${scale.unit}` : name}
                  ${scrub(this.scrubber)}
                >
                  ${produced.map((value, hour) => {
                    const ahead = step(forecast?.[hour] ?? 0);
                    const done = step(value);
                    // a day with nothing in it still draws its baseline: one quiet stub per hour
                    return html`<span
                      class="so-bar ${hovered === hour ? 'is-hover' : ''}"
                      style="--bar-delay:${hour * 18}ms"
                    >
                      ${ahead > 0 || ceiling === 0 ? html`<span class="so-bar__forecast" data-measure="value" style="height:${ahead || 4}px"></span>` : nothing}
                      ${done > 0 ? html`<span class="so-bar__fill" data-measure="value" style="height:${done}px"></span>` : nothing}
                    </span>`;
                  })}
                </div>`
      }
      ${axis(this.contentWidth < AXIS_FULL ? [ticks[0], ticks[2], ticks[4]].filter((tick) => !!tick) : ticks)}
      ${arrays.length ? this.renderLegend(arrays, hourNow, hovered, unusable ? 'neutral' : tone, !classic) : nothing}
      ${compact || arrays.length ? nothing : this.renderStats(peak, known && peakValue > 0 ? this.hourLabel(peakHour) : '—', known ? formatNumber(this.hass, sunHours, { digits: 1 }) : null)}
    </article>`;
  }

  /**
   * The day's statistics under the bars — the peak and its hour (unless asked away) and the sun hours — in three
   * columns while every label and figure holds in its third, else fewer, a shorter last row taking the whole row; the
   * figures at the size the widest still fits.
   */
  private renderStats(
    peak: { readonly value: string; readonly unit: string },
    peakAt: string,
    sunHours: string | null,
  ): TemplateResult {
    const stats: StatText[] = [
      ...(this.config?.show_peak === false
        ? []
        : [
            { label: strings(this.hass, 'peak'), ...peak },
            { label: strings(this.hass, 'peak_at'), value: peakAt },
          ]),
      {
        label: strings(this.hass, 'sun_hours'),
        value: sunHours ?? '—',
        unit: sunHours === null ? '' : strings(this.hass, 'hour'),
      },
    ];
    const row = statsRow(this.head.ruler, this.contentWidth, stats);
    return html`<div
      class="so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}"
      style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
    >
      ${stats.map((stat) => readout({ ...stat, size: row.size }))}
    </div>`;
  }

  /**
   * The arrays' chart: each finished hour's bar stacked per array (the first on top, in the ink; each next one a step
   * down the ramp), the hours still to come the forecast, faint.
   */
  private renderArrays(
    arrays: readonly ProductionArray[],
    o: {
      readonly hourNow: number;
      readonly forecast: readonly number[] | null;
      readonly unusable: boolean;
      readonly tone: Tone;
      readonly name: string;
      readonly hovered: number | null;
      readonly style: ResolvedStyle;
    },
  ): TemplateResult {
    if (this.arrays_ === undefined)
      return html`<div class="en-chart pr-chart"><div class="fv-skeleton so-skeleton"></div></div>`;
    const w = this.contentWidth;
    const series = arrays.map((a, i) => this.arrayHours(i, this.entity(a.entity), o.hourNow));
    // columns: each array in its series' colour, the forecast after now hollow on the first
    if (o.style.preset !== 'classic')
      return this.renderStyled(
        o.style,
        series.map((hours, i) => ({
          values: Array.from({ length: HOURS }, (_u, hour) =>
            hour <= o.hourNow ? (hours?.[hour] ?? 0) : i ? null : (o.forecast?.[hour] ?? null),
          ),
          colour: `series-${i + 1}` as SeriesColour,
        })),
        { ...o, now: o.hourNow, height: CHART_HEIGHT },
      );
    const stack = (hour: number): number => sum(series.map((s) => (s ? (s[hour] ?? 0) : 0)));
    const future = (hour: number): number => (hour > o.hourNow ? (o.forecast?.[hour] ?? 0) : 0);
    const ceiling = ceilingFor(
      Math.max(0, ...Array.from({ length: HOURS }, (_u, h) => Math.max(stack(h), future(h)))),
    );
    // the gaps between an hour's arrays come out of the chart's height, so a full stack still fits it
    const room = CHART_HEIGHT - STACK_GAP * (arrays.length - 1);
    const px = (v: number): number => (ceiling > 0 ? (Math.max(0, v) / ceiling) * room : 0);
    const slot = w / HOURS;
    // an 8 bar in each hour's slot; a column too narrow for 24 of them draws them thinner, never touching
    const bar = Math.max(2, Math.min(BAR, Math.floor(slot * 0.6)));
    const radius = Math.min(3, bar / 2);
    const bars = Array.from({ length: HOURS }, (_u, hour) => {
      const x = (hour * slot + (slot - bar) / 2).toFixed(1);
      const rects: TemplateResult[] = [];
      if (hour <= o.hourNow) {
        // from the bottom up: the last array first, the first on top
        let y = CHART_HEIGHT;
        for (let i = arrays.length - 1; i >= 0; i--) {
          const h = px(series[i]?.[hour] ?? 0);
          if (h < 1) continue;
          y -= h;
          rects.push(
            svg`<rect class="en-bar ${RAMP[i] ?? ''}" x=${x} y=${y.toFixed(1)} width=${bar} height=${h.toFixed(1)} rx=${radius}></rect>`,
          );
          y -= STACK_GAP;
        }
      } else {
        // the forecast is hollow: a stack of arrays already spends the ink's light steps on the arrays themselves;
        // a bar too thin to be hollow (half a column) draws no forecast at all, as the head then says none
        const h = px(future(hour));
        if (h >= 2 && bar >= 5)
          rects.push(
            svg`<rect class="en-bar is-forecast" x=${(Number(x) + 0.75).toFixed(2)} y=${(CHART_HEIGHT - h + 0.75).toFixed(2)} width=${bar - 1.5} height=${(h - 1.5).toFixed(2)} rx=${Math.max(0, radius - 0.75)}></rect>`,
          );
      }
      // a day with nothing in it still draws its baseline: one quiet stub per hour
      if (ceiling === 0)
        rects.push(
          svg`<rect class="en-bar is-future" x=${x} y=${CHART_HEIGHT - 4} width=${bar} height="4" rx=${Math.min(2, radius)}></rect>`,
        );
      return svg`<g class="pr-hour ${o.hovered === hour ? 'is-hover' : ''}" style="--bar-delay:${hour * 18}ms">${rects}</g>`;
    });
    return html`<div
      class="en-chart pr-chart fv-tone--${o.unusable ? 'neutral' : o.tone} ${o.hovered !== null ? 'is-scrub' : ''}"
      role="img"
      aria-label=${o.name}
      ${scrub(this.scrubber)}
    >
      <svg
        width=${w}
        height=${CHART_HEIGHT}
        viewBox="0 0 ${w} ${CHART_HEIGHT}"
        aria-hidden="true"
        data-measure="drawn"
      >
        ${bars}
      </svg>
    </div>`;
  }

  /**
   * The day in a style, drawn by the engine: an hour a bar across the column, on a scale from zero (the arrays
   * stacked), the hours to come hollow and now marked where the style marks it, read by the hour under the pointer.
   */
  private renderStyled(
    style: ResolvedStyle,
    series: ChartSeries[],
    o: {
      readonly now: number | null;
      readonly unusable: boolean;
      readonly tone: Tone;
      readonly name: string;
      readonly hovered: number | null;
      readonly height?: number;
    },
  ): TemplateResult {
    return html`<div
      class="en-chart pr-chart fv-tone--${o.unusable ? 'neutral' : o.tone}"
      role="img"
      aria-label=${o.name}
      ${scrub(this.scrubber)}
    >
      ${drawChart({
        frame: { width: this.contentWidth, height: o.height ?? BAR_HEIGHT, headroom: 4, pad: 0 },
        series,
        style,
        kind: 'bars',
        now: o.now === null ? null : (o.now + 1) / HOURS,
        cursor: o.hovered === null ? null : (o.hovered + 0.5) / HOURS,
        id: 'pr',
      })}
    </div>`;
  }

  /**
   * Each array's day so far (or, under the pointer, its hour): the Distribution's legend, one unit for all, each
   * array's square in the ink's ramp — or in its series' colour, as a style's columns are (`series`).
   */
  private renderLegend(
    arrays: readonly ProductionArray[],
    hourNow: number,
    hovered: number | null,
    tone: Tone,
    series: boolean,
  ): TemplateResult {
    const views = arrays.map((a) => this.entity(a.entity));
    const figures = arrays.map((_a, i) => {
      const hours = this.arrayHours(i, views[i] as EntityView, hourNow);
      return hours ? (hovered !== null ? (hours[hovered] ?? 0) : sum(hours)) : null;
    });
    // one unit for the set, its decimal kept: "5.2 kWh" beside "6.0 kWh"
    const scale = scaleOf(figures, 'Wh', this.config);
    const values = figures.map((v) => (v === null ? '—' : scaled(this.hass, v, scale)));
    // a figure is never cut: the legend takes as many columns as hold its widest (all, two, or one a line)
    const widest = Math.max(
      ...values.map((value, i) =>
        this.head.ruler.width(
          'en-legend__value',
          value,
          'en-unit',
          figures[i] === null ? '' : scale.unit,
        ),
      ),
    );
    const w = this.contentWidth;
    const names = arrays.map((a, i) => this.nameFor(views[i] as EntityView, a.name));
    // the energy legend's rule: a name or a figure that does not fit its column folds the row, never cuts it
    const columns = legendColumns(names, w, this.head.ruler, widest, LEGEND_GAP);
    return html`<div
      class="en-legend pr-legend fv-tone--${tone}"
      style=${columns < arrays.length ? `grid-template-columns:repeat(${columns},minmax(0,1fr));grid-auto-flow:row;row-gap:8px` : nothing}
    >
      ${arrays.map((_a, i) => {
        const v = figures[i] ?? null;
        // a square in its series' colour, as the columns wear it (the house's set's in the mode's), or a step of the ink
        const paint = series ? seriesPaint(`series-${i + 1}` as SeriesColour) : undefined;
        // the Distribution's legend centres each item in its column
        return html`<span class="en-legend__item" data-align="center">
          <span class="en-legend__name"
            ><i
              class="en-sq ${paint ? paint.className : (RAMP[i] ?? '')}"
              style=${paint ? `${paint.style};background:var(--tone-ink)` : nothing}
            ></i
            ><span class="en-legend__text" data-name>${names[i]}</span></span
          >
          <span class="en-legend__value"
            >${values[i]}${
              v === null ? nothing : html`<span class="en-unit">${scale.unit}</span>`
            }</span
          >
        </span>`;
      })}
    </div>`;
  }
}
