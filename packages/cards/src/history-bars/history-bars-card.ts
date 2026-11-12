import { historyBarsHeight } from '../energy-family.js';
import {
  actionRuns,
  dateFormat,
  formatNumber,
  houseZone,
  isUsable,
  plural,
  stateText,
  strings as words,
  type EntityView,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import { head, ico, icon, readout, type IconRef, type Tone } from '@fluvy/ui';
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
  AXIS_GAP,
  barGeometry,
  barPath,
  chartDefaultsFor,
  chartSection,
  chartStyles,
  drawChart,
  gridClass,
  gridLines,
  labelled,
  labelsApart,
  niceTicks,
  styleOf,
  scrub,
  ScrubController,
  thinStep,
  tickLabels,
  UNIT_COLUMN,
  unitLabel,
  type Placed,
  type ResolvedStyle,
} from '../chart/engine/index.js';
import { HeadFit } from '../energy/head.js';
import type { ChartCaps, ChartKeys } from '../shared/chart-config.js';
import { currencySymbol } from '../energy-model/costs.js';
import { PERIODS, type Period } from '../energy-model/period.js';
import { RecordedSensors } from '../energy-model/recorded.js';
import { Card, HEAD_BASE } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import {
  accentField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorLanguage,
  editorWord,
  entityField,
  fieldRow,
  hasLadder,
  iconField,
  nameField,
  numberField,
  numberFields,
  selectField,
  showIconField,
  textField,
  unitChoicesOf,
  type FormLabeler,
} from '../shared/form.js';
import { TextRuler } from '../shared/fit.js';
import { statsColumns, statsSize, type StatText } from '../shared/readouts.js';
import type { EditorDefaults, FormHelper, RowsListSpec } from '../shared/rows-editor.js';
import { TemplateTexts } from '../shared/templates.js';
import { scaleFor, toBase, type Scale } from '../shared/units.js';
import { convert, convertible } from './units.js';
import { Ticker } from '../shared/ticker.js';
import {
  additive,
  barsKey,
  bucketStarts,
  CAPS,
  defaultStat,
  fetchBars,
  kindOf,
  meterCycle,
  questionFor,
  RESETS,
  SOURCES,
  STATS,
  type BarsRecord,
  type BarsRequest,
  type Bucket,
  type Reset,
  type Source,
  type Stat,
} from './buckets.js';
import {
  DEFAULT_FACTS,
  defaultHead,
  FACT_FIELDS,
  FACT_ICONS,
  FACT_KEYS,
  FACTORS,
  factFigure,
  factSchema,
  factsOf,
  KIND_PICKER,
  READOUT_FIELDS,
  READOUT_KEYS,
  readoutSchema,
  summarise,
  type FactContext,
  type FactItem,
  type FactKind,
  type Summary,
} from './facts.js';
import { countedKey, fetchCounted, withLive, type Counted, type Reading } from './live.js';
import { Reads } from './reads.js';
import { typical } from './scale.js';

const strings = words('history-bars');

export type DateStyle = 'date' | 'weekday' | 'short';
export type BarsVariant = 'full' | 'compact' | 'mini';

/**
 * The chart keys (`shared/chart-config.ts`): the bars' style — classic, bars or columns; the mini row's sparkline classic
 * or minimal —, the bars a highlight lights, and motion. The scale, the gridlines and the values are the card's own.
 */
export interface HistoryBarsCardConfig
  extends FluvyCardConfig, Pick<ChartKeys, 'chart' | 'highlight' | 'animate'> {
  /** Under the name; empty, "Last 7 days". */
  subtitle?: string;
  /** How many bars (days, weeks or months by `period`): 1–92, 7 by default. */
  days?: number;
  /** What a bar is: a day (default), a week or a month. */
  period?: Period;
  /**
   * What a bar shows: what the meter gained (`change`, a meter's default), its reading at the end (`state`, the
   * default of a sensor with no state class), the mean (a measurement's), the highest or the lowest reading.
   */
  stat?: Stat;
  /**
   * When the counter starts again from zero: as Home Assistant counts it (`auto`, its sum: the Energy dashboard's
   * numbers, and what an unset reset reads), `never` (a lifetime meter), or every `day`, `week`, `month` or `year` —
   * the bars then come from its readings, so a reset or a restart is never counted twice. The editor names a utility
   * meter's own cycle; it is never chosen for it.
   */
  reset?: Reset;
  /** Where the bars are read from: statistics where they can answer, else the history (`auto`), or the history always. */
  source?: Source;
  /** The bucket in progress (today, this week, this month) as the last bar; off by default, so the bars are finished ones. */
  include_today?: boolean;
  /**
   * A daily forecast sensor (today's, as Solcast and the like carry them): each bar's day is drawn behind it with the
   * highest that sensor read in that day — what was expected — so the bars read against their forecast.
   */
  forecast_entity?: string;
  /** Decimals of the figures, 1 by default. */
  decimals?: number;
  /** The unit the figures read in: energy, power, volume and distance convert; any other is ignored (the sensor's own). */
  unit?: string;
  /** The bars below zero in a colour of their own; the card's by default. */
  negative_color?: string;
  /** The bar in progress in a colour of its own; the card's by default. */
  current_color?: string;
  /** `full` (default): the head, its readouts, the chart and the facts. `compact`: the head, its readouts and the bars with their dates. `mini`: the head and one row of readouts and a sparkline. */
  variant?: BarsVariant;
  show_head?: boolean;
  show_values?: boolean;
  show_axis?: boolean;
  show_grid?: boolean;
  show_dates?: boolean;
  show_facts?: boolean;
  /** How a bar's date reads: "Oct 03", "Fri", or "3". */
  date_format?: DateStyle;
  /** The readouts beside the title, in order; empty, the total and the average (a measurement's average and highest). */
  head?: ReadonlyArray<FactKind | FactItem>;
  /** The facts under the chart, in order; empty, the highest, the lowest and the average. */
  facts?: ReadonlyArray<FactKind | FactItem>;
  /** kg of CO₂ a kWh of grid power costs, 0.4 by default: what the CO₂ and the trees are worked out with. */
  co2_factor?: number;
  /** The price per unit: what the money is worked out with. */
  price?: number;
  /** Test hook, as in the clock cards: an ISO instant the card takes for "now". */
  _now?: string;
}

/* the chart's geometry: the plot, the room above it for the values (or a headroom alone), the dates under it */
const PLOT = 120;
const PLOT_COMPACT = 80;
const VALUES = 20;
const HEADROOM = 4;
const DATES = 24;
/** Between the head's readouts: a 1 px divider with 16 each side. */
const DIVIDER = 33;
/** The strip's padding, the gap between its cells (a divider in the middle of it) and between its rows. */
const STRIP_PAD = 16;
const CELL_GAP = 24;
/** A fact's circle and the gap after it; the glyph alone and its gap, in the one-column fallback. */
const CIRCLE = 44 + 12;
const GLYPH = 20 + 12;
/** The least content width at which the readouts may sit in the head beside the title (narrower, they take their own row). */
const READOUTS_IN_HEAD = 440;
/** The mini row's sparkline: at least this wide, else a readout gives way, then the sparkline itself. */
const SPARK_MIN = 80;
const HOUR = 3_600_000;
const SCALABLE = /^(m|k|M|G)?(Wh|W|VA)$/;
/**
 * A value freed of a float's noise, to twelve significant digits (a double carries sixteen; a sensor's figures use no
 * more than ten): a sum of the recorder's decimals that is 11.05 in truth and 11.049999999999265 in binary rounds as
 * 11.05 does. Every figure the card writes is rounded from this, so one on a rounding half goes the way its decimals
 * say, never the way the noise of the sum behind it happens to lean.
 */
const exact = (value: number): number => Number(value.toPrecision(12));
/** A press that travels further than this is a reading of the chart, not a tap on it. */
const STILL = 8;
/** A press held longer than this is a reading of the chart, not a tap on it. */
const TAP = 500;

/**
 * What the bars are drawn in: classic (1.10's soft gradient), bars (the ink, the highlight's lit and the rest quiet) or
 * columns, rounded as the house's bars are; the mini row's sparkline classic or a minimal line. The scale, the
 * gridlines and the values are the card's own keys.
 */
const BARS_CAPS: ChartCaps = {
  bars: true,
  styles: ['classic', 'bars', 'columns'],
  keys: ['highlight', 'animate'],
};
const MINI_CAPS: ChartCaps = { styles: ['classic', 'minimal'], keys: ['animate'] };
const capsIn = (data: Readonly<Record<string, unknown>>): ChartCaps =>
  data['variant'] === 'mini' ? MINI_CAPS : BARS_CAPS;

/** A fact as the card says it: its words and figure, its circle, what a tap does. */
interface FactCell extends StatText {
  readonly item: FactItem;
  readonly icon: IconRef | string;
  readonly tone: Tone;
  readonly accent: string | undefined;
  readonly entity: string | undefined;
}

/** What Home Assistant has counted of a bucket in progress: the bucket's start, and the count. */
interface CountedBucket {
  readonly start: number;
  readonly counted: Counted;
}

/** A sensor's reads: its bars, and Home Assistant's count of its bucket in progress. */
interface Sensor {
  readonly bars: Reads<BarsRecord | null>;
  readonly counting: Reads<Counted>;
}

/** The sensor a share is of, as the card has it: its bars (undefined while they load, null with none), its count. */
interface ShareBars {
  readonly record?: BarsRecord | null;
  readonly counted?: CountedBucket;
}

/** What the render laid the bars out with, for the pointer's snapping. */
interface Plot {
  readonly inset: number;
  readonly slot: number;
  readonly count: number;
}

let gradients = 0;

/** The words of a fact's own fields; the shared item words name the rest. */
const OWN_LABELS: Readonly<Record<string, MessageKey>> = {
  kind: 'history-bars.editor_kind',
  unit: 'editor.unit',
  decimals: 'editor.decimals',
  factor: 'history-bars.editor_factor',
  of: 'history-bars.editor_of',
  template: 'history-bars.editor_template',
};
const listLabels: FormLabeler = (schema) => {
  const key = OWN_LABELS[schema.name];
  return key ? editorWord(key) : undefined;
};

/** What is said under a fact's factor, and under its template. */
const listHelpers: FormLabeler = (schema) =>
  schema.name === 'factor'
    ? editorWord('history-bars.editor_factor_help')
    : schema.name === 'template'
      ? editorWord('editor.template_helper')
      : undefined;

/** What a bar may show, each by its word: the shared ones, and "The reading at the end" (`option.state` says "State"). */
const STAT_WORDS: Readonly<Record<Stat, MessageKey>> = {
  change: 'option.change',
  state: 'history-bars.stat_state',
  mean: 'option.mean',
  max: 'option.max',
  min: 'option.min',
};
const RESET_WORDS: Readonly<Record<Reset, MessageKey>> = {
  auto: 'history-bars.reset_auto',
  never: 'history-bars.reset_never',
  day: 'history-bars.reset_day',
  week: 'history-bars.reset_week',
  month: 'history-bars.reset_month',
  year: 'history-bars.reset_year',
};
const SOURCE_WORDS: Readonly<Record<Source, MessageKey>> = {
  auto: 'history-bars.source_auto',
  history: 'history-bars.source_history',
};

/** A choice of the card's own, each value by its word in the editor's language. */
const wordsField = <V extends string>(
  name: string,
  values: readonly V[],
  wordOf: Readonly<Record<V, MessageKey>>,
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      mode: 'dropdown',
      options: values.map((value) => ({ value, label: editorWord(wordOf[value]) })),
    },
  },
});

/**
 * What is said under the card's own fields, from the sensor the editor shows: when it resets reads a utility meter's
 * cycle and flags a `total` without `last_reset` (Home Assistant counts its fall below zero); a reading at the end of
 * a counter says when its bars add up; where it is read from and the unit say what they do.
 */
const formHelpers: FormHelper = (schema, _localize, data, hass) => {
  // an item's form (a fact's own unit) is not the card's: it is told nothing of the card
  if (!data) return undefined;
  const id = typeof data['entity'] === 'string' ? data['entity'] : '';
  const attributes = hass?.states?.[id]?.attributes ?? {};
  const language = editorLanguage();
  switch (schema.name) {
    case 'reset': {
      if (attributes['state_class'] === 'total' && !attributes['last_reset'])
        return strings(language, 'reset_help_total');
      const cycle = meterCycle(hass, attributes);
      return cycle
        ? strings(language, 'reset_help_meter', { cycle: editorWord(RESET_WORDS[cycle]) })
        : strings(language, 'editor_reset_help');
    }
    case 'stat': {
      const period = (data['period'] ?? 'day') as Period;
      return data['stat'] === 'state' &&
        kindOf(attributes['state_class'] as string | undefined) === 'counter' &&
        data['reset'] !== period
        ? strings(language, 'stat_help_pair', { cycle: editorWord(RESET_WORDS[period]) })
        : undefined;
    }
    case 'source':
      return strings(language, 'editor_source_help');
    case 'unit':
      return strings(language, 'editor_unit_help');
    default:
      return undefined;
  }
};

/**
 * A sensor's history as bars: its last days, weeks or months from Home Assistant's long-term statistics, each bar
 * with its value above it on a nice scale, the total and the average in the head, and a strip of facts under the
 * chart — the honest numbers of the bars, or what they come to in CO₂, trees, kilometres and money when asked.
 * Every part is the person's: the readouts and the facts are lists composed in order, each with its own name, icon,
 * colour, unit and tap; the values, the scale, the gridlines, the dates and the strip each switch off.
 */
export class FluvyHistoryBarsCard extends Card<HistoryBarsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: HistoryBarsCardConfig): number {
    return historyBarsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    energyStyles,
    chartStyles,
    css`
      /* the readouts: beside the title (right-aligned, a divider between them), or on their own row under the head */
      .hb-readouts {
        display: flex;
        align-items: flex-start;
        flex: 0 0 auto;
        min-width: 0;
      }
      .hb-readouts--head {
        text-align: right;
      }
      .hb-readouts--head .fv-readout__value {
        justify-content: flex-end;
      }
      /* the divider between readouts is drawn, not a box of its own: a hairline down the gap */
      .hb-readouts > .hb-readout + .hb-readout {
        margin-left: 16px;
        padding-left: 16px;
      }
      .hb-readouts > .hb-readout + .hb-readout::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 1px;
        background: var(--fluvy-border);
      }
      /* on their own row the readouts share it in equal columns, each centred in its cell (the readout rows' rule),
         the divider on the cells' edge: after the gap's rule, which it takes back (of the same weight, the later
         wins; a cell that kept the gap would lose 32 of its width) */
      .hb-readouts--row,
      .hb-readouts--first {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        text-align: center;
        height: 44px;
      }
      .hb-readouts--row {
        margin-top: 16px;
      }
      .hb-readouts--row .fv-readout__value,
      .hb-readouts--first .fv-readout__value {
        justify-content: center;
      }
      .hb-readouts--row > .hb-readout + .hb-readout,
      .hb-readouts--first > .hb-readout + .hb-readout {
        margin-left: 0;
        padding-left: 0;
      }
      .hb-readout {
        position: relative;
        min-width: 0;
      }
      .hb-readout .fv-readout__label,
      .hb-readout .fv-readout__value {
        white-space: nowrap;
      }
      .hb-readout--tap {
        cursor: pointer;
        border-radius: var(--fluvy-radius-md);
      }
      .hb-readout--tap:active {
        opacity: 0.7;
      }
      /* the readouts folded into equal columns where even their own row would not hold them in a line */
      .hb-cols {
        display: grid;
        column-gap: 16px;
        margin-top: 16px;
      }
      .hb-cols .fv-readout__label {
        white-space: nowrap;
      }
      .hb-cols--odd > :last-child {
        grid-column: 1 / -1;
      }
      /* the chart: the card's tone is the bars' ink */
      .hb-chart {
        --ink: var(--tone-ink, var(--fluvy-accent));
        position: relative;
        margin-top: 20px;
        touch-action: pan-y;
        outline: none;
      }
      .hb-chart:focus-visible {
        border-radius: var(--fluvy-radius-md);
        box-shadow: 0 0 0 2px var(--fluvy-accent);
      }
      .hb-chart > svg {
        display: block;
        overflow: visible;
      }
      .hb-bar {
        fill: var(--hb-fill);
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: fv-grow-y 560ms var(--fv-ease-out) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + var(--bar-delay, 0ms));
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .hb-bar.is-negative {
        transform-origin: 50% 0;
      }
      /* the bucket in progress is still growing: lighter, edged with a dashed line of its ink */
      .hb-bar.is-current:not(.is-empty) {
        fill-opacity: 0.5;
        stroke: var(--hb-edge, var(--ink));
        stroke-width: 1;
        stroke-dasharray: 3 2;
      }
      .hb-chart--tap,
      .hb-spark--tap {
        cursor: pointer;
      }
      .hb-bar.is-empty {
        fill: var(--ink);
        opacity: 0.25;
        animation: none;
      }
      .hb-chart.is-scrub .hb-bar:not(.is-hover) {
        opacity: 0.4;
      }
      .hb-chart.is-scrub .hb-bar.is-empty:not(.is-hover) {
        opacity: 0.1;
      }
      .hb-date {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text-secondary);
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .hb-value {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text);
        color: var(--fluvy-text);
        font-variant-numeric: tabular-nums;
      }
      .hb-skeleton {
        margin-top: 20px;
      }
      .hb-empty {
        margin-top: 20px;
      }
      /* a chart with nothing above it (no head, no readouts) starts at the card's padding */
      .fv-card > .hb-chart:first-child,
      .fv-card > .hb-skeleton:first-child,
      .fv-card > .hb-empty:first-child {
        margin-top: 0;
      }
      /* the facts strip: a page-filled panel, its cells in equal columns with a divider in the gap between them */
      .hb-facts {
        display: grid;
        column-gap: 24px;
        row-gap: 12px;
        margin-top: 24px;
        padding: 16px;
        border-radius: var(--fluvy-radius-lg);
        background: var(--fluvy-inset, var(--fluvy-page));
      }
      .hb-fact {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        height: 44px;
        border-radius: var(--fluvy-radius-md);
      }
      /* a neutral circle on the page's surface is the card's own disc with a hairline (a wash of the page would
         vanish into it); a coloured fact's circle keeps its tone's wash */
      .hb-fact > .fv-ico--neutral {
        background: var(--fluvy-card);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
      }
      /* the one-column fallback: the glyph alone before the words, where a circle would leave them no room */
      .hb-fact__glyph {
        display: inline-flex;
        flex: 0 0 20px;
        width: 20px;
        height: 20px;
        color: var(--fluvy-text-secondary);
      }
      .hb-fact__glyph svg {
        width: 20px;
        height: 20px;
      }
      .hb-facts--odd > :last-child {
        grid-column: 1 / -1;
      }
      .hb-fact.has-divider::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -12px;
        width: 1px;
        background: var(--fluvy-border);
      }
      .hb-fact--tap {
        cursor: pointer;
      }
      .hb-fact--tap:active {
        opacity: 0.7;
      }
      .hb-fact .fv-readout {
        min-width: 0;
      }
      .hb-fact .fv-readout__label,
      .hb-fact .fv-readout__value {
        white-space: nowrap;
      }
      /* a fact's label is a name (the kind's word, or the person's own): in a column too narrow even without the
         circle it may end in an ellipsis, as names do */
      .hb-fact .fv-readout__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* the mini layout's one row: the readouts and a sparkline that takes the rest */
      .hb-mini {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 48px;
        margin-top: 16px;
      }
      .hb-mini .hb-readouts {
        flex: 0 0 auto;
      }
      .hb-spark {
        --ink: var(--tone-ink, var(--fluvy-accent));
        flex: 1 1 auto;
        min-width: 0;
        height: 48px;
      }
      .hb-spark svg {
        display: block;
      }
      /* a sparkline's bar below zero hangs from the zero line; one in a colour of its own wears it; the one in
         progress is lighter */
      .hb-spark .fv-vbar.is-negative {
        transform-origin: 50% 0;
      }
      .hb-spark .fv-vbar.hb-own {
        fill: var(--fluvy-accent);
      }
      .hb-spark .fv-vbar.is-current {
        fill-opacity: 0.5;
      }
      /* the minimal line's dot stands proud of the row by its radius at the end */
      .hb-spark .fv-curve {
        overflow: visible;
      }
      /* still: the bars stand without growing in */
      .is-still .hb-bar,
      .is-still .fv-vbar {
        animation: none;
      }
      .fv-card.is-off .hb-chart,
      .fv-card.is-off .hb-spark {
        --ink: var(--fluvy-text-disabled);
        --tone-ink: var(--fluvy-text-disabled);
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    record_: { state: true },
    failed_: { state: true },
    counted_: { state: true },
    shares_: { state: true },
  };

  /** undefined while the bars load, null when the recorder knows nothing of the sensor. */
  declare record_: BarsRecord | null | undefined;
  /** The last read of the bars failed: with none to show, the card says it could not read the recorder. */
  declare failed_: boolean;
  /** What Home Assistant has counted of the bucket in progress, for a live bucket as it counts it. */
  declare counted_: CountedBucket | undefined;
  /** The sensors a share is of, by id: their bars (the same; undefined while they load) and their count. */
  declare shares_: Readonly<Record<string, ShareBars>>;

  /** Where the chart is read, on the middle of the bar there (a fraction of its width); null: the whole period. */
  private readonly scrubber = new ScrubController(this, (fraction) => this.barMiddle(fraction));
  /** The card's sensor's reads, and those of each sensor a share is of. */
  private readonly own: Sensor = { bars: new Reads(), counting: new Reads() };
  /** The card's sensor while it is missing from the house: as the recorder describes it. */
  private readonly recorded = new RecordedSensors(this);
  private readonly shareSensors = new Map<string, Sensor>();
  /** The daily forecast sensor's reads, drawn behind the bars (undefined while they load). */
  private readonly forecastSensor: Sensor = { bars: new Reads(), counting: new Reads() };
  declare forecast_: BarsRecord | null | undefined;
  /** The window the bars on screen are of (the sensor and how it is read, not the hour): another one shows the skeleton. */
  private window = '';
  private readonly head = new HeadFit(this);
  private readonly texts = new TemplateTexts(this);
  private readonly ruler: TextRuler;
  private plot: Plot = { inset: 0, slot: 1, count: 0 };
  private readonly gradient = `hb-g${++gradients}`;
  /** Where a press on the chart began and when: a still, short one is a tap (the card's, when it has no head). */
  private press: { x: number; y: number; at: number; moved: boolean } | null = null;

  constructor() {
    super();
    this.record_ = undefined;
    this.failed_ = false;
    this.counted_ = undefined;
    this.shares_ = {};
    this.ruler = this.head.ruler;
    // the card's clock: an hour asked again once compiled, the window rolled at midnight, a failed read retried
    // after a minute — for a quiet sensor too, whose state never changes to ask for it
    new Ticker(this, () => this.due());
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<HistoryBarsCardConfig>()([
    'subtitle',
    'days',
    'period',
    'stat',
    'reset',
    'source',
    'forecast_entity',
    'include_today',
    'decimals',
    'unit',
    'negative_color',
    'current_color',
    'variant',
    'show_head',
    'show_values',
    'show_axis',
    'show_grid',
    'show_dates',
    'show_facts',
    'date_format',
    'head',
    'facts',
    'co2_factor',
    'price',
    'chart',
    'highlight',
    'animate',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'head',
      title: 'history-bars.editor_head',
      idKey: 'kind',
      picker: KIND_PICKER,
      keys: READOUT_KEYS,
      schema: READOUT_FIELDS,
      schemaOf: readoutSchema,
      computeLabel: listLabels,
      computeHelper: listHelpers,
    },
    {
      key: 'facts',
      title: 'history-bars.editor_facts',
      idKey: 'kind',
      picker: KIND_PICKER,
      keys: FACT_KEYS,
      schema: FACT_FIELDS,
      schemaOf: factSchema,
      computeLabel: listLabels,
      computeHelper: listHelpers,
    },
  ];
  /** The card's head is its sensor's name (`title` is the older word for it). */
  static override aliases: AliasSpec = { keys: [{ from: 'title', to: 'name' }] };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = (config, hass) => {
    const entity = typeof config['entity'] === 'string' ? config['entity'] : '';
    const stateClass = hass?.states?.[entity]?.attributes['state_class'];
    const stat = defaultStat(typeof stateClass === 'string' ? stateClass : undefined);
    // the head the card draws: by the stat and the reset it reads with, as given or by default
    const shown = STATS.includes(config['stat'] as Stat) ? (config['stat'] as Stat) : stat;
    const resets = RESETS.includes(config['reset'] as Reset) ? (config['reset'] as Reset) : 'auto';
    const period = PERIODS.includes(config['period'] as Period)
      ? (config['period'] as Period)
      : 'day';
    return {
      variant: 'full',
      period: 'day',
      days: 7,
      stat,
      reset: 'auto',
      source: 'auto',
      include_today: false,
      decimals: '1',
      unit: 'auto',
      date_format: 'date',
      show_head: true,
      show_values: true,
      show_axis: true,
      show_grid: true,
      show_dates: true,
      show_facts: true,
      co2_factor: FACTORS.co2,
      head: defaultHead(shown, additive(shown, resets, period)),
      facts: [...DEFAULT_FACTS],
      ...chartDefaultsFor(config, capsIn(config)),
    };
  };
  /** The units the editor offers are the sensor's class's. */
  static override choices = unitChoicesOf;
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor']),
        fieldRow(nameField(), textField('subtitle')),
        fieldRow(iconField(), selectField('variant', ['full', 'compact', 'mini'])),
        showIconField(),
        ...colourFields(),
        fieldRow(numberField('days', 1, 92), selectField('period', PERIODS)),
        fieldRow(wordsField('stat', STATS, STAT_WORDS), wordsField('reset', RESETS, RESET_WORDS)),
        fieldRow(
          wordsField('source', SOURCES, SOURCE_WORDS),
          selectField('date_format', ['date', 'weekday', 'short']),
        ),
        fieldRow(
          accentField('negative_color', { item: 'card' }),
          accentField('current_color', { item: 'card' }),
        ),
        fieldRow(boolField('include_today'), boolField('show_head')),
        fieldRow(boolField('show_values'), boolField('show_axis')),
        fieldRow(boolField('show_grid'), boolField('show_dates')),
        boolField('show_facts'),
        // the two lists are edited item by item (the rows editor takes these fields out of the form)
        { name: 'head', selector: { object: {} } },
        { name: 'facts', selector: { object: {} } },
        fieldRow(numberField('co2_factor', 0, 2, 0.01), numberField('price', 0, 100, 0.001)),
        // the bars' style, or the mini row's sparkline's
        chartSection([BARS_CAPS, MINI_CAPS], capsIn),
        // the figures' unit and decimals: one decimal by default, so a column of bars reads evenly
        numberFields({ when: hasLadder, decimals: ['0', '1', '2', '3'] }),
        actionFields(),
      ],
      ...editorLabels(
        strings,
        {
          head: 'editor_head',
          facts: 'editor_facts',
          days: 'editor_days',
          period: 'editor_period',
          stat: 'editor_stat',
          reset: 'editor_reset',
          source: 'editor_source',
          negative_color: 'editor_negative_color',
          current_color: 'editor_current_color',
          include_today: 'editor_include_today',
          show_head: 'editor_show_head',
          show_values: 'editor_show_values',
          show_axis: 'editor_show_axis',
          show_grid: 'editor_show_grid',
          show_dates: 'editor_show_dates',
          show_facts: 'editor_show_facts',
          date_format: 'editor_date_format',
          co2_factor: 'editor_co2_factor',
          price: 'editor_price',
        },
        {},
      ),
      computeHelper: formHelpers,
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): HistoryBarsCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    return {
      type: 'custom:fluvy-history-bars-card',
      entity:
        sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'energy') ??
        sensors[0] ??
        '',
    };
  }

  protected override prepare(config: HistoryBarsCardConfig): HistoryBarsCardConfig {
    if (!config.entity) throw new Error('fluvy-history-bars-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil(FluvyHistoryBarsCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'full'
      ? { columns: 12, rows: 'auto', min_columns: 6 }
      : { columns: 6, rows: 'auto', min_columns: 6 };
  }

  /* ---------- what the config says ---------- */

  private get variant(): BarsVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'mini' ? v : 'full';
  }

  /** The chart's style: the card's own, else the house's — of those its variant draws, else classic. */
  private get chartStyle(): ResolvedStyle {
    return styleOf(this.config, this.variant === 'mini' ? MINI_CAPS : BARS_CAPS);
  }
  private get period(): Period {
    const p = this.config?.period;
    return p === 'week' || p === 'month' ? p : 'day';
  }
  private get count(): number {
    const asked = Number(this.config?.days ?? 7);
    return Math.max(1, Math.min(CAPS[this.period], Number.isFinite(asked) ? Math.round(asked) : 7));
  }
  private statOf(view: EntityView): Stat {
    const s = this.config?.stat;
    return s && STATS.includes(s) ? s : defaultStat(view.attr<string>('state_class'));
  }
  /** When the sensor's counter starts again: as configured, else as Home Assistant counts it. */
  private resetOf(): Reset {
    const r = this.config?.reset;
    return r && RESETS.includes(r) ? r : 'auto';
  }
  /** Whether the sensor's bars add up (a total, money and the equivalents mean something). */
  private additiveOf(view: EntityView): boolean {
    return additive(this.statOf(view), this.resetOf(), this.period);
  }
  private get decimals(): number {
    const d = Number(this.config?.decimals ?? 1);
    return Number.isFinite(d) ? Math.max(0, Math.min(3, Math.round(d))) : 1;
  }
  private get dateStyle(): DateStyle {
    const s = this.config?.date_format;
    return s === 'weekday' || s === 'short' ? s : 'date';
  }
  private shows(
    key: 'show_head' | 'show_values' | 'show_axis' | 'show_grid' | 'show_dates' | 'show_facts',
  ): boolean {
    return this.config?.[key] !== false;
  }
  private headItems(view: EntityView): FactItem[] {
    const own = this.config?.head;
    return own === undefined
      ? defaultHead(this.statOf(view), this.additiveOf(view)).map((kind) => ({ kind }))
      : factsOf(own);
  }
  private factItems(): FactItem[] {
    const own = this.config?.facts;
    return own === undefined ? DEFAULT_FACTS.map((kind) => ({ kind })) : factsOf(own);
  }
  /** The sensors a share is of. */
  private shareIds(view: EntityView): string[] {
    return [
      ...new Set(
        [...this.headItems(view), ...this.factItems()]
          .filter((item) => item.kind === 'share' && typeof item.of === 'string' && item.of)
          .map((item) => item.of as string),
      ),
    ];
  }

  protected override watched(): readonly string[] {
    const view = this.entity();
    return [view.id, ...this.shareIds(view)].filter(Boolean);
  }

  private now(): Date {
    const frozen = this.config?._now;
    if (frozen) {
      const date = new Date(frozen);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  /* ---------- the recorder ---------- */

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadBars();
  }

  /**
   * The card's sensor as it is read: one no longer in the house as the recorder describes it (its unit, its state
   * class), so its bars are asked and drawn as they were.
   */
  protected override entity(id: string | undefined = this.config?.entity): EntityView {
    const view = super.entity(id);
    return id === this.config?.entity ? this.recorded.view(view) : view;
  }

  /**
   * The unit the figures read in: the card's own where the sensor's converts to it (energy, power, volume, distance),
   * else the sensor's — a unit that cannot be reached is ignored rather than written on figures it does not measure.
   */
  private unitOf(view: EntityView): string {
    const own = this.config?.unit;
    return own && convertible(view.unit, own) ? own : view.unit;
  }

  /** The bucket in progress counts: drawn, or a readout or a fact says it. */
  private readsCurrent(view: EntityView): boolean {
    return (
      Boolean(this.config?.include_today) ||
      [...this.headItems(view), ...this.factItems()].some((item) => item.kind === 'today')
    );
  }

  /** How a sensor's bars are asked: by what it is, the card's stat and window, its counter's reset and the unit. */
  private requestOf(view: EntityView, reset: Reset, now: Date, unit: string): BarsRequest {
    return {
      id: view.id,
      period: this.period,
      count: this.count,
      stat: this.statOf(this.entity()),
      reset,
      source: this.config?.source === 'history' ? 'history' : 'auto',
      kind: kindOf(view.attr<string>('state_class')),
      unit,
      own: view.unit,
      now,
    };
  }

  /**
   * The reads the card makes now, each with its key: its sensor's bars, what Home Assistant has counted of the bucket
   * in progress where the bars are its count and that bucket is read live, and the bars of each sensor a share is of
   * (each by its own reset, the bucket in progress counted where it is drawn).
   */
  private reads(): Array<{ readonly due: () => boolean; readonly run: () => void }> {
    const hass = this.hass;
    const view = this.entity();
    // a sensor out of reach, even one no longer there, keeps what the recorder holds of it
    if (!hass || !this.recorded.ready(view)) return [];
    const now = this.now();
    const live = !this.config?._now;
    const out: Array<{ due: () => boolean; run: () => void }> = [];
    const sensor = (
      of: EntityView,
      [reset, unit]: readonly [Reset, string],
      memory: Sensor,
      counts: boolean,
      onBars: (record: BarsRecord | null) => void,
      onCounted: (counted: CountedBucket) => void,
      onFail: () => void = () => undefined,
    ): void => {
      const request = this.requestOf(of, reset, now, unit);
      const key = barsKey(hass, request);
      out.push({
        due: () => memory.bars.due(key),
        run: () => memory.bars.ask(key, () => fetchBars(hass, request), onBars, onFail),
      });
      const plan = questionFor(request.kind, request.stat, reset, request.period, request.source);
      if (!counts || !live || plan.from !== 'rows' || plan.stat !== 'change') return;
      const start = bucketStarts(hass, now, request.period, 0).current;
      const withReset = of.attr('last_reset') !== undefined;
      const counted = countedKey(request.id, request.unit, start, now);
      out.push({
        due: () => memory.counting.due(counted),
        run: () =>
          memory.counting.ask(
            counted,
            () => fetchCounted(hass, request.id, request.unit, start, now, withReset),
            (answer) => onCounted({ start, counted: answer }),
          ),
      });
    };
    sensor(
      view,
      [this.resetOf(), this.unitOf(view)],
      this.own,
      this.readsCurrent(view),
      (record) => {
        this.record_ = record;
        this.failed_ = false;
      },
      (counted) => (this.counted_ = counted),
      () => (this.failed_ = true),
    );
    const drawn = Boolean(this.config?.include_today);
    for (const id of this.shareIds(view)) {
      const of = this.entity(id);
      if (of.status === 'missing') continue;
      let memory = this.shareSensors.get(id);
      if (!memory)
        this.shareSensors.set(id, (memory = { bars: new Reads(), counting: new Reads() }));
      sensor(
        of,
        ['auto', this.shareUnit(of)],
        memory,
        drawn,
        (record) => (this.shares_ = { ...this.shares_, [id]: { ...this.shares_[id], record } }),
        (counted) => (this.shares_ = { ...this.shares_, [id]: { ...this.shares_[id], counted } }),
      );
    }
    // each day's forecast behind its bar: the highest the named sensor read in that day
    const forecastId = this.config?.forecast_entity;
    if (forecastId) {
      const of = this.entity(forecastId);
      if (of.status !== 'missing' && this.recorded.ready(of)) {
        const request: BarsRequest = {
          ...this.requestOf(of, 'auto', now, this.unitOf(view)),
          id: of.id,
          stat: 'max',
          // the history, not statistics: a total sensor's statistics keep the day's last reading, not its highest,
          // and a forecast's highest reading of a day is the day's forecast
          source: 'history',
        };
        const key = barsKey(hass, request);
        out.push({
          due: () => this.forecastSensor.bars.due(key),
          run: () =>
            this.forecastSensor.bars.ask(
              key,
              () => fetchBars(hass, request),
              (record) => {
                this.forecast_ = record;
              },
              () => {
                this.forecast_ = null;
              },
            ),
        });
      }
    }
    return out;
  }

  /** Whether the card must ask again: an hour compiled, the window rolled, five minutes counted, a failed read's minute up. */
  private due(): boolean {
    return this.reads().some((read) => read.due());
  }

  /**
   * Once per sensor, window and hour (asked again a minute after the hour turns, and when the window rolls at
   * midnight); the bars on screen stay until the new ones arrive, unless the window itself changed.
   */
  private loadBars(): void {
    const view = this.entity();
    if (!this.hass || !this.recorded.ready(view)) return;
    const request = this.requestOf(view, this.resetOf(), this.now(), this.unitOf(view));
    const window = `${view.id}|${this.period}|${this.count}|${request.stat}|${request.reset}|${request.source}|${request.unit}`;
    if (window !== this.window) {
      if (this.window) {
        this.record_ = undefined;
        this.counted_ = undefined;
        this.failed_ = false;
      }
      this.window = window;
    }
    for (const read of this.reads()) read.run();
  }

  /* ---------- words and figures ---------- */

  /**
   * A figure as the locale writes it, to its decimals, rounded from the value freed of a float's noise (`exact`):
   * today's count carried on to the reading now is a sum, and a sum of 10.45 that reads 10.5 must read 11.1 once the
   * sensor is 0.6 on, not 11.0 for the 1e-12 the binary sum fell short of 11.05 by.
   */
  private figure(value: number | null, decimals = this.decimals): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return formatNumber(this.hass, exact(value), { digits: decimals, minDigits: decimals }).replace(
      /^-/,
      '−',
    );
  }

  /** The bucket's date as a bar says it: "Oct 03", "Fri" or "3"; a month "Oct". */
  private dateLabel(start: number, style: DateStyle = this.dateStyle): string {
    const period = this.period;
    const opts: Intl.DateTimeFormatOptions =
      period === 'month'
        ? style === 'short'
          ? { month: 'narrow' }
          : { month: 'short' }
        : style === 'weekday' && period === 'day'
          ? { weekday: 'short' }
          : style === 'short'
            ? { day: 'numeric' }
            : { day: '2-digit', month: 'short' };
    const zone = houseZone(this.hass);
    if (zone) opts.timeZone = zone;
    // the middle of the bucket's first day: the same date whatever a clock change did to the midnight
    return dateFormat(this.hass?.language ?? 'en', opts).format(new Date(start + 12 * HOUR));
  }

  /** The default sub: "Last 7 days", "Last week", and "· Today" when the bucket in progress is drawn. */
  private periodLine(): string {
    const n = this.count;
    const line = plural(this.hass, `history-bars.last_${this.period}s`, n, { count: n });
    return this.config?.include_today ? `${line} · ${this.currentWord()}` : line;
  }

  /** "Today", "This week", "This month". */
  private currentWord(): string {
    const period = this.period;
    return period === 'day'
      ? this.t('common.today')
      : strings(this.hass, period === 'week' ? 'this_week' : 'this_month');
  }

  /** A fact's label: its own name, else its kind's word. */
  private factLabel(item: FactItem, shareName: string): string {
    if (item.name) return item.name;
    switch (item.kind) {
      case 'total':
        return strings(this.hass, 'kind_total');
      case 'average':
        return strings(
          this.hass,
          this.period === 'day' ? 'avg_day' : this.period === 'week' ? 'avg_week' : 'avg_month',
        );
      case 'highest':
        return strings(this.hass, 'kind_highest');
      case 'lowest':
        return strings(this.hass, 'kind_lowest');
      case 'today':
        return this.currentWord();
      case 'co2':
        return strings(this.hass, 'kind_co2');
      case 'trees':
      case 'km':
        return strings(this.hass, 'equivalent');
      case 'share':
        return strings(this.hass, 'share_of', { name: shareName });
      case 'money':
        return strings(this.hass, 'money_est');
      case 'template':
        return '';
    }
  }

  /**
   * The total of the sensor a share is of, summed as the card's own (its bucket in progress live where it is drawn;
   * none where its bars do not add up), in the card's unit: null when it cannot be read, undefined while it loads.
   */
  private shareTotal(item: FactItem, drawn: boolean, scale: Scale): number | null | undefined {
    if (!item.of) return null;
    const share = this.shares_[item.of];
    if (share?.record === undefined) return undefined;
    if (share.record === null) return null;
    const of = this.entity(item.of);
    const record = share.record;
    const current = this.liveCurrent(record, of, share.counted, this.shareUnit(of));
    const total = summarise(
      record.buckets.map((b) => b.value),
      current,
      {
        drawn,
        additive: additive(this.statOf(this.entity()), 'auto', this.period),
      },
    ).total;
    return total === null ? null : this.scaled(total, scale);
  }

  /** The unit a share's sensor is asked in: the card's sensor's, where its own converts to it. */
  private shareUnit(of: EntityView): string {
    const unit = this.unitOf(this.entity());
    return convertible(of.unit, unit) ? unit : of.unit;
  }

  /**
   * The bucket in progress as it is now: as compiled, carried on to the sensor's reading now — from Home Assistant's
   * count of it (as it counts it) or from the last compiled reading.
   */
  private liveCurrent(
    record: BarsRecord,
    view: EntityView,
    counted: CountedBucket | undefined,
    unit: string,
  ): number | null {
    return withLive(
      record.current,
      record.live,
      this.readingOf(view, unit),
      this.now().getTime(),
      counted && counted.start === record.current.start
        ? { counted: counted.counted, stateClass: view.attr<string>('state_class') }
        : undefined,
    );
  }

  /**
   * The sensor's reading now, in the unit its bars are in: none under a test's frozen clock (it has no now to read),
   * nor for a sensor whose state is not a number — the compiled value stays.
   */
  private readingOf(view: EntityView, unit: string): Reading | null {
    if (this.config?._now || view.number === null || !isUsable(view)) return null;
    const lastReset = Date.parse(String(view.attr('last_reset') ?? ''));
    return {
      value: convert(view.number, view.unit, unit),
      lastReset: Number.isFinite(lastReset) ? lastReset : null,
    };
  }

  /** A raw statistic in the shown unit (a Wh series read in kWh). */
  private scaled(raw: number, scale: Scale): number {
    return raw / scale.divisor;
  }

  /** A fact as text: its label, its figure in its unit, its circle and its tap. */
  private factText(
    item: FactItem,
    summary: Summary,
    context: Omit<FactContext, 'shareOf'>,
    scale: Scale,
    drawn: boolean,
  ): FactCell {
    const of = item.kind === 'share' && item.of ? this.entity(item.of) : null;
    const figure = factFigure(item, summary, {
      ...context,
      shareOf: item.kind === 'share' ? this.shareTotal(item, drawn, scale) : null,
    });
    const text =
      item.kind === 'template'
        ? this.texts.resolve(item.template ?? '', this.config?.entity)
        : this.figure(figure.value, figure.decimals);
    const value = text === '—' || text === '' ? '—' : text;
    return {
      item,
      label: this.factLabel(item, of?.name ?? ''),
      value,
      unit: value === '—' ? '' : figure.unit,
      icon: item.icon ?? FACT_ICONS[item.kind],
      tone: toneOf({ color: item.color }, 'neutral'),
      accent: this.accents.item(item.color),
      entity: of?.id ?? this.config?.entity,
    };
  }

  /* ---------- the render ---------- */

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    // out of reach, the card is the live one in the off skin (the owner's rule, 1.9): its head opens its line with the
    // state, its bars are the recorder's and stay
    const unusable = !isUsable(view) && !this.recorded.imported(view);
    const tone: Tone = unusable ? 'off' : toneOf(this.config, 'accent');
    const variant = this.variant;
    const width = this.contentWidth;
    const record = this.record_;
    const failed = record === undefined && this.failed_;
    const loading = record === undefined && !failed;
    const drawn = Boolean(this.config?.include_today);

    // the bucket in progress, live; the buckets drawn in the unit shown (a Wh series reads in kWh when its figures
    // ask for it), the one in progress last where it is drawn
    const asked = this.unitOf(view);
    const live = record ? this.liveCurrent(record, view, this.counted_, asked) : null;
    const buckets: readonly Bucket[] = record
      ? [...record.buckets, ...(drawn ? [{ ...record.current, value: live }] : [])]
      : [];
    const scale = this.scaleOf(buckets, record?.buckets.length ?? 0, asked);
    const values = buckets.map((b) => (b.value === null ? null : this.scaled(b.value, scale)));
    const forecast = this.forecastValues(buckets, scale);
    const current = live === null ? null : this.scaled(live, scale);
    const summary = summarise(values.slice(0, record?.buckets.length ?? 0), current, {
      drawn,
      additive: this.additiveOf(view),
    });
    const unit = scale.unit;
    const running = drawn && buckets.length ? buckets.length - 1 : null;

    const context: Omit<FactContext, 'shareOf'> = {
      unit,
      decimals: this.decimals,
      kwh: this.kwhOf(summary.total, scale),
      price: typeof this.config?.price === 'number' ? this.config.price : undefined,
      co2Factor: typeof this.config?.co2_factor === 'number' ? this.config.co2_factor : FACTORS.co2,
      currency: currencySymbol(this.hass),
      trees: strings(this.hass, 'unit_trees'),
    };
    const readouts = this.headItems(view).map((item) =>
      this.factText(item, summary, context, scale, drawn),
    );
    const facts =
      variant === 'full' && this.shows('show_facts')
        ? this.factItems().map((item) => this.factText(item, summary, context, scale, drawn))
        : [];

    // the readout under the pointer: the bar's day (the one in progress by its word, "Today") and its value, in
    // place of the row
    const read = this.scrubber.value;
    const hovered = record && buckets.length && read !== null ? this.barAt(read) : null;
    const hoveredBucket = hovered === null ? undefined : buckets[hovered];
    const hoveredValue = hovered === null ? null : (values[hovered] ?? null);
    const shownReadouts: StatText[] = hoveredBucket
      ? [
          {
            label: this.barLabel(hoveredBucket, hovered === running),
            value: this.figure(hoveredValue),
            unit: hoveredValue === null ? '' : unit,
          },
        ]
      : readouts;

    // a sensor that cannot be read now opens its line with the state (the history stays): the first segment never
    // gives way, where a badge in a narrow head would
    const period = this.config?.subtitle ?? this.periodLine();
    const sub = unusable ? `${stateText(this.hass, view)} · ${period}` : period;
    const showHead = this.shows('show_head');
    // the readouts sit beside the title only on a wide card where nothing of the head gives way for them
    const tryHead =
      showHead && variant !== 'mini' && readouts.length > 0 && width >= READOUTS_IN_HEAD;
    // "Last 7 days" is "7 days" where half a section cannot hold it (nl "Afgelopen 7 dagen"); a missing sensor's
    // "Entity not found" is "Not found" (ja エンティティが見つかりません → 見つかりません)
    const shorter =
      sub === this.periodLine() && this.period === 'day' && this.count > 1
        ? [plural(this.hass, 'page.days', this.count)]
        : unusable && view.status === 'missing'
          ? [`${this.t('state.not_found')} · ${period}`]
          : [];
    let fitted = this.head.fit({
      width,
      title: name,
      sub,
      shorter,
      ...(tryHead ? { trailing: this.readoutsWidth(readouts) } : {}),
    });
    const inHead = tryHead && fitted.icon && fitted.sub === sub;
    if (tryHead && !inHead) fitted = this.head.fit({ width, title: name, sub, shorter });

    const chart =
      variant === 'mini'
        ? nothing
        : loading
          ? html`<div
              class="fv-skeleton hb-skeleton"
              style="height:${this.chartHeight(variant)}px"
            ></div>`
          : record === null || record === undefined
            ? html`<div class="hb-empty">${this.renderNone(view, failed, width)}</div>`
            : this.renderChart(buckets, values, forecast, unit, tone, unusable, { hovered, running }, name);

    return html`<article class="fv-card ${unusable ? 'is-unavailable is-off' : ''}" data-card>
      ${
        showHead
          ? head({
              icon: fitted.icon ? (this.config?.icon ?? 'chart') : null,
              small: fitted.small,
              tone,
              title: name,
              sub: fitted.sub,
              trailing: inHead
                ? this.renderReadouts(shownReadouts, readouts, 'head')
                : fitted.badge,
              cut: fitted.cut,
              ...this.headActions(this.actsOn(view)),
              name: true,
            })
          : nothing
      }
      ${
        variant === 'mini'
          ? this.renderMini(shownReadouts, readouts, values, running, tone, loading, !record)
          : inHead || !readouts.length
            ? nothing
            : this.renderReadouts(shownReadouts, readouts, showHead ? 'row' : 'first')
      }
      ${chart} ${facts.length && record ? this.renderFacts(facts) : nothing}
    </article>`;
  }

  /**
   * The chart's place when there are no bars: the recorder could not be read (asked again in a minute), or it knows
   * nothing yet of the sensor — no statistics, or, read from the history, none recorded.
   */
  private renderNone(view: EntityView, failed: boolean, width: number): TemplateResult {
    const plan = questionFor(
      kindOf(view.attr<string>('state_class')),
      this.statOf(view),
      this.resetOf(),
      this.period,
      this.config?.source === 'history' ? 'history' : 'auto',
    );
    const [title, hint] = failed
      ? (['read_failed', 'read_failed_hint'] as const)
      : plan.from === 'history'
        ? (['no_history', 'no_history_hint'] as const)
        : (['no_stats', 'no_stats_hint'] as const);
    return this.head.empty('chart', strings(this.hass, title), strings(this.hass, hint), width);
  }

  /** A bar's name as the scrub reads it: its date ("Oct 03"), the one in progress by its word ("Today"). */
  private barLabel(bucket: Bucket, running: boolean): string {
    return running ? this.currentWord() : this.dateLabel(bucket.start, 'date');
  }

  /**
   * The unit the figures read in: the recorder's answer as asked, or a scalable unit brought up to the size a typical
   * bar asks for (a Wh meter's days read in kWh): the finished bars' (the one in progress where none has anything),
   * so one spike — Home Assistant counting a meter's whole reading again after a restart — reads in the days' unit
   * ("18,280.2 kWh") and never writes them "0.0 MWh". Never down: a kWh meter's small days stay in kWh.
   */
  private scaleOf(buckets: readonly Bucket[], finished: number, asked: string): Scale {
    if (this.config?.unit === asked || !SCALABLE.test(asked)) return { unit: asked, divisor: 1 };
    const base = toBase(1, asked);
    const values = buckets.map((b) => b.value);
    const scale = scaleFor(
      (typical(values.slice(0, finished)) || typical(values)) * base.value,
      base.unit,
    );
    // the recorder answered in the asked unit: the divisor brings that unit to the one chosen
    const divisor = scale.divisor / base.value;
    return divisor > 1 ? { unit: scale.unit, divisor } : { unit: asked, divisor: 1 };
  }

  /** The bars' days as the forecast sensor had them, in the unit shown; null when it has nothing. */
  private forecastValues(
    buckets: readonly Bucket[],
    scale: Scale,
  ): ReadonlyArray<number | null> | null {
    const record = this.forecast_;
    if (!record || !record.buckets.length) return null;
    const byStart = new Map(record.buckets.map((bucket) => [bucket.start, bucket.value] as const));
    return buckets.map((bucket) => {
      const value = byStart.get(bucket.start);
      return value === undefined || value === null ? null : this.scaled(value, scale);
    });
  }

  /** The total in kWh when the figures are energy, for the equivalents; null otherwise. */
  private kwhOf(total: number | null, scale: Scale): number | null {
    if (total === null) return null;
    const base = toBase(total, scale.unit);
    return base.unit === 'Wh' ? base.value / 1000 : null;
  }

  private chartHeight(variant: BarsVariant): number {
    return (
      (variant === 'compact' ? PLOT_COMPACT : PLOT) +
      (variant === 'full' && this.shows('show_values') ? VALUES : HEADROOM) +
      (this.shows('show_dates') ? DATES : 0)
    );
  }

  /** The room a row of readouts takes beside the title: each at its widest line, a divider between them. */
  /** The widest of the readouts: what an equal cell must hold. */
  private readoutsWidest(items: readonly StatText[]): number {
    return Math.max(
      0,
      ...items.map((item) =>
        Math.max(
          this.ruler.width('fv-readout__label', item.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            item.value,
            'fv-unit',
            item.unit ?? '',
          ),
        ),
      ),
    );
  }

  private readoutsWidth(items: readonly StatText[]): number {
    return items.reduce(
      (sum, item, i) =>
        sum +
        Math.max(
          this.ruler.width('fv-readout__label', item.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            item.value,
            'fv-unit',
            item.unit ?? '',
          ),
        ) +
        (i ? DIVIDER : 0),
      0,
    );
  }

  /**
   * The readouts: beside the title (`head`), on their own row under it (`row`), or first on the card when the head
   * is off (`first`) — in one line with dividers while it holds them, else folded into equal columns.
   */
  private renderReadouts(
    shown: readonly StatText[],
    resting: readonly FactCell[],
    place: 'head' | 'row' | 'first',
  ): TemplateResult {
    const width = this.contentWidth;
    // beside the title the readouts take their natural widths; on their own row they share it in equal columns, so
    // the line holds only while the widest fits a cell
    const line =
      place === 'head' ||
      this.readoutsWidest(resting) * resting.length + DIVIDER * (resting.length - 1) <= width;
    const columns = line ? resting.length : statsColumns(this.ruler, width, resting);
    // folded into columns, the readouts take the size the widest figure fits at (the sensor card's rule)
    const size = line ? 's' : statsSize(this.ruler, width, resting, columns);
    const cells = shown.map((text, i) => {
      const item = resting[i]?.item;
      const tap = item?.tap_action
        ? (): void => this.tap(resting[i]?.entity, item.tap_action)
        : null;
      const key = (event: KeyboardEvent): void => {
        if (tap && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          tap();
        }
      };
      return html`<div
        class="hb-readout ${tap ? 'hb-readout--tap' : ''}"
        role=${tap ? 'button' : nothing}
        tabindex=${tap ? '0' : nothing}
        data-target=${tap ? '' : nothing}
        @click=${tap ?? nothing}
        @keydown=${tap ? key : nothing}
      >
        ${readout({ label: text.label, value: text.value, unit: text.unit ?? '', size })}
      </div>`;
    });
    if (line)
      return html`<div
        class="hb-readouts ${place === 'head' ? 'hb-readouts--head' : place === 'row' ? 'hb-readouts--row' : 'hb-readouts--first'}"
      >
        ${cells}
      </div>`;
    return html`<div
      class="hb-cols fv-cols ${resting.length % columns ? 'hb-cols--odd' : ''}"
      style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))${place === 'first' ? ';margin-top:0' : ''}"
    >
      ${cells}
    </div>`;
  }

  /** The mini row: the readouts that fit beside a sparkline of the bars, the sparkline alone giving way last. */
  private renderMini(
    shown: readonly StatText[],
    resting: readonly FactCell[],
    values: ReadonlyArray<number | null>,
    running: number | null,
    tone: Tone,
    loading: boolean,
    none: boolean,
  ): TemplateResult {
    const width = this.contentWidth;
    let kept = resting.length;
    while (kept > 1 && this.readoutsWidth(resting.slice(0, kept)) + 12 + SPARK_MIN > width)
      kept -= 1;
    const sparkWidth = width - (kept ? this.readoutsWidth(resting.slice(0, kept)) + 12 : 0);
    const spark = sparkWidth >= SPARK_MIN && !none;
    // without a head the sparkline is the card's button
    const tap = this.chartIsButton ? this.chartTap : null;
    return html`<div class="hb-mini">
      ${kept ? this.renderReadouts(shown.slice(0, shown.length === 1 ? 1 : kept), resting.slice(0, kept), 'head') : nothing}
      ${
        spark
          ? loading
            ? html`<div class="fv-skeleton hb-spark"></div>`
            : html`<div
                class="hb-spark fv-tone--${tone} ${tap ? 'hb-spark--tap' : ''} ${this.chartStyle.animate ? '' : 'is-still'}"
                @click=${tap ?? nothing}
              >
                ${this.renderSpark(values, running, Math.floor(sparkWidth / 4) * 4)}
              </div>`
          : nothing
      }
    </div>`;
  }

  /**
   * The mini row's sparkline: a bar per bucket on a zero line that sits where the values put it — the bars below
   * zero hang from it in their own colour rather than being cut to nothing — the one in progress lighter.
   */
  private renderSpark(
    values: ReadonlyArray<number | null>,
    running: number | null,
    width: number,
  ): TemplateResult {
    const h = 48;
    const style = this.chartStyle;
    // minimal: a thin line through the bars' values ending in its dot, a gap where one is missing
    if (style.preset === 'minimal')
      return drawChart({
        frame: { width, height: h, headroom: 4, pad: 4 },
        series: [{ values }],
        style,
        id: `${this.gradient}-spark`,
      });
    const gap = 4;
    const count = Math.max(1, values.length);
    const bar = Math.max(2, Math.floor((width - gap * (count - 1)) / count));
    const x0 = Math.floor((width - (bar * count + gap * (count - 1))) / 2);
    const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
    const above = Math.max(0, ...known);
    const below = Math.max(0, ...known.map((v) => -v));
    const span = Math.max(0.0001, above + below);
    const zero = Math.round((above / span) * h);
    const negative = this.accents.item(this.config?.negative_color);
    const current = this.accents.item(this.config?.current_color);
    return html`<svg width=${width} height=${h} viewBox="0 0 ${width} ${h}" aria-hidden="true">
      ${values.map((v, i) => {
        const tall = v === null || v === 0 ? 2 : Math.max(4, Math.round((Math.abs(v) / span) * h));
        const down = v !== null && v < 0;
        const own = i === running ? current : down ? negative : undefined;
        return svg`<rect class="fv-vbar fv-vbar--on ${down ? 'is-negative' : ''} ${i === running ? 'is-current' : ''} ${own ? 'hb-own' : ''}" data-accent=${own ?? nothing} x=${x0 + i * (bar + gap)} y=${down ? zero : Math.max(0, zero - tall)} width=${bar} height=${tall} rx=${Math.min(3, bar / 2)} style="animation-delay:${i * 18}ms"></rect>`;
      })}
    </svg>`;
  }

  /** The bar a pointer at `fraction` of the chart's width is over (the scale's column counts as the first bar's). */
  private barAt(fraction: number): number {
    const { inset, slot, count } = this.plot;
    if (!count) return 0;
    const x = fraction * this.contentWidth - inset;
    return Math.max(0, Math.min(count - 1, Math.floor(x / slot)));
  }

  /** The middle of the bar at `fraction` of the chart's width, as a fraction of it: where a reading snaps to. */
  private barMiddle(fraction: number): number {
    const { inset, slot, count } = this.plot;
    const width = this.contentWidth;
    return count && width > 0 ? (inset + (this.barAt(fraction) + 0.5) * slot) / width : fraction;
  }

  /** A press on the chart begins: where and when, for telling a tap from a reading. */
  private readonly onPress = (event: PointerEvent): void => {
    this.press = { x: event.clientX, y: event.clientY, at: event.timeStamp, moved: false };
  };

  private readonly onPressMove = (event: PointerEvent): void => {
    const press = this.press;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > STILL)
      press.moved = true;
  };

  /** What the card's taps act on: an imported statistic has no entity for more-info to open. */
  private actsOn(view: EntityView): string {
    return this.recorded.imported(view) ? '' : view.id;
  }

  /** Without a head the chart is the card's button, where its tap has something to do. */
  private get chartIsButton(): boolean {
    return (
      !this.shows('show_head') && actionRuns(this.config?.tap_action, this.actsOn(this.entity()))
    );
  }

  /**
   * A tap on the chart of a card without a head runs the card's `tap_action`: a still and short press only — one that
   * travelled or was held was a reading of the bars.
   */
  private readonly chartTap = (event: MouseEvent): void => {
    const press = this.press;
    this.press = null;
    if (press && (press.moved || event.timeStamp - press.at > TAP)) return;
    this.tap();
  };

  /**
   * The keys that read the chart without a pointer, the engine's (← → a bar, Shift five, Home and End its ends,
   * Escape lets go); Enter and Space tap a chart that is the card's button (no head).
   */
  private readonly onKey = (event: KeyboardEvent): void => {
    if ((event.key === 'Enter' || event.key === ' ') && this.chartIsButton) {
      event.preventDefault();
      this.tap();
    } else if (this.plot.count) this.scrubber.key(event, this.plot.slot / this.contentWidth);
  };

  /**
   * The chart: the bars in the card's ink with a soft gradient (those below zero and the one in progress in colours
   * of their own where asked; the one in progress lighter, edged with a dashed line), their values above them (all or
   * none), a nice scale with its unit rotated beside it and dashed gridlines across, the dates under them thinned to
   * what the row holds.
   */
  private renderChart(
    buckets: readonly Bucket[],
    values: ReadonlyArray<number | null>,
    forecast: ReadonlyArray<number | null> | null,
    unit: string,
    tone: Tone,
    unusable: boolean,
    { hovered, running }: { readonly hovered: number | null; readonly running: number | null },
    name: string,
  ): TemplateResult {
    const width = this.contentWidth;
    const full = this.variant === 'full';
    const showValues = full && this.shows('show_values');
    const showAxis = full && this.shows('show_axis');
    const showGrid = full && this.shows('show_grid');
    const showDates = this.shows('show_dates');
    const plotHeight = full ? PLOT : PLOT_COMPACT;
    const top = showValues ? VALUES : HEADROOM;
    const height = top + plotHeight + (showDates ? DATES : 0);
    const known = [...values, ...(forecast ?? [])].filter((v): v is number => v !== null);
    const ticks = niceTicks(Math.min(0, ...known), Math.max(0, ...known));
    const tickTexts = ticks.ticks.map((t) => this.figure(t, ticks.decimals));
    const tickWidth = showAxis
      ? Math.max(0, ...tickTexts.map((t) => this.ruler.width('ax-tick', t)))
      : 0;
    const inset = showAxis ? (unit ? UNIT_COLUMN : 0) + tickWidth + AXIS_GAP : 0;
    const plotWidth = Math.max(1, width - inset);
    const count = buckets.length;
    const { slot, bar, radius } = barGeometry(count, plotWidth);
    this.plot = { inset, slot, count };
    const span = ticks.max - ticks.min;
    const y = (v: number): number =>
      span > 0 ? top + plotHeight - ((v - ticks.min) / span) * plotHeight : top + plotHeight;
    const zero = y(0);

    // the values over the bars: all of them, or none where one would not hold its slot
    const valueTexts = values.map((v) => (v === null ? '' : this.figure(v)));
    const valuesHold =
      showValues &&
      Math.max(0, ...valueTexts.map((t) => this.ruler.width('hb-value', t))) <= slot - 2;
    // the dates thinned to what the row holds, the last bar always read: every n-th by the widest label, and one
    // more where a label kept inside the plot at an end would crowd its neighbour
    const dateTexts = buckets.map((b) => this.dateLabel(b.start));
    const dateWidths = dateTexts.map((t) => this.ruler.width('hb-date', t));
    let dateStep = thinStep(Math.max(0, ...dateWidths), slot);
    let dated = labelled(count, dateStep);
    const placedDates = (): Placed[] =>
      dated.flatMap((on, i) =>
        on
          ? [
              {
                x: Number(
                  this.clampedX(inset + i * slot + slot / 2, dateWidths[i] ?? 0, inset, width),
                ),
                width: dateWidths[i] ?? 0,
              },
            ]
          : [],
      );
    while (dateStep < count && !labelsApart(placedDates())) dated = labelled(count, ++dateStep);
    const dateY = top + plotHeight + 8 + 12;

    // the colours of their own: the bars below zero, the one in progress (each its gradient, as the bars' is, in
    // classic; their colour, flat, in a style)
    const style = this.chartStyle;
    const classic = style.preset === 'classic';
    const negative = this.accents.item(this.config?.negative_color);
    const current = this.accents.item(this.config?.current_color);
    const own = (accent: string | undefined, id: string) =>
      accent
        ? svg`<linearGradient id=${id} x1="0" y1="0" x2="0" y2="1" data-accent=${accent} style="--ink:var(--fluvy-accent)">${this.stops()}</linearGradient>`
        : nothing;
    // the bars a highlight lights (the bars style's): the highest, the lowest, both, or the one in progress; the
    // rest go quiet
    const pick = style.highlight;
    const at = (sign: 1 | -1): number =>
      values.reduce<number>(
        (best, v, i) =>
          v !== null && (best < 0 || sign * v > sign * (values[best] as number)) ? i : best,
        -1,
      );
    const [highest, lowest] = [at(1), at(-1)];
    const lit = (i: number): boolean =>
      pick === 'none' ||
      ((pick === 'max' || pick === 'both') && i === highest) ||
      ((pick === 'min' || pick === 'both') && i === lowest) ||
      (pick === 'current' && i === running);

    const drawn = buckets.map((_bucket, i) => {
      const v = values[i] ?? null;
      const cx = inset + i * slot + slot / 2;
      const x = (cx - bar / 2).toFixed(1);
      const empty = v === null || v === 0 || span === 0;
      const below = v !== null && v < 0;
      const hover = hovered === i ? 'is-hover' : '';
      const now = running === i ? 'is-current' : '';
      const accent = now ? current : below ? negative : undefined;
      const fill = accent
        ? `;--hb-fill:${classic ? `url(#${this.gradient}-${now ? 'current' : 'negative'})` : 'var(--fluvy-accent)'};--hb-edge:var(--fluvy-accent)`
        : lit(i)
          ? ''
          : ';--hb-fill:var(--fluvy-border)';
      // a bar is at least 2 px tall, rounded at its far end and flat on the zero line (a style's at both ends, as the
      // house's bars are); a bucket with nothing in it is a quiet 2 px stub on the line
      const tall = empty ? 0 : Math.max(2, Math.round(Math.abs(y(v) - zero)));
      const rounded = !classic && style.caps === 'both' ? 'both' : below ? 'bottom' : 'top';
      // what was expected of that day, behind its bar (the tone at a fifth, so the bar reads over it)
      const expected = forecast?.[i] ?? null;
      const expectedTall =
        expected === null || expected === 0 || span === 0
          ? 0
          : Math.max(2, Math.round(Math.abs(y(expected) - zero)));
      const ghost =
        expected !== null && expectedTall > 0
          ? svg`<rect class="hb-forecast" x=${(cx - Math.max(bar + 4, Math.round(slot * 0.72)) / 2).toFixed(1)} y=${(expected >= 0 ? zero - expectedTall : zero).toFixed(1)} width=${Math.max(bar + 4, Math.round(slot * 0.72))} height=${expectedTall} rx=${Math.min(radius, 3)} style="fill:var(--tone-ink, var(--fluvy-state-energy-solar));fill-opacity:.08;stroke:var(--tone-ink, var(--fluvy-state-energy-solar));stroke-opacity:.45;stroke-width:1"></rect>`
          : nothing;
      const rect = empty
        ? svg`<rect class="hb-bar is-empty ${hover} ${now}" x=${x} y=${(zero - 2).toFixed(1)} width=${bar} height="2" rx=${Math.min(1, radius)}></rect>`
        : svg`<path class="hb-bar ${below ? 'is-negative' : ''} ${hover} ${now}" data-accent=${accent ?? nothing} d=${barPath(cx - bar / 2, below ? zero : zero - tall, bar, tall, radius, rounded)} style="--bar-delay:${i * 18}ms${fill}"></path>`;
      const label =
        valuesHold && !empty
          ? svg`<text class="hb-value" x=${this.clampedX(cx, this.ruler.width('hb-value', valueTexts[i] ?? ''), inset, width)} y=${below ? zero + tall + 13 : zero - tall - 4} text-anchor="middle">${valueTexts[i]}</text>`
          : nothing;
      const date =
        showDates && dated[i]
          ? svg`<text class="hb-date" x=${this.clampedX(cx, this.ruler.width('hb-date', dateTexts[i] ?? ''), inset, width)} y=${dateY} text-anchor="middle">${dateTexts[i]}</text>`
          : nothing;
      return svg`${ghost}${rect}${label}${date}`;
    });

    // classic's dashes, a style's hairlines (none where the house draws none)
    const grid =
      showGrid && (classic || style.grid.axes !== 'none')
        ? gridLines(ticks.ticks.map(y), inset, width, gridClass(style))
        : nothing;
    const axis = showAxis
      ? svg`${tickLabels(
          ticks.ticks.map((t, i) => [y(t), tickTexts[i] ?? ''] as const),
          inset - AXIS_GAP,
        )}${unit ? unitLabel(unit, top, top + plotHeight) : nothing}`
      : nothing;

    const hoveredBucket = hovered === null ? undefined : buckets[hovered];
    const reading = hoveredBucket
      ? `${this.barLabel(hoveredBucket, hovered === running)} · ${this.figure(values[hovered as number] ?? null)}${values[hovered as number] === null ? '' : ` ${unit}`}`
      : name;
    // without a head the chart is the card's button: a still tap on it runs the card's tap
    const tap = this.chartIsButton;
    return html`<div
      class="hb-chart fv-tone--${unusable ? 'neutral' : tone} ${hovered !== null ? 'is-scrub' : ''} ${tap ? 'hb-chart--tap' : ''} ${style.animate ? '' : 'is-still'}"
      role=${tap ? 'button' : 'img'}
      aria-label=${reading}
      tabindex="0"
      @keydown=${this.onKey}
      @pointerdown=${tap ? this.onPress : nothing}
      @pointermove=${tap ? this.onPressMove : nothing}
      @click=${tap ? this.chartTap : nothing}
      ${scrub(this.scrubber)}
    >
      <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}" data-measure="drawn">
        ${
          classic
            ? svg`<defs>
                <linearGradient id=${this.gradient} x1="0" y1="0" x2="0" y2="1">${this.stops()}</linearGradient>
                ${own(negative, `${this.gradient}-negative`)} ${own(current, `${this.gradient}-current`)}
              </defs>`
            : nothing
        }
        <g style="--hb-fill:${classic ? `url(#${this.gradient})` : 'var(--ink)'}">
          ${grid}${axis}${drawn}
        </g>
      </svg>
    </div>`;
  }

  /** A bar's soft gradient: its ink at 60 % over the card at the top, 48 % at the foot. */
  private stops(): TemplateResult {
    return svg`<stop offset="0" style="stop-color:color-mix(in srgb, var(--ink) 60%, var(--fluvy-card))"></stop><stop offset="1" style="stop-color:color-mix(in srgb, var(--ink) 48%, var(--fluvy-card))"></stop>`;
  }

  /** A label centred on its bar, kept inside the plot at the ends. */
  private clampedX(cx: number, textWidth: number, inset: number, width: number): string {
    const half = textWidth / 2;
    return Math.max(inset + half, Math.min(width - half, cx)).toFixed(1);
  }

  /**
   * The facts strip: cells of a circle, a label and a figure in equal columns — three, two or one, each with or
   * without its circle, the first fit by measure — with a divider in the gap between cells on a row.
   */
  private renderFacts(facts: readonly FactCell[]): TemplateResult {
    const width = this.contentWidth;
    const widest = Math.max(
      0,
      ...facts.map((f) =>
        Math.max(
          this.ruler.width('fv-readout__label', f.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            f.value,
            'fv-unit',
            f.unit ?? '',
          ),
        ),
      ),
    );
    // the circles first: as many columns as hold a circle with its words, else one column with the glyph alone
    let columns = 1;
    let circles = false;
    for (const n of [3, 2, 1]) {
      if (n > facts.length) continue;
      if (widest + CIRCLE <= (width - 2 * STRIP_PAD - CELL_GAP * (n - 1)) / n) {
        columns = n;
        circles = true;
        break;
      }
    }
    // a last cell alone on its row takes the whole row
    const odd = columns > 1 && facts.length % columns === 1;
    // the one-column fallback keeps the glyph alone before the words; a figure is never cut, so it takes the
    // extra-small size where the small one would not hold, and the glyph goes where even that would not
    const cell = (width - 2 * STRIP_PAD - CELL_GAP * (columns - 1)) / columns;
    const figures = (size: 's' | 'xs'): number =>
      Math.max(
        0,
        ...facts.map((f) =>
          this.ruler.width(
            `fv-readout fv-readout--${size} > fv-readout__value`,
            f.value,
            'fv-unit',
            f.unit ?? '',
          ),
        ),
      );
    let glyphs = !circles;
    let size: 's' | 'xs' = circles || figures('s') <= cell - GLYPH ? 's' : 'xs';
    if (glyphs && size === 'xs' && figures('xs') > cell - GLYPH) {
      glyphs = false;
      size = figures('s') <= cell ? 's' : 'xs';
    }
    return html`<div
      class="hb-facts ${odd ? 'hb-facts--odd' : ''}"
      style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))"
    >
      ${facts.map((fact, i) => {
        const tap = (): void => this.tap(fact.entity, fact.item.tap_action);
        const key = (event: KeyboardEvent): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            tap();
          }
        };
        return html`<div
          class="hb-fact hb-fact--tap ${i % columns ? 'has-divider' : ''}"
          role="button"
          tabindex="0"
          data-target
          data-accent=${fact.accent ?? nothing}
          aria-label=${`${fact.label}: ${fact.value}${fact.unit ? ` ${fact.unit}` : ''}`}
          @click=${tap}
          @keydown=${key}
        >
          ${
            circles
              ? ico(fact.icon, fact.tone)
              : glyphs
                ? html`<span class="hb-fact__glyph" aria-hidden="true">${icon(fact.icon)}</span>`
                : nothing
          }
          ${readout({ label: fact.label, value: fact.value, unit: fact.unit ?? '', size, name: true })}
        </div>`;
      })}
    </div>`;
  }
}
