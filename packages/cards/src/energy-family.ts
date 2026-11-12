import type { LovelaceCardConfig } from '@fluvy/core';
import {
  textWidth,
  chipBlock,
  chipRows,
  COLUMN,
  HEAD,
  listLength,
  optionBlock,
  optionRows,
  ROW,
  ROW_BAR,
  rowsOf,
  statsBlock,
  statsRows,
  type NameOf,
} from './shared/heights.js';

/**
 * The energy family, announced at start and defined when its chunk lands (`energy-cards.ts`): what the card picker
 * lists and how tall each card is at a 360 column, without the cards themselves — so a dashboard with no energy on
 * it never waits for them, and every page keeps its budget.
 */

/** The flow's rows: the first node one pitch under the head's icon, a pitch between nodes. */
export const FLOW_TOP = 42;
export const FLOW_PITCH = 80;

const up4 = (v: number): number => Math.ceil(v / 4) * 4;

/**
 * The labels of a card's `readouts`: their names, else the sensors' as the energy cards write them (`shortName`: a
 * name past eleven characters of several words by its last, "Kitchen speaker" as "Speaker"; the house's, read by
 * `house-heights.ts`), else their ids. A Chinese or Japanese name, which the cards keep whole, is counted by its last
 * word too: the test of those scripts stays in the energy family's chunk, for the rare readout left so named.
 */
const readoutLabels = (config: LovelaceCardConfig, nameOf?: NameOf): string[] =>
  (Array.isArray(config['readouts']) ? (config['readouts'] as unknown[]) : []).map((item) => {
    const entry = (typeof item === 'string' ? { entity: item } : (item ?? {})) as Record<
      string,
      unknown
    >;
    if (typeof entry['name'] === 'string') return entry['name'];
    const own = nameOf?.(entry['entity']);
    const name = typeof own === 'string' ? own : String(entry['entity'] ?? '').replace(/^.*\./, '');
    const words = name.split(' ');
    return name.length > 11 && words.length > 1 ? (words[words.length - 1] as string) : name;
  });

/** The chips a period card carries by default: 16 under the head, a 44 row; none while a date picker is followed. */
const periodChips = (config: LovelaceCardConfig): number =>
  config['show_period'] === false || config['collection_key'] ? 0 : 60;

/**
 * The rows' stage, as the diagram draws it at any width and the list it becomes: its last node's three lines (16 · 20 ·
 * 20 about its circle), the house's words under its ring, and the list's rows, three lines a node (56) and 6 between,
 * and the house's (44).
 */
export function flowStage(count: number): number {
  const last = FLOW_TOP + (count - 1) * FLOW_PITCH;
  const house = Math.round((FLOW_TOP + last) / 2 / 4) * 4;
  return up4(Math.max(last + 28, house + 72, 62 * count + 44));
}

/** The flow at a 360 column: its nodes (or the cross), the period chips, the consumers' rows, the totals. */
export function flowHeight(config: LovelaceCardConfig, nameOf?: NameOf): number {
  const sources = Array.isArray(config['sources']) ? config['sources'].length : 0;
  const stage = config['variant'] === 'cross' ? 292 : flowStage(Math.max(1, sources || 3));
  const period = config['period'] !== undefined && config['period'] !== 'live';
  // at a 360 column consumers are rows with bars (76), and the rest of the house one more
  const consumers = listLength(config, ['consumers']);
  return (
    HEAD +
    stage +
    (period ? periodChips(config) : 0) +
    (consumers ? 16 + ROW_BAR * (consumers + 1) : 0) +
    statsBlock(statsRows(readoutLabels(config, nameOf)))
  );
}

/** A grid source's phases, from its config (`phases`, or 1.3's `power` list). */
const phasesOf = (config: unknown): number => {
  const c = (config ?? {}) as Record<string, unknown>;
  const list = Array.isArray(c['phases'])
    ? c['phases']
    : Array.isArray(c['power'])
      ? c['power']
      : [];
  return list.length > 1 ? list.length : 0;
};

/** A block of the balance: 20 + its 20 head + 8 + the 12 bar + 12 + a 40 legend row. */
const BALANCE_BLOCK = 112;
/** A phase's row and the gap after it; the axis (4 + 16) under the last. */
const PHASE_PITCH = 40;

/**
 * The balance at a 360 column: its two blocks (a legend row each), the phases of a grid read by phase (live), the
 * period's chips and its money. A card that reads the Energy dashboard's sources is counted without phases.
 */
export function balanceHeight(config: LovelaceCardConfig): number {
  const period = config['period'] !== undefined && config['period'] !== 'live';
  const sources = Array.isArray(config['sources']) ? (config['sources'] as unknown[]) : [];
  const grid = sources.filter((s) => (s as Record<string, unknown> | null)?.['type'] === 'grid');
  const phases = period || config['show_phases'] === false ? 0 : Math.max(0, ...grid.map(phasesOf));
  return (
    64 +
    (period ? periodChips(config) : 0) +
    2 * BALANCE_BLOCK +
    (phases ? 20 + 28 + phases * PHASE_PITCH - 8 + 20 : 0) +
    (period && config['show_cost'] !== false ? 60 : 0) +
    20
  );
}

/**
 * The grid at a 360 column: its value row, its phases, the price, the totals (today's two when none are named; the
 * readouts named, in the rows their labels take).
 */
export function gridHeight(config: LovelaceCardConfig, nameOf?: NameOf): number {
  const phases = phasesOf(config);
  const labels = readoutLabels(config, nameOf);
  return (
    64 +
    80 +
    (phases ? 20 + phases * PHASE_PITCH - 8 + 20 : 0) +
    (config['price'] ? 76 : 0) +
    (labels.length ? statsBlock(statsRows(labels)) : 60) +
    20
  );
}

export const energyHeight = (config: LovelaceCardConfig): number =>
  config['variant'] === 'compact'
    ? 240
    : config['variant'] === 'sources'
      ? 468 // the legend's five items (three origins, charged, exported) fold into two rows
      : config['variant'] === 'overview'
        ? 492 // the taller chart (184) over the same legend
        : 320 + (listLength(config, ['legend']) ? 60 : 0);

/**
 * The devices at a 360 column: a 76 bar row each, one more under each parent (what its devices leave unmeasured) and
 * one for the rest of the house when its meter is given. With no rows, the Energy dashboard's devices: four, say.
 */
export function devicesHeight(config: LovelaceCardConfig): number {
  const list = config['rows'] ?? config['entities'];
  if (!Array.isArray(list) || !list.length) return HEAD + ROW_BAR * 4;
  const items = list.map((row: unknown) =>
    typeof row === 'string' ? { entity: row } : ((row ?? {}) as Record<string, unknown>),
  );
  const ids = new Set(items.map((row) => row['entity']));
  const parents = new Set(
    items.map((row) => row['parent']).filter((parent) => parent !== undefined && ids.has(parent)),
  );
  return HEAD + ROW_BAR * (items.length + parents.size + (config['total'] ? 1 : 0));
}

/** The legend's lead (its swatch and gap) before a name. */
const LEGEND_LEAD = 20;
/** A legend row (40) and the 8 between rows. */
const LEGEND_ROW = 40;
/** The least room between two neighbours' names in a legend's row: the house's smallest step. */
const LEGEND_APART = 8;

/**
 * The columns a legend takes in `width`, its items `widths` wide (a square and its name): as many as there are items
 * (three at most in a row of more), two of four, else one — the first in which every item holds its column, two
 * neighbours' names, centred in theirs, stand 8 apart and the widest figure (`figure`) holds a column; `gap` is the
 * room between columns. Two pixels over a column (its rounding, the ruler's own pixel) is not a reason to fold: the
 * name is centred and overhangs it, where its neighbours leave it the room.
 */
export function legendFold(widths: readonly number[], width: number, figure = 0, gap = 0): number {
  const count = widths.length;
  const candidates = count <= 3 ? [count, 1] : count === 4 ? [4, 2, 1] : [count, 3, 2, 1];
  const holds = (n: number): boolean => {
    const column = (width - gap * (n - 1)) / n;
    const apart = (i: number): boolean =>
      (i + 1) % n === 0 ||
      i + 1 === count ||
      column + gap - ((widths[i] ?? 0) + (widths[i + 1] ?? 0)) / 2 >= LEGEND_APART;
    return column >= figure && widths.every((item, i) => item <= column + 2 && apart(i));
  };
  return candidates.find(holds) ?? 1;
}

/** The rows a legend of `names` takes at a 360 column (`legendFold`), its names measured as the legend writes them. */
export function legendRows(names: readonly string[], width = COLUMN): number {
  if (!names.length) return 0;
  const widths = names.map((name) => LEGEND_LEAD + textWidth(name, 'legend'));
  return rowsOf(names.length, legendFold(widths, width));
}

/**
 * Production at a 360 column; several arrays draw a taller chart (112) and their legend (a row of 40, 16 under the
 * axis, one a row where a name runs long) instead of the figures. The names are the config's, else the house's
 * (`nameOf`, read by `house-heights.ts`).
 */
export function productionHeight(config: LovelaceCardConfig, nameOf?: NameOf): number {
  const arrays = Array.isArray(config['arrays']) ? (config['arrays'] as unknown[]).slice(0, 4) : [];
  if (config['variant'] === 'compact') return arrays.length ? 288 : 236;
  if (!arrays.length) return 344;
  const names = arrays.map((item) => {
    const entry = (typeof item === 'string' ? { entity: item } : (item ?? {})) as Record<
      string,
      unknown
    >;
    const name = entry['name'] ?? nameOf?.(entry['entity']);
    return typeof name === 'string' ? name : '';
  });
  const rows = legendRows(names);
  return 328 + rows * LEGEND_ROW + (rows - 1) * 8;
}

/* the history bars' pieces: the card's padding (20 above and below), the head (44), the readouts' own row (16 under
   the head + 44), the chart 20 under what is above it — the values over the bars (16 + 4) or a 4 headroom, the plot
   (120, 80 compact), the dates (8 + 16) — and the facts strip (24 above, 16 padding each side, 44 a row, 12 between) */
const BARS_PADDING = 40;
const BARS_HEAD = 44;
const BARS_READOUTS = 44;
const BARS_UNDER_HEAD = 16;
const BARS_CHART_GAP = 20;
const BARS_VALUES = 20;
const BARS_HEADROOM = 4;
const BARS_PLOT = 120;
const BARS_PLOT_COMPACT = 80;
const BARS_DATES = 24;
const BARS_FACT_ROW = 44;
const BARS_FACT_GAP = 12;
const BARS_FACTS_FRAME = 24 + 32;
/** The strip's inner width at a 360 column (320 less its padding), and the gap between its cells. */
const BARS_STRIP = 320 - 32;
const BARS_CELL_GAP = 24;
/** A fact's circle and the gap after it. */
const BARS_CIRCLE = 44 + 12;
/**
 * What a fact's caps label runs to, by its characters (11/600 with 0.06 em of tracking: about 7.4 px each), for
 * the kinds' English words and a name of the person's own — the card lays the strip out by measure; this is the
 * estimate the automatic dashboard plans with. A share names its sensor: a name is assumed.
 */
const BARS_CAPS = 7.4;
const BARS_LABELS: Readonly<Record<string, number>> = {
  total: 5,
  average: 9,
  highest: 7,
  lowest: 6,
  today: 5,
  co2: 3,
  trees: 13,
  km: 13,
  share: 16,
  money: 12,
  template: 0,
};
const factLabel = (fact: unknown): number => {
  if (typeof fact === 'string') return BARS_LABELS[fact] ?? 8;
  const item = (fact ?? {}) as Record<string, unknown>;
  return typeof item['name'] === 'string'
    ? item['name'].length
    : (BARS_LABELS[String(item['kind'])] ?? 8);
};
/**
 * What a fact's figure runs to (20/600 tabular digits about 13.5 px each, the decimal point 6.5, as measured; its
 * unit 13/500 about 8 px a character, 4 after the figure): a bucket's whole digits by the bar's period (a day's tens,
 * a week's hundreds, a month's thousands; a total one more), the kind's decimals and unit, or the item's own.
 */
const BARS_DIGIT = 13.5;
const BARS_POINT = 6.5;
const BARS_UNIT = 8;
const BARS_WHOLE: Readonly<Record<string, number>> = { day: 2, week: 3, month: 4 };
/** Each kind's figure, where it is not a bucket's: [whole digits, decimals, unit characters]. */
const BARS_FIGURES: Readonly<Record<string, readonly [number, number, number]>> = {
  share: [2, 0, 1],
  km: [3, 0, 2],
  co2: [2, 1, 2],
  trees: [1, 1, 5],
  template: [0, 0, 0],
};
const factFigure = (fact: unknown, config: LovelaceCardConfig): number => {
  const item = (typeof fact === 'string' ? { kind: fact } : (fact ?? {})) as Record<
    string,
    unknown
  >;
  const kind = String(item['kind']);
  const bucket = BARS_WHOLE[String(config['period'] ?? 'day')] ?? 2;
  const unit = typeof config['unit'] === 'string' ? config['unit'].length : 3;
  const [whole, decimals, chars] =
    BARS_FIGURES[kind] ??
    (kind === 'money'
      ? [bucket, 2, 1]
      : [bucket + (kind === 'total' ? 1 : 0), Number(config['decimals'] ?? 1), unit]);
  const own = Number(item['decimals'] ?? decimals);
  const shown = typeof item['unit'] === 'string' ? item['unit'].length : chars;
  return (
    whole * BARS_DIGIT +
    (own > 0 ? BARS_POINT + own * BARS_DIGIT : 0) +
    (shown ? 4 + shown * BARS_UNIT : 0)
  );
};
/**
 * The facts a strip holds in a row at a 360 column: three, two or one — the most whose cells hold a circle beside
 * the widest label or figure (two for the defaults on days; a week's or a month's figures, or a total, take one).
 */
function factsPerRow(facts: readonly unknown[], config: LovelaceCardConfig): number {
  const widest =
    Math.max(
      0,
      ...facts.map((fact) => Math.max(factLabel(fact) * BARS_CAPS, factFigure(fact, config))),
    ) + BARS_CIRCLE;
  for (const n of [3, 2]) if ((BARS_STRIP - BARS_CELL_GAP * (n - 1)) / n >= widest) return n;
  return 1;
}
/** The mini layout's one row: two readouts and a sparkline, 48 tall. */
const BARS_MINI_ROW = 48;

/** How many items a list has, or what the card draws when the config names none: a list named empty is empty. */
const listed = (config: LovelaceCardConfig, key: string, fallback: number): number => {
  const value = config[key];
  return Array.isArray(value) ? value.length : fallback;
};

/**
 * The history bars at a 360 column: the head, its readouts on their own row (a 360 column never holds a title and
 * two readouts beside the circle), the chart 20 under them — the values over the bars, the plot, the dates — and
 * the facts strip 24 under it, two facts a row with their circles (three where the labels are short, one where one
 * runs long). Compact is the head, its readouts, the bars and their dates; mini the head and one row of readouts
 * and a sparkline. A head switched off gives its row to the readouts; a chart with nothing above it starts at the
 * padding.
 */
export function historyBarsHeight(config: LovelaceCardConfig): number {
  const variant = config['variant'];
  const head = config['show_head'] !== false ? BARS_HEAD : 0;
  const readouts = listed(config, 'head', 2) > 0 ? (head ? BARS_UNDER_HEAD : 0) + BARS_READOUTS : 0;
  if (variant === 'mini') return BARS_PADDING + head + (head ? BARS_UNDER_HEAD : 0) + BARS_MINI_ROW;
  const above = head + readouts;
  const chart =
    (above ? BARS_CHART_GAP : 0) +
    (variant === 'compact' || config['show_values'] === false ? BARS_HEADROOM : BARS_VALUES) +
    (variant === 'compact' ? BARS_PLOT_COMPACT : BARS_PLOT) +
    (config['show_dates'] === false ? 0 : BARS_DATES);
  if (variant === 'compact') return BARS_PADDING + above + chart;
  const facts =
    config['show_facts'] === false
      ? []
      : Array.isArray(config['facts'])
        ? (config['facts'] as unknown[])
        : ['highest', 'lowest', 'average'];
  const rows = facts.length ? rowsOf(facts.length, factsPerRow(facts, config)) : 0;
  return (
    BARS_PADDING +
    above +
    chart +
    (rows ? BARS_FACTS_FRAME + BARS_FACT_ROW * rows + BARS_FACT_GAP * (rows - 1) : 0)
  );
}

/**
 * Water & gas at a 360 column: a 48 block per meter with 16 between them, then the rows under them (a 60 each). The
 * `rows` layout draws a 76 bar row per meter above the rows. With no meters given, the Energy dashboard's two.
 */
export function metersHeight(config: LovelaceCardConfig): number {
  const meters = listLength(config, ['meters']) || 2;
  const rows = listLength(config, ['rows']);
  if (config['variant'] === 'rows') return HEAD + ROW_BAR * meters + ROW * rows;
  return HEAD + 48 + 64 * (meters - 1) + (rows ? 16 + ROW * rows : 0);
}

/* the charge cards' pieces: the value row (16 + 64 under the head, the 16 counted in HEAD), a marked ruler and its
   labels (12 + 44, 4 + 16), a readout row (16 + 44), the mode (a label 16 + 20, then rows of tiles 8 + 84 or of
   chips 8 + 44: as many as the mode's options take, one row of three where the house is not there to say) */
const VALUE_ROW = 64;
const RULER = 56 + 20;
const COLS = 60;
const MODE_OPTIONS = ['a', 'b', 'c'];

/** A mode select's options as the house lists them (`house-heights.ts`), three where it is not there to say. */
const modeOptions = (options: readonly string[] | undefined): readonly string[] =>
  options?.length ? options : MODE_OPTIONS;

/** Batteries at a 360 column: the charge on its ruler, a row per battery when there are several, the mode. */
export function batteriesHeight(config: LovelaceCardConfig, options?: readonly string[]): number {
  const listed = Array.isArray(config['batteries']) ? (config['batteries'] as unknown[]) : [];
  // none listed: the Energy dashboard's, most often one with its state of charge
  const count = Math.max(1, listed.length);
  const level = !listed.length || listed.some((b) => typeof b === 'object' && b && 'level' in b);
  return (
    HEAD +
    VALUE_ROW +
    (level ? RULER : 0) +
    (count > 1 ? 16 + ROW_BAR * count : 0) +
    (config['mode'] ? chipBlock(chipRows(modeOptions(options))) : 0)
  );
}

/**
 * The car charger at a 360 column: the car's charge on its ruler (else the power), the session's readouts (the time
 * it has charged only shows while it charges: a status alone is not counted), the mode.
 */
export const chargerHeight = (config: LovelaceCardConfig, options?: readonly string[]): number =>
  HEAD +
  VALUE_ROW +
  (config['level'] ? RULER : 0) +
  (config['session_energy'] || config['solar_share'] ? COLS : 0) +
  (config['mode'] ? optionBlock(optionRows(modeOptions(options))) : 0);

/**
 * The sankey's body at a 360 column for a house with the sun, a battery and a few devices: a tier of source words,
 * the sources' ribbons, two tiers of targets, the house's ribbons, two tiers of devices (the approved figure).
 */
export const SANKEY_BODY = 416;

export const sankeyHeight = (config: LovelaceCardConfig): number =>
  HEAD + periodChips(config) + SANKEY_BODY;

/** The score: three rings (88 and their label, 20 under what is above) and a row of three readouts. */
export const scoreHeight = (config: LovelaceCardConfig): number =>
  HEAD + periodChips(config) + 4 + 112 + 60;

/** The Energy period card's chips row, under its row: the day, week, month and year (custom stays in its sheet). */
const GRAINS = ['day', 'week', 'month', 'year'];

/**
 * The Energy period strip: a 44 row in the card's 20 (84); compact, a 36 pill row in 12 (60); stacked, the row and,
 * 8 under it, the chips of its periods — four short words, one row at a 360 column (136).
 */
export function periodHeight(config: LovelaceCardConfig): number {
  if (config['variant'] === 'compact') return 60;
  const periods: unknown[] = Array.isArray(config['periods']) ? config['periods'] : GRAINS;
  return config['variant'] === 'stacked' && GRAINS.some((grain) => periods.includes(grain))
    ? 136
    : 84;
}

/**
 * The sources an Energy dashboard meters, as the usage card's legend names them in English: what it draws where it
 * lists none, in its order; in its `flows` mode by what their meters measured.
 */
const USAGE_WORDS: Readonly<Record<string, string>> = {
  solar: 'Solar',
  battery: 'Battery',
  grid: 'Grid',
};
const FLOWS_WORDS: Readonly<Record<string, string>> = {
  solar: 'Solar production',
  battery: 'Battery discharge',
  grid: 'Grid import',
};

/** The usage chart's plot in each layout (its frame adds 12 of headroom over it and 8 under its floor). */
const USAGE_PLOT = { full: 160, compact: 96, mini: 48 } as const;

/**
 * The usage chart's plot for a config: its layout's, or in the full and compact layouts the `plot_height` written (on
 * the 4 grid, 48 to 480).
 */
export function usagePlot(config: LovelaceCardConfig): number {
  const variant =
    config['variant'] === 'compact' || config['variant'] === 'mini' ? config['variant'] : 'full';
  const asked = Number(config['plot_height']);
  return variant !== 'mini' && asked > 0
    ? Math.min(480, Math.max(48, Math.round(asked / 4) * 4))
    : USAGE_PLOT[variant];
}

/**
 * The Energy usage card at a 360 column: the head, the period's chips, the chart (its plot and 20 of room) and its
 * hours or dates, and the legend: the sources shown (a kind listed twice is its first) as its mode names them and
 * what was charged and exported, in the rows their names take, 12 between them — the card keeps that room whatever
 * the house lacks of it, and folding sources into "Other" (`max_sources`) never takes a row more. Compact is the head,
 * its plot and its axis; mini the head and a 48 strip.
 */
export function usageHeight(config: LovelaceCardConfig): number {
  const plot = usagePlot(config);
  if (config['variant'] === 'mini') return HEAD + 20 + plot;
  if (config['variant'] === 'compact') return HEAD + 44 + plot;
  const words = config['mode'] === 'flows' ? FLOWS_WORDS : USAGE_WORDS;
  const names = new Map<unknown, string>();
  const listed = listLength(config, ['sources']) ? config['sources'] : Object.keys(words);
  for (const item of listed as unknown[]) {
    const s = (typeof item === 'string' ? { type: item } : (item ?? {})) as Record<string, unknown>;
    const word = words[s['type'] as string];
    if (word && s['show'] !== false && !names.has(s['type']))
      names.set(s['type'], String(s['name'] ?? word));
  }
  const shown = [...names.values()];
  if (config['show_returns'] !== false) {
    if (names.has('battery')) shown.push('Charged');
    if (names.has('grid')) shown.push('Exported');
  }
  const rows = config['show_legend'] === false ? 0 : legendRows(shown);
  return HEAD + periodChips(config) + 44 + plot + (rows && 4 + rows * 52);
}

export type FamilyEntry = readonly [
  tag: string,
  name: string,
  description: string,
  height: (config: LovelaceCardConfig) => number,
];

export const ENERGY_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-energy-card',
    'Fluvy · Energy',
    'Power right now, the day curve and the energy legend.',
    energyHeight,
  ],
  [
    'fluvy-energy-flow-card',
    'Fluvy · Energy flow',
    'Where the house’s energy comes from and where it goes, live or over a period: import and export at once, every source, lanes in their origin’s colour.',
    flowHeight,
  ],
  [
    'fluvy-energy-balance-card',
    'Fluvy · Energy balance',
    'What comes in against what goes out, live or over a period: the house is the remainder, so the totals agree; each phase of the grid, and the money.',
    balanceHeight,
  ],
  [
    'fluvy-grid-card',
    'Fluvy · Grid',
    'The grid right now: the net import or export, in and out at once, each phase with its voltage, the price and today’s totals.',
    gridHeight,
  ],
  [
    'fluvy-energy-devices-card',
    'Fluvy · Energy devices',
    'Where the energy goes, device by device on one scale: nested circuits, and what no meter measures.',
    devicesHeight,
  ],
  [
    'fluvy-meters-card',
    'Fluvy · Water & gas',
    'Today’s water and gas against a typical day, what flows right now, and a leak sensor or a valve beside them.',
    metersHeight,
  ],
  [
    'fluvy-production-card',
    'Fluvy · Production',
    'Hourly production bars with the forecast behind, stacked per array when there are several.',
    productionHeight,
  ],
  [
    'fluvy-forecast-card',
    'Fluvy · Solar forecast',
    'The sun’s day ahead: tomorrow’s total, its peak hour and the shape of the day as 24 bars — today’s forecast already sits beside the meter on the production card.',
    () => 292,
  ],
  [
    'fluvy-forecast-days-card',
    'Fluvy · Days ahead',
    'The days ahead as bars: each day the forecast sensors reach, with the total, the daily average and the best day under them.',
    () => 300,
  ],
  [
    'fluvy-history-bars-card',
    'Fluvy · History bars',
    'A sensor’s last days, weeks or months as bars from its long-term statistics: the total and the average in the head, the value over each bar, and a strip of facts under them — the highest and lowest, or what it comes to in CO₂, trees, kilometres or money.',
    historyBarsHeight,
  ],
  [
    'fluvy-batteries-card',
    'Fluvy · Batteries',
    'The house’s batteries as one: their state of charge, full or empty in, the reserve on the ruler, a row per battery and their mode.',
    batteriesHeight,
  ],
  [
    'fluvy-ev-charger-card',
    'Fluvy · Car charger',
    'The car on its charger: its charge against the target, ready by when, what the session added and how much of it came from the sun, the charging mode.',
    chargerHeight,
  ],
  [
    'fluvy-energy-sankey-card',
    'Fluvy · Where it went',
    'A day, week or month of energy from where to where, in true proportions: the grid, the battery and the sun into the house, the charge and the export, and the house into its devices.',
    sankeyHeight,
  ],
  [
    'fluvy-energy-score-card',
    'Fluvy · Energy score',
    'Self-powered, sun used and low-carbon as rings, the Energy dashboard’s own gauges, over imported, exported and net.',
    scoreHeight,
  ],
];

/**
 * The Energy period and Energy usage cards: their own chunk (`energy-period-cards.ts`), fetched at start as the energy
 * family's is.
 */
export const ENERGY_PERIOD_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-energy-period-card',
    'Fluvy · Energy period',
    'The view’s date picker as a strip: ‹ the day, week, month or year › and back to today, Home Assistant’s own, so its energy cards follow it as Fluvy’s do.',
    periodHeight,
  ],
  [
    'fluvy-energy-usage-card',
    'Fluvy · Energy usage',
    'Energy used by the hour, the day or the month, stacked by source.',
    usageHeight,
  ],
];
