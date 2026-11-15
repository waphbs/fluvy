import { productionHeight } from '../energy-family.js';
import {
  clock12,
  dateFormat,
  formatNumber,
  houseZone,
  isUsable,
  plural,
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
  barGeometry,
  chartDefaultsFor,
  chartSection,
  chartStyles,
  drawChart,
  labelsApart,
  styleOf,
  scrub,
  ScrubController,
  seriesPaint,
  thinStep,
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
  choiceField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  hasLadder,
  iconField,
  nameField,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  onlyWhen,
  selectField,
  showIconField,
  textField,
  unitChoicesOf,
} from '../shared/form.js';
import { Refresher } from '../shared/refresh.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { dayHours, houseDay, loadDay, loadPowerDay, type DayRecord } from './day.js';

import {
  dayOf,
  daysAhead,
  houseForecast,
  sensorForecast,
  tomorrowOf,
  type Forecast,
  type ForecastDay,
} from './forecast.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { statsRow, type StatText } from '../shared/readouts.js';
import { Ticker } from '../shared/ticker.js';
import { sideStacked, type Figure } from '../shared/value-row.js';

const strings = words('production');
/** The word the days ahead share with the history bars: a bar a day, and their total. */
const bars = words('history-bars');

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
  /**
   * Several arrays (east and west roofs): each hour's bar stacked per array, and a legend of each one's day. Where
   * `entity` is one of them, the day's figure is theirs together; a meter of its own keeps its own.
   */
  arrays?: ReadonlyArray<string | ProductionArray>;
  /** An Energy date picker's key (`energy_…`): the card draws the last day of its range (the day so far while it holds today). */
  collection_key?: string;
  /**
   * The day the card shows: `today` (default) — what the meter made, hour by hour, over its forecast —, `tomorrow` —
   * the forecast's hours — or `ahead`: the days the forecast holds after today, a bar a day.
   */
  day?: 'today' | 'tomorrow' | 'ahead';
  /** The most days `ahead` draws (2 to 14); without it, every day the forecast holds. */
  days?: number;
  /** Test hook, as in the clock cards: an ISO instant the card takes for "now". */
  _now?: string;
}

type Day = NonNullable<ProductionCardConfig['day']>;
/** The day a config shows: today, unless it names a forecast day. */
const dayIn = (data: Readonly<Record<string, unknown>>): Day =>
  data['day'] === 'tomorrow' || data['day'] === 'ahead' ? data['day'] : 'today';
/** Whether a field acts on the day a form holds: a field of today's meter has nothing to do on a forecast day. */
const onDay =
  (...days: readonly Day[]) =>
  (data: Readonly<Record<string, unknown>>): boolean =>
    days.includes(dayIn(data));

const HOURS = 24;
const HOUR = 3_600_000;
const BAR_HEIGHT = 80;
/** The most days ahead a card may be capped to: two weeks. */
const MAX_DAYS = 14;
/** The arrays' chart: 112 tall, an 8 bar centred in each hour's slot, 2 between an hour's arrays. */
const CHART_HEIGHT = 112;
const BAR = 8;
const STACK_GAP = 2;
/** The least classic's hourly bars stand apart: below it they draw thinner. */
const BAR_APART = 2;
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
/** Round the panel a forecast day without a forecast draws: the card's padding (40), its head (44), the 16 under it. */
const NONE_FRAME = 100;
/** A finished hour is compiled a few seconds after it ends; asking again picks it up, and keeps a long-lived dashboard honest. */

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** An array as the chart and the legend draw it: its name and its Wh an hour (null: it cannot be read). */
interface Stack {
  readonly name: string;
  readonly hours: number[] | null;
}

/** Days added hour by hour, those that cannot be read counting as nothing; null where none can. */
const added = (days: ReadonlyArray<readonly number[] | null>): number[] | null => {
  const read = days.filter((hours): hours is readonly number[] => hours !== null);
  return read.length
    ? Array.from({ length: HOURS }, (_u, hour) => sum(read.map((hours) => hours[hour] ?? 0)))
    : null;
};

/** A bar's height on the sheet: 80 px under a round `ceiling`, in 4 px steps — one below half a step draws nothing. */
const stepOn =
  (ceiling: number) =>
  (raw: number): number =>
    ceiling > 0 ? Math.round(((Math.max(0, raw) / ceiling) * BAR_HEIGHT) / 4) * 4 : 0;

/** How a day ahead is said where it is read, longest first: the first the column holds is written. */
const DAY_FORMS: readonly Intl.DateTimeFormatOptions[] = [
  { weekday: 'long', day: 'numeric', month: 'short' },
  { weekday: 'short', day: 'numeric', month: 'short' },
  { weekday: 'short' },
];

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
/** A forecast day: every bar is to come, so none is lit and no now is marked. */
const FORECAST_CAPS: ChartCaps = {
  bars: true,
  styles: ['classic', 'soft', 'columns'],
  keys: ['animate'],
};
const capsIn = (data: Readonly<Record<string, unknown>>): ChartCaps =>
  dayIn(data) !== 'today'
    ? FORECAST_CAPS
    : Array.isArray(data['arrays']) && data['arrays'].length
      ? ARRAYS_CAPS
      : DAY_CAPS;

/**
 * A growing meter's day, hour by hour: the recorded hours as solid bars, the hour in progress read
 * live from the sensor, the forecast standing behind them and carrying on past "now", the day's
 * figures above and its peak below. With several arrays, each hour's bar is stacked per array — the
 * future hours the forecast, faint — over a legend of what each array made. "Today" is the house's:
 * it begins at the midnight Home Assistant shows, in the house's zone. The forecast is a sensor's
 * (`forecast_entity`), else Home Assistant's own for the card's meter and arrays; on a forecast day
 * (`day`) the card is the forecast alone: tomorrow's hours, or the days ahead.
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
      /* classic's bars as wide as the column lets them be: an hour's 8 (thinner where 24 of them would touch), a
         day's 40 % of its slot, centred in it */
      .so-bar,
      .so-bar__fill,
      .so-bar__forecast {
        width: var(--pr-bar, 8px);
      }
      .pr-days {
        justify-content: space-around;
      }
      .pr-days .so-bar__forecast {
        border-radius: min(4px, var(--pr-bar) / 2);
      }
      /* a forecast day's bars are the day itself, not a ground behind what was made: the ink at the ramp's light
         step (45 %, what the arrays' forecast wears), which reads on a dark card too */
      .pr-ahead .so-bar__forecast {
        background: color-mix(
          in srgb,
          var(--tone-ink, var(--fluvy-state-energy-solar)) 45%,
          var(--fluvy-card)
        );
      }
      /* a forecast day with no forecast: the panel stands for everything under the head, as tall as it (a compact
         card's holds its ring and its line and no more: taller only where a narrow column breaks the line) */
      .pr-none {
        display: grid;
        margin-top: 16px;
      }
      .pr-none .fv-empty-state {
        min-height: 0;
      }
      /* under a full card the panel is 244 tall and its ring and words are centred in it: their lines are 24, so
         however many they wrap to, what is left over halves onto the 4 grid */
      .pr-none--full .fv-empty-state__text,
      .pr-none--full .fv-empty-state__hint {
        line-height: 24px;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    day_: { state: true },
    arrays_: { state: true },
    forecast_: { state: true },
  };

  /** The bars the chart holds: a day's hours, or the days ahead. */
  private slots = HOURS;
  /** The bar under the pointer (an hour, 0–23, or a day ahead); null: the whole chart's total. */
  private readonly scrubber = new ScrubController(this, (fraction) =>
    Math.min(this.slots - 1, Math.floor(fraction * this.slots)),
  );

  /** undefined while the day loads, null when the recorder knows nothing about the sensor. */
  declare day_: DayRecord | null | undefined;
  /** Each array's day (same), undefined while they load. */
  declare arrays_: ReadonlyArray<DayRecord | null> | undefined;
  /** Home Assistant's own forecast for the card's sensors: undefined while it loads, null where none is linked to them. */
  declare forecast_: Forecast | null | undefined;

  private readonly history = new Refresher<DayRecord | null>();
  private readonly arrayHistory = new Refresher<ReadonlyArray<DayRecord | null>>();
  private readonly linked = new Refresher<Forecast | null>();
  /** The hour of the clock the card was last drawn in: the next one draws it again. */
  private hour = -1;
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
    this.forecast_ = undefined;
    // an hour that ends asks for the forecast again, and midnight turns the day, whatever the meter does meanwhile
    new Ticker(this, () => Math.floor(Date.now() / HOUR) !== this.hour);
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
    'day',
    'days',
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
    day: 'today',
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
        choiceField('day', [
          ['today', 'common.today'],
          ['tomorrow', 'common.tomorrow'],
          ['ahead', 'editor.days'],
        ]),
        onlyWhen(onDay('ahead'), numberField('days', 2, MAX_DAYS)),
        // a forecast day reads no meter: its peak sensor, its forecast's switch and a date picker have nothing to do
        fieldRow(
          { name: 'forecast_entity', selector: { entity: { domain: ['sensor'] } } },
          onlyWhen(onDay('today'), {
            name: 'peak_entity',
            selector: { entity: { domain: ['sensor'] } },
          }),
        ),
        fieldRow(onlyWhen(onDay('today'), boolField('show_forecast')), boolField('show_peak')),
        fieldRow(
          selectField('variant', ['full', 'compact']),
          onlyWhen(onDay('today'), collectionField()),
        ),
        // the day's bars, the arrays' stacks, or a forecast day's
        chartSection([DAY_CAPS, ARRAYS_CAPS, FORECAST_CAPS], capsIn),
        numberFields({ when: hasLadder }),
        actionFields({ icon: true }),
      ],
      ...editorLabels(
        strings,
        { forecast_entity: 'forecast_entity', peak_entity: 'peak_entity' },
        { ...COLLECTION_LABEL, day: 'energy-flow.editor_period', days: 'editor.days' },
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

  /** The day the card shows. */
  private get day(): Day {
    return dayIn(this.config ?? {});
  }

  /** The arrays, every one: the day is all of theirs, four of them drawn (`stacks`). */
  private arrayList(): ProductionArray[] {
    return (this.config?.arrays ?? [])
      .map((a) => (typeof a === 'string' ? { entity: a } : a))
      .filter((a) => typeof a.entity === 'string' && a.entity !== '');
  }

  /**
   * The arrays as their chart and legend draw them, each with its name and its hours (null: it cannot be read): four
   * at most, as the ramp has four steps, the fourth "Other" past four, the rest's hours added (null where none reads).
   */
  private stacks(arrays: readonly ProductionArray[], hourNow: number): Stack[] {
    const each = arrays.map((a, i) => {
      const view = this.entity(a.entity);
      return { name: this.nameFor(view, a.name), hours: this.arrayHours(i, view, hourNow) };
    });
    if (each.length <= MAX_ARRAYS) return each;
    return [
      ...each.slice(0, MAX_ARRAYS - 1),
      {
        name: this.t('distribution.other'),
        hours: added(each.slice(MAX_ARRAYS - 1).map((stack) => stack.hours)),
      },
    ];
  }

  /** The arrays stand for the whole day: the card's meter is one of them (several arrays, #183). */
  private get summed(): boolean {
    return this.arrayList().some((a) => a.entity === this.config?.entity);
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
    this.hour = Math.floor(Date.now() / HOUR);
    const today = this.day === 'today';
    // a forecast day follows no date picker and reads no meter
    this.follower.attach(this.hass, (today && this.config?.collection_key) || undefined);
    if (today) this.loadHours();
    this.loadForecast();
  }

  /**
   * Home Assistant's own forecast for the card's meter and arrays, where the card reads it: on a forecast day always
   * (after its sensor's days, where one carries them, and the house's whole forecast for a meter the Energy dashboard
   * does not know), today where no sensor is named and the forecast is not turned off. Asked once an hour of the clock.
   */
  private loadForecast(): void {
    const hass = this.hass;
    const config = this.config;
    if (!hass || !config) return;
    const ahead = this.day !== 'today';
    if (!ahead && (config.forecast_entity || config.show_forecast === false)) return;
    const ids = [config.entity ?? '', ...this.arrayList().map((a) => a.entity)].filter(Boolean);
    const key = `${ids.join(',')}|${ahead}`;
    const previous = this.linked.request(
      `${key}|${this.hour}`,
      () => houseForecast(hass, ids, ahead, this.clock()),
      (forecast) => (this.forecast_ = forecast),
    );
    if (previous !== null && !previous.startsWith(`${key}|`)) this.forecast_ = undefined;
  }

  /**
   * The card's forecast by day, in its base unit: its sensor's where that carries `day`, else Home Assistant's own —
   * today a sensor that is named wins, whatever it carries. None where neither holds one, or where it counts
   * something else than `unit` (the meter's).
   */
  private forecastIn(day: Date, unit?: string): Forecast | null {
    const id = this.config?.forecast_entity;
    const view = id ? this.entity(id) : null;
    const own = view?.status === 'ok' ? sensorForecast(view, day, houseZone(this.hass)) : null;
    const forecast = own ?? (id && this.day === 'today' ? null : this.forecast_);
    if (!forecast) return null;
    const base = toBase(1, forecast.unit || this.entity().unit);
    if (unit !== undefined && base.unit !== unit) return null;
    return {
      unit: base.unit,
      days: forecast.days.map((filed) => ({
        ...filed,
        hours: filed.hours.map((amount) => amount * base.value),
      })),
    };
  }

  /** Once per entity and hour, and again when the answer has gone stale; the bars on screen stay until the new day arrives. */
  private loadHours(): void {
    const hass = this.hass;
    const view = this.entity();
    // a meter out of reach, even one no longer there, keeps the day the recorder holds of it
    if (!hass || !this.recorded.ready(view)) return;
    const now = this.now();
    // the arrays' days are the day where they stand for it
    if (!this.summed) {
      const day = `${view.id}|${houseDay(hass, now)}`;
      const previous = this.history.request(
        `${day}|${wallClock(now, houseZone(hass)).hour}`,
        () => loadDay(hass, view.id, view.unit, now),
        (record) => (this.day_ = record),
      );
      if (previous !== null && !previous.startsWith(`${day}|`)) this.day_ = undefined;
    }
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

  /** An hour as the bars are read: "10:00 – 11:00". */
  private hourSpan(hour: number): string {
    return `${this.hourLabel(hour)} – ${this.hourLabel(hour + 1)}`;
  }

  /** A day by its date on the house's clock: "Sat" under its bar, "Saturday, Nov 14" where it is read. */
  private dayLabel(at: number, form: Intl.DateTimeFormatOptions): string {
    const zone = houseZone(this.hass);
    return dateFormat(this.hass?.language ?? 'en', {
      ...form,
      ...(zone ? { timeZone: zone } : {}),
    }).format(new Date(at));
  }

  /** Classic's bar in the column: 8 across, thinner where 24 of them would not stand 2 apart. */
  private get hourBar(): number {
    return Math.max(
      2,
      Math.min(BAR, Math.floor((this.contentWidth - (HOURS - 1) * BAR_APART) / HOURS)),
    );
  }

  /**
   * The day's quarters under its bars, the ends and noon alone in a narrow column. Classic's bars are spread from edge
   * to edge (`spread`): the boundary between hour h−1 and h is where the label for h belongs; the arrays' chart and a
   * style centre a bar in each hour's slot, whose boundary is h / 24.
   */
  private hourAxis(spread: boolean): TemplateResult {
    const bar = this.hourBar;
    const pitch = (this.contentWidth - bar) / (HOURS - 1);
    const at = (hour: number): number =>
      spread ? (hour * pitch - (pitch - bar) / 2) / this.contentWidth : hour / HOURS;
    const ticks: [number, string][] = [
      [0, this.hourLabel(0)],
      [at(6), this.hourLabel(6)],
      [0.5, this.hourLabel(12)],
      [at(18), this.hourLabel(18)],
      [1, this.hour12 ? this.hourLabel(24) : '24:00'],
    ];
    return axis(
      this.contentWidth < AXIS_FULL
        ? [ticks[0], ticks[2], ticks[4]].filter((tick) => !!tick)
        : ticks,
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
    return dayHours(record, base.value, hourNow, this.closed ? null : view.number);
  }

  /**
   * The arrays' day together, every one of them, in Wh an hour: an array that cannot be read counts as nothing while
   * another reads; null where none can, undefined while they load.
   */
  private arraysDay(
    arrays: readonly ProductionArray[],
    hourNow: number,
  ): number[] | null | undefined {
    if (this.arrays_ === undefined) return undefined;
    return added(arrays.map((a, i) => this.arrayHours(i, this.entity(a.entity), hourNow)));
  }

  protected renderCard(): TemplateResult {
    if (this.day !== 'today') return this.renderForecast();
    this.slots = HOURS;
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    const arrays = this.arrayList();
    // the arrays stand for the day where the meter is one of them (#183): its figures are theirs together, in Wh
    const summed = this.summed;
    // out of reach, the card is the live one in the off skin (the owner's rule, 1.9): the day so far is the recorder's;
    // the arrays' only where none of them can be read
    const unusable = summed
      ? arrays.every((a) => !isUsable(this.entity(a.entity)))
      : !isUsable(view);
    const tone: Tone = unusable ? 'off' : toneOf(this.config, 'solar');
    const compact = this.compact;
    const now = this.now();
    const zone = houseZone(this.hass);
    const wall = wallClock(now, zone);
    const hourNow = wall.hour;
    const minutes = wall.minute;
    const base = summed ? { unit: 'Wh', value: 1 } : toBase(1, view.unit);
    const record = this.day_;
    const stacks = this.stacks(arrays, hourNow);

    // finished hours from the recorder, the hour in progress from the meter itself
    const closed = this.closed;
    const day = summed
      ? this.arraysDay(arrays, hourNow)
      : record && dayHours(record, base.value, hourNow, closed ? null : view.number);
    const loading = day === undefined;
    const known = day !== null && day !== undefined;
    const produced = day ?? new Array<number>(HOURS).fill(0);
    const hovered = known ? this.scrubber.value : null;
    const total = sum(produced);

    // today's forecast and today's peak are not another day's
    const forecasting = this.config?.show_forecast !== false && !closed;
    const forecastView =
      this.config?.forecast_entity && forecasting ? this.entity(this.config.forecast_entity) : null;
    // the hours a sensor carries where one is named, else Home Assistant's own for the meter and its arrays
    const today = dayOf(now, zone);
    const forecast = forecasting
      ? (this.forecastIn(now, base.unit)?.days.find((filed) => filed.day === today)?.hours ?? null)
      : null;
    const forecastState = forecastView ? baseOf(forecastView) : null;
    const forecastTotal =
      forecastState && forecastState.unit === base.unit
        ? forecastState.value
        : forecast
          ? sum(forecast)
          : null;

    // like against like: what came in against what was forecast up to this very minute
    const expected = forecast
      ? sum(forecast.slice(0, hourNow)) + (forecast[hourNow] ?? 0) * (minutes / 60)
      : 0;
    const delta =
      known && !unusable && expected > 0
        ? Math.max(-9.99, Math.min(9.99, total / expected - 1))
        : null;
    // under the pointer the badge is that hour's share of its own forecast, like the figure above it: the day's
    // progress would answer a question the row no longer asks (an hour that has not come reads −100 %)
    const hoveredHour = hovered !== null && forecast ? (forecast[hovered] ?? 0) : 0;
    const hourDelta =
      hovered !== null && hoveredHour > 0
        ? Math.max(-1, Math.min(9.99, (produced[hovered] ?? 0) / hoveredHour - 1))
        : null;
    const said = hourDelta ?? delta;

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

    // the sheet's bars: an hour below half a step draws nothing and is no sun hour
    const ceiling = ceilingFor(Math.max(...produced, ...(forecast ?? [])));
    const step = stepOn(ceiling);
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
          : said !== null && compared
            ? {
                text: `${said >= 0 ? '+' : '−'}${formatNumber(this.hass, Math.abs(said) * 100, { digits: 0 })} %`,
                tone: said >= 0 ? tone : 'neutral',
              }
            : null,
      });
    // "vs forecast" only while something is compared: the badge's delta or the forecast's own readout — and the
    // delta never comes back beside a plain "Today", which would not say what it compares
    let fitted = fit(forecastTotal !== null);
    if (forecastTotal !== null && fitted.badge === nothing && !forecastShown)
      fitted = fit(false, false);

    const style = styleOf(this.config, arrays.length ? ARRAYS_CAPS : DAY_CAPS);
    const classic = style.preset === 'classic';
    const top = narrow ? 'm' : 'l';
    // the day's figure with the forecast beside it, in the longest of its words that leaves the forecast its room
    // ("So far" where "So far today" would wrap); else the forecast under it, and the longest the column holds:
    // measured at the day's widest figure and on what an hour of the bars says, so reading them never moves the row
    const widest = { value: shown(Math.max(total, forecastTotal ?? 0)), unit: scale.unit };
    const hour = { label: this.hourSpan(10), ...widest };
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
                      label: this.hourSpan(hovered),
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
                      ${readout({ label: strings(this.hass, 'forecast'), value: shown(hovered !== null && forecast ? (forecast[hovered] ?? 0) : forecastTotal), unit: scale.unit, size: 's' })}
                    </div>`
                  : nothing
              }
            </div>`
      }
      ${
        arrays.length
          ? this.renderArrays(stacks, {
              hourNow,
              forecast,
              unusable,
              tone,
              name,
              hovered,
              style,
            })
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
              : this.renderHours(produced, forecast, ceiling, {
                  tone: unusable ? 'neutral' : tone,
                  hovered,
                  label: known
                    ? `${strings(this.hass, 'so_far')}: ${shown(total)} ${scale.unit}`
                    : name,
                })
      }
      ${this.hourAxis(classic && !arrays.length)}
      ${arrays.length ? this.renderLegend(stacks, hovered, unusable ? 'neutral' : tone, !classic) : nothing}
      ${compact || arrays.length ? nothing : this.renderStats(peak, known && peakValue > 0 ? this.hourLabel(peakHour) : '—', known ? formatNumber(this.hass, sunHours, { digits: 1 }) : null)}
    </article>`;
  }

  /**
   * Classic's day: 24 bars of 8 across the column on the sheet's 4 px steps, each hour's forecast quiet behind what
   * it made (`ceiling`: the round top they are drawn under).
   */
  private renderHours(
    produced: readonly number[],
    forecast: readonly number[] | null,
    ceiling: number,
    o: {
      readonly tone: Tone;
      readonly hovered: number | null;
      readonly label: string;
      /** A forecast day: the forecast is the day itself. */
      readonly ahead?: boolean;
    },
  ): TemplateResult {
    const step = stepOn(ceiling);
    return html`<div
      class="so-bars fv-tone--${o.tone} ${o.ahead ? 'pr-ahead' : ''} ${o.hovered !== null ? 'is-scrub' : ''}"
      style="--pr-bar:${this.hourBar}px"
      role="img"
      aria-label=${o.label}
      ${scrub(this.scrubber)}
    >
      ${produced.map((value, hour) => {
        const ahead = step(forecast?.[hour] ?? 0);
        const done = step(value);
        // a day with nothing in it still draws its baseline: one quiet stub per hour
        return html`<span
          class="so-bar ${o.hovered === hour ? 'is-hover' : ''}"
          style="--bar-delay:${hour * 18}ms"
        >
          ${ahead > 0 || ceiling === 0 ? html`<span class="so-bar__forecast" data-measure="value" style="height:${ahead || 4}px"></span>` : nothing}
          ${done > 0 ? html`<span class="so-bar__fill" data-measure="value" style="height:${done}px"></span>` : nothing}
        </span>`;
      })}
    </div>`;
  }

  /**
   * A forecast day (`tomorrow`, `ahead`): today's anatomy with nothing made in it yet. Tomorrow is its hours — the
   * day's total with today's forecast beside it, its best hour, when, and its hours of sun; the days ahead are a bar a
   * day — their total, the average, the best and the lowest day. Every bar is the forecast's in the card's style
   * (classic's ink at its light step, a style's hollow bar) and reads under the pointer. The meter is not read: out of reach, the
   * card still says what the forecast says. With no forecast for the day, a quiet panel keeps the card's size.
   */
  private renderForecast(): TemplateResult {
    const hass = this.hass;
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    const tone = toneOf(this.config, 'solar');
    const compact = this.compact;
    const daily = this.day === 'ahead';
    const now = this.clock();
    const zone = houseZone(hass);
    const today = dayOf(now, zone);
    const next = tomorrowOf(hass, now);
    const tomorrow = dayOf(next, zone);
    const forecast = this.forecastIn(next);
    const ahead = forecast ? daysAhead(forecast.days, today) : [];
    // the days ahead, every one the forecast holds or as many as asked for, or tomorrow alone
    const cap = Number(this.config?.days);
    const days = daily
      ? ahead.slice(0, cap >= 1 ? Math.round(cap) : undefined)
      : ahead.filter((filed) => filed.day === tomorrow);
    const values = daily ? days.map((filed) => sum(filed.hours)) : [...(days[0]?.hours ?? [])];
    const known = values.length > 0;
    const loading = !forecast && this.forecast_ === undefined;
    this.slots = known ? values.length : HOURS;
    const hovered = known ? this.scrubber.value : null;
    const total = sum(values);
    // tomorrow reads beside today's forecast, where the forecast holds today too
    const todays = daily ? undefined : forecast?.days.find((filed) => filed.day === today)?.hours;
    const scale = figuresOf(
      hass,
      this.config,
      forecast?.unit ?? 'Wh',
      daily ? Math.max(0, ...values) : Math.max(total, todays ? sum(todays) : 0),
      view,
    );
    const shown = (raw: number): string => writeFigure(hass, raw, scale);
    const figure = (raw: number): { value: string; unit: string } =>
      known ? { value: shown(raw), unit: scale.unit } : { value: '—', unit: '' };
    const count = days.length;
    const fitted = this.head.fit({
      width: this.contentWidth,
      title: name,
      sub:
        this.config?.subtitle ??
        (!daily || count === 1
          ? strings(hass, 'forecast_tomorrow')
          : count
            ? plural(hass, 'production.forecast_days', count, { count })
            : strings(hass, 'forecast')),
      // a column that does not hold the day says what the card is
      shorter: [strings(hass, 'forecast')],
      // a compact card writes no figure under its head: the day's total, or the days', is its badge
      badge: compact && known ? { text: `${shown(total)} ${scale.unit}`, tone } : null,
    });
    const chrome = head({
      icon: fitted.icon ? (this.config?.icon ?? 'sun') : null,
      tone,
      title: name,
      sub: fitted.sub,
      trailing: fitted.badge,
      cut: fitted.cut,
      ...this.headActions(view.id),
      name: true,
    });
    if (!known && !loading)
      return html`<article class="fv-card so-card" data-card>
        ${chrome}
        <div
          class="pr-none ${compact ? '' : 'pr-none--full'}"
          style="min-height:${FluvyProductionCard.layoutHeight(this.config ?? { type: '' }) - NONE_FRAME}px"
        >
          ${this.head.empty(
            'sun',
            strings(hass, 'no_forecast'),
            // a compact card's panel holds its ring and its line, no more
            compact ? '' : strings(hass, 'no_forecast_hint'),
            this.contentWidth,
          )}
        </div>
      </article>`;

    // the day as it is read: an hour's span, or a day by its name in the longest form the column holds
    const read = (index: number): string => {
      if (!daily) return this.hourSpan(index);
      const forms = DAY_FORMS.map((form) => this.dayLabel(days[index]?.at ?? 0, form));
      return (
        forms.find(
          (label) =>
            this.head.ruler.width('fv-readout > fv-readout__label', label) <= this.contentWidth,
        ) ?? (forms[forms.length - 1] as string)
      );
    };
    const narrow = this.contentWidth < NARROW;
    const rest = daily ? bars(hass, 'kind_total') : this.t('common.tomorrow');
    const widest = shown(Math.max(total, todays ? sum(todays) : 0));
    const beside: Figure[] =
      todays && known && !narrow
        ? [{ label: this.t('common.today'), value: widest, unit: scale.unit }]
        : [];
    // laid out for what the row says at rest and while an hour is read, at its widest figure: reading never moves it
    const stacked = sideStacked(
      this.head.ruler,
      this.contentWidth,
      [rest, this.hourSpan(10)].map((label) => ({ label, value: widest, unit: scale.unit })),
      beside,
    );
    const asked = styleOf(this.config, FORECAST_CAPS);
    // a style's hairlines at the quarters are a day's hours: a row of days draws none
    const axes = asked.grid.axes;
    const style: ResolvedStyle = daily
      ? {
          ...asked,
          grid: { ...asked.grid, axes: axes === 'both' ? 'y' : axes === 'x' ? 'none' : axes },
        }
      : asked;
    const label = known ? `${rest}: ${shown(total)} ${scale.unit}` : name;
    const best = values.indexOf(Math.max(...values));
    const ceiling = ceilingFor(Math.max(0, ...values));
    const step = stepOn(ceiling);
    return html`<article class="fv-card so-card" data-card>
      ${chrome}
      ${
        compact
          ? nothing
          : html`<div class="so-top fv-value-row ${stacked ? 'is-stacked' : ''}">
              ${readout({
                label: hovered !== null ? read(hovered) : rest,
                ...figure(hovered !== null ? (values[hovered] ?? 0) : total),
                size: narrow ? 'm' : 'l',
              })}
              ${
                beside.length && todays
                  ? html`<div class="so-top__side">
                      ${readout({
                        label: this.t('common.today'),
                        value: shown(hovered !== null ? (todays[hovered] ?? 0) : sum(todays)),
                        unit: scale.unit,
                        size: 's',
                      })}
                    </div>`
                  : nothing
              }
            </div>`
      }
      ${
        loading
          ? html`<div class="fv-skeleton so-skeleton"></div>`
          : style.preset !== 'classic'
            ? this.renderStyled(style, [{ values }], {
                now: -1,
                unusable: false,
                tone,
                name: label,
                hovered,
              })
            : daily
              ? this.renderDays(values, step, { tone, hovered, label })
              : this.renderHours(new Array<number>(HOURS).fill(0), values, ceiling, {
                  tone,
                  hovered,
                  label,
                  ahead: true,
                })
      }
      ${daily ? this.dayAxis(days) : this.hourAxis(style.preset === 'classic')}
      ${
        compact
          ? nothing
          : daily
            ? this.renderRow([
                { label: this.t('common.average'), ...figure(count ? total / count : 0) },
                ...(this.config?.show_peak === false
                  ? []
                  : (['best_day', 'lowest_day'] as const).map((key, lowest) => ({
                      label: strings(hass, key),
                      value: known
                        ? this.dayLabel(
                            days[lowest ? values.indexOf(Math.min(...values)) : best]?.at ?? 0,
                            count > 7 ? { weekday: 'short', day: 'numeric' } : { weekday: 'short' },
                          )
                        : '—',
                    }))),
              ])
            : this.renderStats(
                figure(values[best] ?? 0),
                known && (values[best] ?? 0) > 0 ? this.hourLabel(best) : '—',
                known
                  ? formatNumber(hass, values.filter((amount) => step(amount) > 0).length, {
                      digits: 0,
                    })
                  : null,
              )
      }
    </article>`;
  }

  /**
   * Classic's days ahead: a bar a day centred in its slot (the engine's width: 40 % of it), the ink at its light
   * step, on the sheet's 4 px steps.
   */
  private renderDays(
    values: readonly number[],
    step: (raw: number) => number,
    o: { readonly tone: Tone; readonly hovered: number | null; readonly label: string },
  ): TemplateResult {
    return html`<div
      class="so-bars pr-days pr-ahead fv-tone--${o.tone} ${o.hovered !== null ? 'is-scrub' : ''}"
      style="--pr-bar:${barGeometry(values.length, this.contentWidth).bar}px"
      role="img"
      aria-label=${o.label}
      ${scrub(this.scrubber)}
    >
      ${values.map(
        (value, day) =>
          html`<span
            class="so-bar ${o.hovered === day ? 'is-hover' : ''}"
            style="--bar-delay:${day * 18}ms"
          >
            ${step(value) > 0 ? html`<span class="so-bar__forecast" data-measure="value" style="height:${step(value)}px"></span>` : nothing}
          </span>`,
      )}
    </div>`;
  }

  /**
   * The days' names under their bars ("Sat"), each centred on its bar and kept inside the column: every one where
   * they stand 12 apart, else every second, third … from the first, the day people look for.
   */
  private dayAxis(days: readonly ForecastDay[]): TemplateResult {
    const width = this.contentWidth;
    const slot = width / Math.max(1, days.length);
    const names = days.map((filed) => {
      const text = this.dayLabel(filed.at, { weekday: 'short' });
      return { text, width: this.head.ruler.width('fv-axis', text) };
    });
    const placed = (every: number) =>
      names.flatMap((name, i) => {
        if (i % every) return [];
        const x = Math.min(width - name.width / 2, Math.max(name.width / 2, (i + 0.5) * slot));
        return [{ ...name, x }];
      });
    let every = thinStep(Math.max(0, ...names.map((name) => name.width)), slot);
    while (every < days.length && !labelsApart(placed(every))) every += 1;
    return axis(
      placed(every).map(({ text, x, width: wide }) => [
        x - wide / 2 <= 0 ? 0 : x + wide / 2 >= width ? 1 : x / width,
        text,
      ]),
    );
  }

  /** The day's statistics under the bars: the peak and its hour (unless asked away) and the sun hours. */
  private renderStats(
    peak: { readonly value: string; readonly unit: string },
    peakAt: string,
    sunHours: string | null,
  ): TemplateResult {
    return this.renderRow([
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
    ]);
  }

  /**
   * A row of statistics under the bars, in three columns while every label and figure holds in its third, else fewer,
   * a shorter last row taking the whole row; the figures at the size the widest still fits.
   */
  private renderRow(stats: readonly StatText[]): TemplateResult {
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
    stacks: readonly Stack[],
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
    const series = stacks.map((s) => s.hours);
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
    const room = CHART_HEIGHT - STACK_GAP * (stacks.length - 1);
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
        for (let i = stacks.length - 1; i >= 0; i--) {
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
   * The day in a style, drawn by the engine: an hour a bar across the column (a day a bar, of the days ahead), on a
   * scale from zero (the arrays stacked), the bars to come hollow and now marked where the style marks it, read by
   * the bar under the pointer.
   */
  private renderStyled(
    style: ResolvedStyle,
    series: ChartSeries[],
    o: {
      /** The last bar that has happened; -1: none has (a forecast day); null: a day that is over. */
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
        now: o.now === null ? null : o.now < 0 ? -1 : (o.now + 1) / this.slots,
        cursor: o.hovered === null ? null : (o.hovered + 0.5) / this.slots,
        id: 'pr',
      })}
    </div>`;
  }

  /**
   * Each array's day so far (or, under the pointer, its hour): the Distribution's legend, one unit for all, each
   * array's square in the ink's ramp — or in its series' colour, as a style's columns are (`series`).
   */
  private renderLegend(
    stacks: readonly Stack[],
    hovered: number | null,
    tone: Tone,
    series: boolean,
  ): TemplateResult {
    const figures = stacks.map(({ hours }) =>
      hours ? (hovered !== null ? (hours[hovered] ?? 0) : sum(hours)) : null,
    );
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
    const names = stacks.map((s) => s.name);
    // the energy legend's rule: a name or a figure that does not fit its column folds the row, never cuts it
    const columns = legendColumns(names, w, this.head.ruler, widest, LEGEND_GAP);
    return html`<div
      class="en-legend pr-legend fv-tone--${tone}"
      style=${columns < stacks.length ? `grid-template-columns:repeat(${columns},minmax(0,1fr));grid-auto-flow:row;row-gap:8px` : nothing}
    >
      ${stacks.map((_s, i) => {
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
