import { flowHeight } from '../energy-family.js';
import {
  strings,
  type EntityName,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { barRow, head, ico, type Tone } from '@fluvy/ui';
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

import { allocate, type Allocation, type Totals } from '../energy-model/allocate.js';
import {
  CollectionFollower,
  collectionKeyOf,
  followPeriod,
  type EnergyDataLike,
} from '../energy-model/collection.js';
import { fetchPrefs } from '../energy-model/house.js';
import { downLine } from '../energy-model/outage.js';
import {
  allocatePeriod,
  fetchPeriod,
  PERIODS,
  type Period,
  type PeriodEnergy,
} from '../energy-model/period.js';
import { rangeWords } from '../energy-model/range-words.js';
import {
  readPrefs,
  type EnergyPrefs,
  type PrefSource,
  type SourceKind,
} from '../energy-model/prefs.js';
import { net, readMeasure, together, type Directed } from '../energy-model/reading.js';
import {
  bothWays,
  DEFAULT_THRESHOLD,
  KIND,
  legacySources,
  measureOfSource,
  prefSources,
  SOURCE_KEYS,
  sourceIds,
  type LegacyFlowKeys,
  type SourceConfig,
} from '../energy-model/sources.js';
import { isStale, liveWords, newestReport, staleShorter } from '../energy/freshness.js';
import { HeadFit } from '../energy/head.js';
import { legendStats } from '../energy/legend.js';
import { scaled, scaleOf, shortName, watts, type Scale } from '../energy/power.js';
import { statsCols, statsStyles } from '../energy/stats.js';
import { Card, type CardEditor } from '../shared/base.js';
import { chipRow } from '../shared/chips.js';
import { fitLine } from '../shared/fit.js';
import { toneOf } from '../shared/colour.js';
import { ITEM_ALIASES, type AliasSpec, type Move } from '../shared/config.js';
import { writesZero, type NumberKeys } from '../shared/units.js';
import {
  arcs,
  crossLayout,
  drawn,
  headPath,
  HOUSE_R,
  pathOf,
  railIn,
  railTrack,
  reverse,
  rowsLayout,
  TEXT,
  type CrossKey,
  type Cubic,
  type Point,
} from './geometry.js';
import { PulseEngine, type MotionMode, type Pulse } from './motion.js';
import {
  houseShares,
  KIND_INK,
  lanesOf,
  oneWay,
  said,
  type Ink,
  type LaneState,
  type Origins,
  type SceneNode,
  type WayWords,
} from './scene.js';

const s = strings('energy-flow');
const devices = strings('energy-devices');

export type FlowVariant = 'rows' | 'cross' | 'list';
export const FLOW_VARIANTS: readonly FlowVariant[] = ['rows', 'cross', 'list'];
export type FlowStyle = 'stream' | 'legs' | 'rail';
export const FLOW_STYLES: readonly FlowStyle[] = ['stream', 'legs', 'rail'];
export type FlowBadge = 'solar' | 'self_powered' | 'grid' | 'none';
export const FLOW_BADGES: readonly FlowBadge[] = ['solar', 'self_powered', 'grid', 'none'];
export type FlowPeriod = 'live' | Period;
export const FLOW_PERIODS: readonly FlowPeriod[] = ['live', ...PERIODS];

export interface EnergyFlowReadout extends NumberKeys {
  entity: string;
  name?: EntityName;
}

export interface EnergyFlowConsumer {
  entity: string;
  name?: EntityName;
  icon?: string;
  color?: string;
}

export interface EnergyFlowCardConfig extends FluvyCardConfig, NumberKeys {
  title?: string;
  subtitle?: string;
  /** Where the energy comes from. Empty: the Energy dashboard's own (every grid connection, array and battery). */
  sources?: readonly SourceConfig[];
  /** The house's own meter. Absent: what the sources add up to. */
  home?: string;
  /** Where it goes: the house's biggest consumers, and the rest of the house. */
  consumers?: ReadonlyArray<string | EnergyFlowConsumer>;
  /** `rows` (sources left, house right), `cross` (Home Assistant's arrangement) or `list`; narrow cards list. */
  variant?: FlowVariant;
  /** `stream` (lanes with pulses of light), `legs` (thin dashed lanes) or `rail` (one quiet track). */
  flow_style?: FlowStyle;
  motion?: MotionMode;
  /** The house's peak in watts: a flow's pace is its share of it (default 6 000 W). */
  max_power?: number;
  badge?: FlowBadge;
  /** `live` (power) or a period's totals (energy, from the Energy dashboard's meters). */
  period?: FlowPeriod;
  /** Day · Week · Month chips over a period's diagram. */
  show_period?: boolean;
  /** An Energy date picker's key (`energy_…`): the diagram follows its range, with Home Assistant's own figures, and the chips go. */
  collection_key?: string;
  /** Up to three totals under the diagram. */
  readouts?: ReadonlyArray<string | EnergyFlowReadout>;
  /** The tests' clock: "now" for the freshness words. */
  _now?: string;
}

const DEFAULT_PEAK = 6000;
/** Consumers drawn beside the house need this much room; below it they are listed under the diagram. */
const CONSUMERS_WIDE = 560;
/** Over a period, a way under 50 Wh rests: its lane and its figure dim, the figure still its total. */
const PERIOD_THRESHOLD = 50;

/** One node of the diagram, resolved: what it is, how it reads, how it is drawn. */
interface Node extends SceneNode {
  readonly key: string;
  readonly label: string;
  readonly glyph: string;
  readonly tone: Tone;
  readonly accent: string | undefined;
  readonly level: number | null;
  readonly arrows: boolean;
  readonly entity: string | undefined;
  readonly lanes: readonly LaneState[];
  readonly dead: boolean;
}

interface Words {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly way: string;
  readonly second?: { readonly value: string; readonly unit: string; readonly way: string };
  readonly dim: boolean;
}

interface Consumer {
  readonly key: string;
  readonly label: string;
  readonly glyph: string;
  readonly accent: string | undefined;
  readonly watts: number | null;
  readonly entity: string | undefined;
}

interface Scene {
  readonly nodes: readonly Node[];
  readonly words: readonly Words[];
  readonly house: Words;
  readonly houseValue: number | null;
  readonly consumers: readonly Consumer[];
  readonly consumerWords: readonly Words[];
  readonly allocation: Allocation | null;
  readonly origins: Origins;
  readonly stale: boolean;
  readonly period: Period | null;
  readonly empty: 'sources' | 'period' | null;
  readonly scale: Scale;
}

/** The keys 1.3 read the sources from, read into `sources` (and never written). */
const LEGACY_KEYS = [
  'solar_power',
  'grid_power',
  'grid_invert',
  'battery_power',
  'battery_invert',
  'battery_level',
] as const;

const moves: readonly Move[] = [{ from: 'home_power', to: 'home' }];

/** 1.3's config in 1.4's words: the flat source keys become `sources`, and its ribbons (its default) the stream. */
function upgrade(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  let next = config;
  const legacy = legacySources(config as LegacyFlowKeys);
  const listed = config['sources'];
  if (legacy.length && !(Array.isArray(listed) && listed.length))
    next = { ...next, sources: legacy };
  if (config['flow_style'] === 'ribbons') next = { ...next, flow_style: 'stream' };
  return next;
}

/**
 * The flow diagram: where the house's energy comes from and where it goes, live or over a period. Sources are
 * read the way their meters are — one signed sensor, two sensors (in and out), or one per phase summed per sign —
 * so a house that imports on two phases and exports on the third shows both flows at once; with no sources given,
 * the Energy dashboard's own are read. Every lane is coloured by where its energy came from, its arrowhead ends
 * the lane, and pulses of light travel it at a pace set by its share of the house's peak.
 */
export class FluvyEnergyFlowCard extends Card<EnergyFlowCardConfig> {
  static override layoutHeight(config: EnergyFlowCardConfig): number {
    return flowHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    energyStyles,
    statsStyles,
    css`
      .ef-card {
        width: 100%;
      }
      .en-list__row .en-words__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* a row of the narrow card: its words at the row's end, the label with the width they leave */
      .en-list__label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 600;
        color: var(--fluvy-text);
      }
      .en-list__stat {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        max-inline-size: 62%;
      }
    `,
  ];

  static override aliases: AliasSpec = {
    keys: moves,
    items: {
      readouts: ITEM_ALIASES,
      consumers: ITEM_ALIASES,
      sources: [{ from: 'power', to: 'phases', when: Array.isArray }],
    },
    upgrade,
    drop: LEGACY_KEYS,
  };
  /** The card's editor: fetched the first time the card is edited, never by a dashboard. */
  static override editor(): Promise<CardEditor> {
    return import('./energy-flow-editor.js');
  }

  protected override prepare(config: EnergyFlowCardConfig): EnergyFlowCardConfig {
    collectionKeyOf(config, 'fluvy-energy-flow-card');
    return config;
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): EnergyFlowCardConfig {
    const power = entities.filter(
      (id) => id.startsWith('sensor.') && hass?.states[id]?.attributes.device_class === 'power',
    );
    const pick = (word: RegExp): string | undefined => power.find((id) => word.test(id));
    const solar = pick(/solar|pv|inverter/i);
    const battery = pick(/batter/i);
    const grid = pick(/grid|mains|red|net/i);
    const sources: SourceConfig[] = [
      ...(solar ? [{ type: 'solar' as const, power: solar }] : []),
      ...(grid ? [{ type: 'grid' as const, power: grid }] : []),
      ...(battery ? [{ type: 'battery' as const, power: battery }] : []),
    ];
    // nothing recognisable: the Energy dashboard's own sources
    return { type: 'custom:fluvy-energy-flow-card', ...(sources.length ? { sources } : {}) };
  }

  private readonly head = new HeadFit(this);
  private readonly pulses = new PulseEngine(this);
  private readonly follower = new CollectionFollower(this);
  private ticker: number | undefined;
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private chosen: Period | undefined;
  private periodData: PeriodEnergy | null | undefined;
  private periodKey = '';
  /** The picker's answer the totals were last allocated from. */
  private followed: EnergyDataLike | undefined;
  private shownFreshness = '';
  private scene: Scene | undefined;

  override getCardSize(): number {
    return Math.ceil(FluvyEnergyFlowCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private sourceList(): readonly SourceConfig[] {
    const own = this.config?.sources ?? [];
    return own.length ? own : prefSources(this.prefs);
  }

  private consumerList(): EnergyFlowConsumer[] {
    return (this.config?.consumers ?? [])
      .map((c) => (typeof c === 'string' ? { entity: c } : c))
      .filter((c) => typeof c.entity === 'string' && c.entity !== '');
  }

  private readouts(): EnergyFlowReadout[] {
    return (this.config?.readouts ?? [])
      .slice(0, 3)
      .map((r) => (typeof r === 'string' ? { entity: r } : r));
  }

  private periodOf(): Period | null {
    const period = this.config?.period;
    if (!period || period === 'live' || !PERIODS.includes(period)) return null;
    return followPeriod(this.follower, this.chosen ?? period);
  }

  protected override watched(): readonly string[] {
    return [
      ...this.sourceList().flatMap(sourceIds),
      this.config?.home,
      ...this.consumerList().map((c) => c.entity),
      ...this.readouts().map((r) => r.entity),
    ].filter((id): id is string => !!id);
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.pulses.connect();
    // "Live · 5 s ago" is a claim about the clock: checked every 5 s, drawn only when its words change
    this.ticker = window.setInterval(() => {
      if (!this.config) return;
      if (this.periodOf()) {
        this.requestUpdate(); // a period's totals are asked for again when their cache runs out
        return;
      }
      if (this.config.subtitle === undefined && this.freshness() !== this.shownFreshness)
        this.requestUpdate();
    }, 5000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.pulses.disconnect();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config) return;
    this.follower.attach(this.hass, this.config.collection_key || undefined);
    this.askPrefs();
    this.askPeriod();
    this.shownFreshness = this.freshness();
    this.scene = this.build();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const stage = this.renderRoot.querySelector<HTMLElement>('.en-stage');
    this.pulses.sync(
      stage,
      this.pulseList(),
      this.config?.motion ?? 'full',
      this.config?.max_power ?? DEFAULT_PEAK,
      stage ? [stage.offsetWidth, stage.offsetHeight] : [0, 0],
    );
  }

  /** The Energy dashboard's preferences: read when a card has no sources of its own or shows a period. */
  private askPrefs(): void {
    if (this.prefsAsked || !this.hass) return;
    if ((this.config?.sources ?? []).length && !this.periodOf()) return;
    this.prefsAsked = true;
    void fetchPrefs(this.hass).then((prefs) => {
      this.prefs = prefs;
      this.requestUpdate();
    });
  }

  private askPeriod(): void {
    const period = this.periodOf();
    if (!period || !this.hass || this.prefs === undefined) return;
    const house = readPrefs(this.prefs);
    // a picker on the view: its figures, allocated once per answer, and nothing asked of our own
    if (this.follower.range()) {
      const data = this.follower.data();
      if (data && data !== this.followed) {
        this.followed = data;
        this.periodData = allocatePeriod(data.stats, house.sources);
      }
      return;
    }
    const now = new Date(this.now());
    const key = `${period}|${Math.floor(now.getTime() / 300_000)}|${this.prefs ? 'p' : ''}`;
    if (key === this.periodKey) return;
    this.periodKey = key;
    void fetchPeriod(this.hass, house.sources, period, now).then((data) => {
      this.periodData = data;
      this.requestUpdate();
    });
  }

  /* ---------- the scene ---------- */

  private ways(): WayWords {
    return {
      in: s(this.hass, 'way_in'),
      out: s(this.hass, 'way_out'),
      charging: s(this.hass, 'way_charging'),
      discharging: s(this.hass, 'way_discharging'),
      charged: s(this.hass, 'way_charged'),
      discharged: s(this.hass, 'way_discharged'),
    };
  }

  private kindName(kind: SourceKind): string {
    return s(this.hass, `kind_${kind}`);
  }

  private build(): Scene {
    const period = this.periodOf();
    const ways = this.ways();
    const base = period ? 'Wh' : 'W';
    let nodes: Omit<Node, 'lanes'>[];
    let allocation: Allocation | null;
    let empty: Scene['empty'] = null;

    if (period) {
      const house = readPrefs(this.prefs);
      const data = this.periodData;
      const sources = house.sources.filter((p) => p.energyIn.length || p.energyOut.length);
      nodes = sources.map((p, i) => this.periodNode(p, i, sources, data));
      allocation = data ? data.allocation : null;
      if (allocation) allocation = scaleAllocation(allocation, 1000);
      if (!sources.length && this.prefs !== undefined) empty = 'period';
    } else {
      const configs = this.sourceList();
      nodes = configs.map((c, i) => this.liveNode(c, i, configs));
      // a source that cannot be read counts as nothing while another of its kind reads (an array asleep)
      const readable = nodes.every(
        (n) => together(nodes.filter((o) => o.kind === n.kind).map((o) => net(o.reading))) !== null,
      );
      allocation = readable && nodes.length ? allocate(totalsOf(nodes)) : null;
      if (!configs.length && (this.config?.sources?.length || this.prefs !== undefined))
        empty = 'sources';
    }

    const origins: Origins = {
      allocation,
      solar: nodes.find((n) => n.kind === 'solar')?.ink,
      grid: nodes.find((n) => n.kind === 'grid')?.ink,
      battery: nodes.find((n) => n.kind === 'battery')?.ink,
    };
    const stale = !period && isStale(this.newest(), this.now());
    const shown = nodes
      .map((n) => ({ ...n, lanes: lanesOf(n, origins) }))
      .filter((n) => {
        const show = this.sourceList()[Number(n.key.split('-')[1])]?.show ?? 'always';
        if (period || show === 'always') return true;
        if (show === 'never') return false;
        return n.lanes.some((l) => !l.rest);
      })
      // nothing is known to flow from a stale house or a source that cannot be read: its lanes rest
      .map((n) =>
        stale || n.dead ? { ...n, lanes: n.lanes.map((l) => ({ ...l, rest: true })) } : n,
      );

    // the house: its own meter, else what the sources add up to (known only when every source reads)
    const homeId = this.config?.home;
    const houseValue = period
      ? (allocation?.usedTotal ?? null)
      : homeId
        ? watts(this.entity(homeId))
        : (allocation?.usedTotal ?? null);

    const consumers = period ? [] : this.consumers(houseValue);
    const figures = [
      ...shown.flatMap((n) => [n.reading.in, n.reading.out]),
      houseValue,
      ...consumers.map((c) => c.watts),
    ];
    const scale = scaleOf(figures, base, this.config);
    const fig = (v: number | null): { value: string; unit: string } =>
      v === null
        ? { value: '—', unit: '' }
        : { value: scaled(this.hass, v, scale), unit: scale.unit };

    // over a period every total is said that its decimals write as more than nothing (#109)
    const reads = period ? (total: number): boolean => !writesZero(total, scale) : undefined;
    const words = shown.map((n): Words => {
      const say = said(n, ways, reads);
      const first = fig(say.first.value);
      return {
        label: n.label,
        ...first,
        way: say.first.way,
        ...(say.second ? { second: { ...fig(say.second.value), way: say.second.way } } : {}),
        dim: say.idle || stale,
      };
    });
    const houseWords: Words = {
      label: s(this.hass, 'house'),
      ...fig(houseValue),
      way: '',
      dim: stale,
    };
    const consumerWords = consumers.map((c): Words => ({
      label: c.label,
      ...fig(c.watts),
      way: '',
      dim: stale,
    }));
    return {
      nodes: shown,
      words,
      house: houseWords,
      houseValue,
      consumers,
      consumerWords,
      allocation,
      origins,
      stale,
      period,
      empty,
      scale,
    };
  }

  private inkOf(
    kind: SourceKind,
    color: unknown,
  ): { ink: Ink; tone: Tone; accent: string | undefined } {
    const accent = color !== undefined && color !== '' ? this.accents.item(color) : undefined;
    if (accent) return { ink: { tone: 'accent', accent }, tone: 'accent', accent };
    return { ink: { tone: KIND_INK[kind] }, tone: KIND[kind].tone, accent: undefined };
  }

  private liveNode(c: SourceConfig, i: number, all: readonly SourceConfig[]): Omit<Node, 'lanes'> {
    const measure = measureOfSource(c);
    const reading: Directed = measure
      ? readMeasure(measure, (id) => this.entity(id))
      : { in: null, out: null };
    // an inverter asleep reports its own few watts as negative production: that is not a flow
    const clean: Directed = oneWay(c.type)
      ? { in: reading.in, out: reading.in === null ? null : 0 }
      : reading;
    const levelView = c.level ? this.entity(c.level) : undefined;
    const level = levelView?.number ?? null;
    const same = all.filter((o) => o.type === c.type).length;
    const name = c.name ?? (same > 1 ? this.nameOf(c) : this.kindName(c.type));
    const { ink, tone, accent } = this.inkOf(c.type, c.color);
    return {
      key: `source-${i}`,
      kind: c.type,
      ink,
      reading: clean,
      threshold: c.threshold ?? DEFAULT_THRESHOLD,
      pair: bothWays(c),
      label: level === null ? name : `${name} · ${Math.round(Math.min(100, Math.max(0, level)))} %`,
      glyph: c.icon ?? KIND[c.type].glyph,
      tone,
      accent,
      level,
      arrows: (c.arrows ?? 'arrival') !== 'none',
      entity: sourceIds(c)[0],
      dead: clean.in === null || clean.out === null,
    };
  }

  /** A source's name when there are several of its kind: its sensor's, short. */
  private nameOf(c: SourceConfig): string {
    const id = sourceIds(c)[0];
    return id ? shortName(this.entity(id)) : this.kindName(c.type);
  }

  private periodNode(
    p: PrefSource,
    i: number,
    all: readonly PrefSource[],
    data: PeriodEnergy | null | undefined,
  ): Omit<Node, 'lanes'> {
    const sum = (ids: readonly string[]): number | null =>
      data ? ids.reduce((acc, id) => acc + (data.byStat.get(id) ?? 0), 0) * 1000 : null;
    const same = all.filter((o) => o.kind === p.kind).length;
    const first = p.energyIn[0] ?? p.energyOut[0];
    const name =
      p.name ?? (same > 1 && first ? shortName(this.entity(first)) : this.kindName(p.kind));
    const { ink, tone, accent } = this.inkOf(p.kind, undefined);
    const into = sum(p.energyIn);
    const out = oneWay(p.kind) ? (into === null ? null : 0) : sum(p.energyOut);
    return {
      key: `source-${i}`,
      kind: p.kind,
      ink,
      reading: { in: into, out },
      threshold: PERIOD_THRESHOLD,
      pair: !oneWay(p.kind) && p.energyIn.length > 0 && p.energyOut.length > 0,
      label: name,
      glyph: KIND[p.kind].glyph,
      tone,
      accent,
      level: null,
      arrows: true,
      entity: first,
      dead: false,
    };
  }

  private consumers(house: number | null): Consumer[] {
    const list = this.consumerList();
    if (!list.length) return [];
    const out: Consumer[] = list.map((c, i) => {
      const view = this.entity(c.entity);
      return {
        key: `consumer-${i}`,
        label: c.name == null ? shortName(view) : this.nameFor(view, c.name),
        glyph: c.icon ?? 'plug',
        accent: c.color !== undefined && c.color !== '' ? this.accents.item(c.color) : undefined,
        watts: watts(view),
        entity: c.entity,
      };
    });
    // the rest of the house: what its meter says the named ones do not account for
    const named = out.reduce<number | null>(
      (sum, c) => (sum === null || c.watts === null ? null : sum + c.watts),
      0,
    );
    if (house !== null && named !== null && house - named >= DEFAULT_THRESHOLD)
      out.push({
        key: 'rest',
        label: s(this.hass, 'rest_of_house'),
        glyph: 'plug',
        accent: undefined,
        watts: house - named,
        entity: undefined,
      });
    return out;
  }

  /** The newest reading of every source: "live" is only said when it is true. */
  private newest(): number {
    return newestReport(this.hass, [
      ...this.sourceList().flatMap(sourceIds),
      ...(this.config?.home ? [this.config.home] : []),
    ]);
  }

  private now(): number {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(pinned) ? pinned : Date.now();
  }

  private freshness(): string {
    const period = this.periodOf();
    if (!period) return liveWords(this.hass, this.newest(), this.now());
    const range = this.follower.range();
    return range
      ? rangeWords(this.hass, range, new Date(this.now()))
      : s(this.hass, `period_${period}`);
  }

  /** The head's badge: how much of the house runs on sun (or its self-sufficiency, or the grid's way). */
  private badge(scene: Scene): { text: string; tone: Tone } | null {
    const dead = scene.nodes.find((n) => n.dead);
    if (dead) return { text: this.t('state.unavailable'), tone: 'warning' };
    if (scene.stale) return null;
    const kind = this.config?.badge ?? 'solar';
    if (kind === 'none') return null;
    const a = scene.allocation;
    const total = a?.usedTotal ?? 0;
    const percent = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 100);
    const grid = scene.nodes.filter((n) => n.kind === 'grid');
    const importing = grid.some((n) => (n.reading.in ?? 0) >= n.threshold);
    const exporting = grid.some((n) => (n.reading.out ?? 0) >= n.threshold);
    const gridBadge = (): { text: string; tone: Tone } | null =>
      importing && exporting
        ? { text: s(this.hass, 'import_export'), tone: 'grid' }
        : importing
          ? { text: this.t('energy.importing'), tone: 'grid' }
          : exporting
            ? { text: this.t('energy.exporting'), tone: 'grid' }
            : null;
    if (!a || total <= 0) return kind === 'grid' && !scene.period ? gridBadge() : null;
    // over a period the badge is a share of it, never a live state ("Importing" is a moment, not a day)
    if (scene.period) {
      const solar = scene.nodes.some((n) => n.kind === 'solar');
      return kind === 'solar' && solar
        ? {
            text: s(this.hass, 'solar_share', { percent: percent(a.usedSolar / total) }),
            tone: 'solar',
          }
        : {
            text: s(this.hass, 'self_powered', { percent: percent(1 - a.usedGrid / total) }),
            tone: 'solar',
          };
    }
    if (kind === 'grid') return gridBadge();
    if (kind === 'self_powered')
      return {
        text: s(this.hass, 'self_powered', { percent: percent(1 - a.usedGrid / total) }),
        tone: 'solar',
      };
    // the news, in this order: the battery selling to the grid, a generator carrying the house, the sun's share, the
    // car or the battery carrying it, the grid filling the battery, the battery's way
    const t = DEFAULT_THRESHOLD;
    if (a.batteryToGrid >= t) return { text: s(this.hass, 'selling'), tone: 'battery' };
    if (a.usedGenerator >= t && a.usedGenerator >= a.usedSolar)
      return { text: s(this.hass, 'kind_generator'), tone: 'gas' };
    if (scene.nodes.some((n) => n.kind === 'solar') && a.usedSolar > 0)
      return {
        text: s(this.hass, 'solar_share', { percent: percent(a.usedSolar / total) }),
        tone: 'solar',
      };
    if (a.usedVehicle >= total / 2) return { text: s(this.hass, 'on_the_car'), tone: 'vehicle' };
    if (a.usedBattery >= total / 2)
      return { text: s(this.hass, 'on_the_battery'), tone: 'battery' };
    if (a.gridToBattery >= t) return { text: s(this.hass, 'charging'), tone: 'grid' };
    const battery = scene.nodes.filter((n) => n.kind === 'battery');
    if (battery.some((n) => (n.reading.out ?? 0) >= n.threshold))
      return { text: s(this.hass, 'charging'), tone: 'battery' };
    if (battery.some((n) => (n.reading.in ?? 0) >= n.threshold))
      return { text: s(this.hass, 'discharging'), tone: 'battery' };
    return gridBadge() ?? { text: this.t('energy.idle'), tone: 'neutral' };
  }

  /** The head's second line: the freshness, or which source cannot be read and since when. */
  private sub(scene: Scene): string {
    if (this.config?.subtitle !== undefined) return this.config.subtitle;
    // "Solar · unavailable · since 19:47", in segments the head drops from the end where the line would not hold
    const dead = scene.nodes.find((n) => n.dead);
    return dead?.entity ? downLine(this.hass, dead.label, dead.entity) : this.shownFreshness;
  }

  /* ---------- measuring ---------- */

  private lineWidth(value: string, unit: string, way: string): number {
    return this.head.ruler.width(
      'en-words__value',
      value,
      'en-words__unit',
      `${unit}${way ? ` ${way}` : ''}`,
    );
  }

  private wordsWidth(w: Words): number {
    return Math.max(
      this.head.ruler.width('en-words__label', w.label),
      this.lineWidth(w.value, w.unit, w.way),
      w.second ? this.lineWidth(w.second.value, w.second.unit, w.second.way) : 0,
    );
  }

  /* ---------- render ---------- */

  private arrangement(scene: Scene): 'rows' | 'cross' | 'list' {
    const variant = this.config?.variant ?? 'rows';
    if (variant === 'list') return 'list';
    if (variant === 'cross') {
      const kinds = scene.nodes.map((n) => n.kind);
      const fits =
        kinds.every((k) => k === 'solar' || k === 'grid' || k === 'battery') &&
        new Set(kinds).size === kinds.length &&
        kinds.includes('grid') &&
        this.contentWidth >= 280;
      if (fits) return 'cross';
    }
    return 'rows';
  }

  protected renderCard(): TemplateResult {
    const scene = this.scene ?? this.build();
    this.scene = scene;
    const w = this.contentWidth;
    const title = this.config?.title ?? s(this.hass, 'title');
    const badge = this.badge(scene);
    const sub = this.sub(scene);
    // stale, "Updated 32 days ago" says its age alone where the column cannot hold it ("32 days ago")
    const shorter =
      sub === this.shownFreshness && !scene.period
        ? staleShorter(this.hass, this.newest(), this.now())
        : [];
    const fitted = this.head.fit({ width: w, title, sub, badge, shorter });
    const period = scene.period;
    const body =
      scene.empty === 'sources'
        ? this.head.empty(
            'bolt',
            s(this.hass, 'no_sources'),
            s(this.hass, 'no_sources_hint'),
            this.contentWidth,
          )
        : scene.empty === 'period'
          ? this.head.empty(
              'bolt',
              s(this.hass, 'no_period'),
              s(this.hass, 'no_period_hint'),
              this.contentWidth,
            )
          : this.renderBody(scene, w);
    const totals = this.readouts();
    return html`<article class="fv-card ef-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'bolt') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        period && this.config?.show_period !== false && !this.follower.following
          ? html`<div class="en-period">
              ${chipRow(
                PERIODS.map((p) => ({
                  key: p,
                  label: s(this.hass, `chip_${p}`),
                  active: p === period,
                })),
                (key) => {
                  this.chosen = key as Period;
                  this.periodKey = '';
                  this.requestUpdate();
                },
                'full',
                { ruler: this.head.ruler, width: w },
              )}
            </div>`
          : nothing
      }
      ${body}
      ${
        totals.length
          ? statsCols(
              this.head.ruler,
              w,
              legendStats(this.hass, totals, (id) => this.entity(id), this.config),
            )
          : nothing
      }
    </article>`;
  }

  private renderBody(scene: Scene, w: number): TemplateResult {
    const layout = this.arrangement(scene);
    if (layout === 'cross') return this.renderCross(scene, w);
    const wide = scene.consumers.length > 0 && w >= CONSUMERS_WIDE && layout === 'rows';
    const rows =
      layout === 'rows'
        ? rowsLayout({
            width: w,
            nodes: scene.nodes.map((n, i) => ({
              wordsH: blockH(scene.words[i]),
              wordsW: this.wordsWidth(scene.words[i] as Words),
              pair: n.pair,
            })),
            houseWordsH: 36,
            ...(wide
              ? {
                  consumers: scene.consumerWords.map((cw) => ({
                    wordsH: blockH(cw),
                    wordsW: this.wordsWidth(cw),
                  })),
                }
              : {}),
          })
        : null;
    if (!rows || rows.narrow)
      return html`${this.renderList(scene, w)}${this.renderConsumerRows(scene)}`;
    return html`${this.renderRows(scene, w, rows, wide)}${wide ? nothing : this.renderConsumerRows(scene)}`;
  }

  /* the lanes */

  private flowStyle(): FlowStyle {
    const style = this.config?.flow_style;
    return style && FLOW_STYLES.includes(style) ? style : 'stream';
  }

  /** One lane: both of its bodies and heads when it can reverse, the one way otherwise. */
  private lane(
    path: Cubic,
    state: LaneState,
    o: { reversible: boolean; heads: boolean; thin: boolean },
  ): TemplateResult {
    const size = o.thin ? 'thin' : 'lane';
    const inward = drawn(path, size, o.heads);
    const outward = o.reversible ? drawn(reverse(path), size, o.heads) : null;
    const d = headPath(size);
    return svg`<g class="en-flow ${o.thin ? 'en-flow--thin' : ''} en-ink--${state.ink.tone} ${state.way === 'out' ? 'is-out' : ''} ${state.rest ? 'is-rest' : ''} ${state.hidden ? 'is-hidden' : ''}" data-accent=${state.ink.accent ?? nothing}>
      <path class="en-body en-body--in" d=${inward.body}></path>
      ${outward ? svg`<path class="en-body en-body--out" d=${outward.body}></path>` : nothing}
      ${o.heads ? svg`<path class="en-head en-head--in" d=${d} transform=${inward.head}></path>` : nothing}
      ${o.heads && outward ? svg`<path class="en-head en-head--out" d=${d} transform=${outward.head}></path>` : nothing}
    </g>`;
  }

  private houseArcs(c: Point, scene: Scene): TemplateResult {
    const inks: Record<string, Ink | undefined> = {
      solar: scene.origins.solar,
      grid: scene.origins.grid,
      battery: scene.origins.battery,
      gas: scene.nodes.find((n) => n.kind === 'generator')?.ink,
      vehicle: scene.nodes.find((n) => n.kind === 'vehicle')?.ink,
    };
    const list = arcs(houseShares(scene.allocation));
    return svg`<circle class="en-arc-track" cx=${c[0]} cy=${c[1]} r=${HOUSE_R}></circle>
      <g class="en-arcs ${scene.stale ? 'is-dim' : ''}">
        ${list.map((a) => {
          const ink = inks[a.key] ?? { tone: a.key as Ink['tone'] };
          return svg`<circle class="en-arc en-ink--${ink.tone}" data-accent=${ink.accent ?? nothing} data-empty=${a.dash.startsWith('0.00 ') ? '' : nothing} cx=${c[0]} cy=${c[1]} r=${HOUSE_R} stroke-dasharray=${a.dash} stroke-dashoffset=${a.offset} transform="rotate(-90 ${c[0]} ${c[1]})"></circle>`;
        })}
      </g>`;
  }

  private nodeIcon(n: Node, c: Point): TemplateResult {
    const active = n.lanes.some((l) => !l.rest && !l.hidden);
    return html`<div
      class="en-node ${n.dead ? 'is-outage' : ''}"
      data-accent=${n.accent ?? nothing}
      style="left:${c[0] - 22}px;top:${c[1] - 22}px"
    >
      ${ico(n.glyph, n.dead ? 'neutral' : active ? n.tone : 'neutral', {
        onTap: n.entity ? () => this.tap(n.entity, { action: 'more-info' }) : undefined,
        label: n.label,
      })}
    </div>`;
  }

  /**
   * Whether a source's lanes are the dashed hairline of a source out of reach; quiet out of reach (#126), they are the
   * lanes of a source at rest, as its circle is.
   */
  private outOfReach(n: Node): boolean {
    return n.dead && !this.looksQuiet;
  }

  private houseIcon(c: Point): TemplateResult {
    const homeId = this.config?.home;
    return html`<div class="en-node en-node--house" style="left:${c[0] - 22}px;top:${c[1] - 22}px">
      ${ico('home', 'neutral', homeId ? { onTap: () => this.tap(homeId, { action: 'more-info' }), label: s(this.hass, 'house') } : {})}
    </div>`;
  }

  private renderRows(
    scene: Scene,
    w: number,
    rows: ReturnType<typeof rowsLayout>,
    wide: boolean,
  ): TemplateResult {
    const style = this.flowStyle();
    const H = rows.height;
    const lanes =
      style === 'rail'
        ? this.railLanes(scene, rows)
        : rows.lanes.map((l) => {
            const n = scene.nodes[l.node] as Node;
            const state = n.lanes[l.index] as LaneState;
            if (this.outOfReach(n))
              return svg`<path class="en-hairline" d=${pathOf(l.path)}></path>`;
            return this.lane(l.path, state, {
              reversible: !oneWay(n.kind),
              heads: n.arrows,
              thin: style === 'legs',
            });
          });
    const out = wide
      ? rows.out.map((path, i) => {
          const c = scene.consumers[i] as Consumer;
          const state: LaneState = {
            way: 'in',
            rest: scene.stale || (c.watts ?? 0) < DEFAULT_THRESHOLD,
            hidden: false,
            watts: c.watts ?? 0,
            ink: c.accent ? { tone: 'accent', accent: c.accent } : { tone: 'home' },
          };
          return this.lane(path, state, {
            reversible: false,
            heads: true,
            thin: style !== 'stream',
          });
        })
      : [];
    return html`<div class="en-stage" style="height:${H}px">
      <svg width=${w} height=${H} viewBox="0 0 ${w} ${H}" aria-hidden="true">
        ${lanes}${out}${this.houseArcs(rows.house, scene)}
      </svg>
      <div class="en-pulses-layer" data-measure="skip" aria-hidden="true"></div>
      ${scene.nodes.map((n, i) => {
        const c = rows.nodes[i] as Point;
        const words = scene.words[i] as Words;
        return html`${this.nodeIcon(n, c)}
          <div class="en-place" style="left:${TEXT}px;top:${c[1] - blockH(words) / 2}px">
            ${renderWords(words, 'left')}
          </div>`;
      })}
      ${this.houseIcon(rows.house)}
      ${
        wide
          ? html`<div
                class="en-place"
                style="left:${rows.house[0] - 60}px;top:${rows.house[1] + 36}px;width:120px"
              >
                ${renderWords(scene.house, 'center')}
              </div>
              ${scene.consumers.map((c, i) => {
                const at = rows.consumers[i] as Point;
                const words = scene.consumerWords[i] as Words;
                return html`<div
                    class="en-node"
                    data-accent=${c.accent ?? nothing}
                    style="left:${at[0] - 22}px;top:${at[1] - 22}px"
                  >
                    ${ico(c.glyph, 'neutral', c.entity ? { onTap: () => this.tap(c.entity, { action: 'more-info' }), label: c.label } : {})}
                  </div>
                  <div class="en-place" style="right:${TEXT}px;top:${at[1] - blockH(words) / 2}px">
                    ${renderWords(words, 'right')}
                  </div>`;
              })}`
          : html`<div class="en-place" style="right:0;top:${rows.house[1] + 36}px">
              ${renderWords(scene.house, 'right')}
            </div>`
      }
    </div>`;
  }

  /** The rail: inflows join one track into the house; outflows keep a connector of their own. */
  private railLanes(scene: Scene, rows: ReturnType<typeof rowsLayout>): TemplateResult[] {
    const trackX = rows.tail + 32;
    const house = rows.house;
    const d = headPath('thin');
    const out: TemplateResult[] = [];
    let inflow = false;
    for (const l of rows.lanes) {
      const n = scene.nodes[l.node] as Node;
      const state = n.lanes[l.index] as LaneState;
      if (this.outOfReach(n)) {
        out.push(svg`<path class="en-hairline" d=${pathOf(l.path)}></path>`);
        continue;
      }
      if (state.hidden) continue;
      if (state.way === 'in') {
        if (!state.rest) inflow = true;
        out.push(
          svg`<path class="en-rail en-ink--${state.ink.tone} ${state.rest ? 'is-rest' : ''}" data-accent=${state.ink.accent ?? nothing} d=${railIn(rows.tail, l.path.a[1], trackX, house[1])}></path>`,
        );
      } else {
        const back = drawn(reverse(l.path), 'thin', n.arrows);
        out.push(svg`<g class="en-ink--${state.ink.tone}" data-accent=${state.ink.accent ?? nothing}>
          <path class="en-rail" d=${back.body}></path>
          ${n.arrows ? svg`<path class="en-head" d=${d} transform=${back.head}></path>` : nothing}
        </g>`);
      }
    }
    const track = drawn(railTrack(trackX, house), 'thin', true);
    out.push(svg`<g class="en-ink--home">
      <path class="en-rail is-track ${inflow && !scene.stale ? '' : 'is-rest'}" d=${track.body}></path>
      <path class="en-head ${inflow && !scene.stale ? '' : 'is-rest'}" d=${d} transform=${track.head}></path>
    </g>`);
    return out;
  }

  private renderCross(scene: Scene, w: number): TemplateResult {
    const g = crossLayout(w);
    const node = (kind: SourceKind): { n: Node; i: number } | undefined => {
      const i = scene.nodes.findIndex((n) => n.kind === kind);
      return i >= 0 ? { n: scene.nodes[i] as Node, i } : undefined;
    };
    const sun = node('solar');
    const grid = node('grid');
    const battery = node('battery');
    const a = scene.allocation;
    const thin = this.flowStyle() !== 'stream';
    const t = DEFAULT_THRESHOLD;
    const flows: {
      key: CrossKey;
      show: boolean;
      watts: number;
      ink: Ink | undefined;
      always: boolean;
    }[] = [
      {
        key: 'sunBattery',
        show: !!sun && !!battery,
        watts: a?.solarToBattery ?? 0,
        ink: sun?.n.ink,
        always: false,
      },
      {
        key: 'sunGrid',
        show: !!sun && !!grid,
        watts: a?.solarToGrid ?? 0,
        ink: sun?.n.ink,
        always: false,
      },
      {
        key: 'gridBattery',
        show: !!grid && !!battery,
        watts: a?.gridToBattery ?? 0,
        ink: grid?.n.ink,
        always: false,
      },
      {
        key: 'batteryGrid',
        show: !!grid && !!battery,
        watts: a?.batteryToGrid ?? 0,
        ink: battery?.n.ink,
        always: false,
      },
      { key: 'sunHouse', show: !!sun, watts: a?.usedSolar ?? 0, ink: sun?.n.ink, always: true },
      {
        key: 'batteryHouse',
        show: !!battery,
        watts: a?.usedBattery ?? 0,
        ink: battery?.n.ink,
        always: true,
      },
      { key: 'gridHouse', show: !!grid, watts: a?.usedGrid ?? 0, ink: grid?.n.ink, always: true },
    ];
    const bridge = (a?.solarToBattery ?? 0) >= t && !!sun && !!battery;
    const drawnLanes = flows
      .filter((f) => f.show && f.ink)
      .map((f) => {
        const on = f.watts >= t && !scene.stale;
        const state: LaneState = {
          way: 'in',
          rest: !on,
          hidden: !f.always && !on,
          watts: f.watts,
          ink: f.ink as Ink,
        };
        return {
          key: f.key,
          lane: this.lane(g.lanes[f.key], state, { reversible: false, heads: true, thin }),
        };
      });
    // the grid → house lane bridges the sun → battery lane: drawn over it (and its pulses) with a card-coloured edge
    const lanes = drawnLanes.filter((l) => l.key !== 'gridHouse').map((l) => l.lane);
    const bridged = drawnLanes.find((l) => l.key === 'gridHouse')?.lane;
    const H =
      Math.ceil(
        Math.max(
          g.height,
          battery ? g.battery[1] + blockH(scene.words[battery.i]) / 2 : 0,
          grid ? g.grid[1] + 30 + blockH(scene.words[grid.i]) : 0,
        ) / 4,
      ) * 4;
    const place = (
      entry: { n: Node; i: number } | undefined,
      at: Point,
      style: string,
    ): TemplateResult | typeof nothing =>
      entry
        ? html`${this.nodeIcon(entry.n, at)}
            <div class="en-place" style=${style}>
              ${renderWords(scene.words[entry.i] as Words, 'left')}
            </div>`
        : nothing;
    return html`<div class="en-stage" style="height:${H}px">
      <svg width=${w} height=${H} viewBox="0 0 ${w} ${H}" aria-hidden="true">
        ${lanes}${this.houseArcs(g.house, scene)}
      </svg>
      <div class="en-pulses-layer" data-measure="skip" aria-hidden="true"></div>
      ${
        bridged
          ? html`<svg width=${w} height=${H} viewBox="0 0 ${w} ${H}" aria-hidden="true">
                <path
                  class="en-knockout ${bridge ? '' : 'is-hidden'}"
                  d=${pathOf(g.lanes.gridHouse)}
                ></path>
                ${bridged}
              </svg>
              <div
                class="en-pulses-layer en-pulses-layer--over"
                data-measure="skip"
                aria-hidden="true"
              ></div>`
          : nothing
      }
      ${place(sun, g.sun, `left:${g.sun[0] + 34}px;top:${g.sun[1] - (sun ? blockH(scene.words[sun.i]) : 36) / 2}px`)}
      ${place(grid, g.grid, `left:0;top:${g.grid[1] + 30}px`)}
      ${place(battery, g.battery, `left:${g.battery[0] + 34}px;top:${g.battery[1] - (battery ? blockH(scene.words[battery.i]) : 36) / 2}px`)}
      ${this.houseIcon(g.house)}
      <div class="en-place" style="right:0;top:${g.house[1] + 36}px">
        ${renderWords(scene.house, 'right')}
      </div>
    </div>`;
  }

  /** Too narrow for lanes: one row per node, the direction on its own line when its line would not fit. */
  private renderList(scene: Scene, w: number): TemplateResult {
    const all = [...scene.words, scene.house];
    // below Home Assistant's own minimum a figure no longer fits beside a circle: the rows drop their circles
    const bare = all.some(
      (words) =>
        this.lineWidth(words.value, words.unit, '') > w - TEXT ||
        (words.second
          ? this.lineWidth(words.second.value, words.second.unit, '') > w - TEXT
          : false),
    );
    const room = bare ? w : w - TEXT;
    // the figures sit at the row's end: the label has the rest of the width to itself
    const line = (value: string, unit: string, way: string): TemplateResult =>
      html`<span class="en-words__value"
        >${value}${unit || way ? html`<span class="en-words__unit">${unit}${way ? ` ${way}` : ''}</span>` : nothing}</span
      >`;
    const row = (
      glyph: string,
      tone: Tone,
      accent: string | undefined,
      words: Words,
      tap: (() => void) | undefined,
      label: string,
    ): TemplateResult => {
      // "Battery · 62 %" keeps "Battery" in a narrow column: the segments after the first go before anything is cut
      const fitted = fitLine(
        words.label.split(' · ').map((text, index) => ({ text, optional: index > 0 })),
        room,
        (text) => this.head.ruler.width('en-words__label', text),
      );
      return html`<div
        class="en-list__row ${bare ? 'is-bare' : ''}"
        data-accent=${accent ?? nothing}
      >
        ${bare ? nothing : ico(glyph, tone, { onTap: tap, label })}
        <span class="en-list__label" title=${label}>${fitted}</span>
        <span class="en-list__stat ${words.dim ? 'is-dim' : ''}"
          >${line(words.value, words.unit, words.way)}${words.second
            ? line(words.second.value, words.second.unit, words.second.way)
            : nothing}</span
        >
      </div>`;
    };
    return html`<div class="en-list">
      ${scene.nodes.map((n, i) =>
        row(
          n.glyph,
          n.dead || n.lanes.every((l) => l.rest || l.hidden) ? 'neutral' : n.tone,
          n.accent,
          scene.words[i] as Words,
          n.entity ? () => this.tap(n.entity, { action: 'more-info' }) : undefined,
          n.label,
        ),
      )}
      ${row(
        'home',
        'neutral',
        undefined,
        scene.house,
        this.config?.home ? () => this.tap(this.config?.home, { action: 'more-info' }) : undefined,
        scene.house.label,
      )}
    </div>`;
  }

  /** Where it goes, when there is no room to draw it: a row per consumer, its share of the house on one scale. */
  private renderConsumerRows(scene: Scene): TemplateResult | typeof nothing {
    if (!scene.consumers.length) return nothing;
    const house = scene.houseValue;
    const w = this.contentWidth;
    // "64 % of the house", or the share alone ("64 %", tr "%64") where the words would be cut beside the figure
    const rows = scene.consumers.map((c, i) => {
      const words = scene.consumerWords[i] as Words;
      const value = words.value === '—' ? '—' : `${words.value} ${words.unit}`;
      if (!house || c.watts === null) return { c, value, share: 0, segment: null };
      const share = c.watts / house;
      const percent = Math.round(Math.min(1, share) * 100);
      const segment = {
        text: s(this.hass, 'share_of_house', { percent }),
        short: devices(this.hass, 'share', { percent }),
      };
      return { c, value, share, segment };
    });
    // the circles give way together where a share would not hold whole beside its figure, as every list's do
    const keep = this.head.rowsKeepIcon(
      w,
      rows.map(({ c, value, segment }) => ({
        title: c.label,
        value,
        ...(segment ? { sub: segment.short } : {}),
      })),
    );
    return html`<div class="ef-rows">
      ${rows.map(({ c, value, share, segment }) =>
        barRow({
          icon: keep ? c.glyph : null,
          tone: 'neutral',
          title: c.label,
          name: true,
          accent: c.accent,
          ...(segment
            ? {
                sub: this.head.fitRowSegments(
                  [segment],
                  this.head.rowRoom(w, value, { icon: keep }),
                ),
              }
            : {}),
          value,
          fraction: share,
          barTone: c.accent ? 'accent' : 'ink',
          ...(c.entity ? { onTap: () => this.tap(c.entity, { action: 'more-info' }) } : {}),
        }),
      )}
    </div>`;
  }

  /** The pulses the lanes drawn now ask for. */
  private pulseList(): Pulse[] {
    const scene = this.scene;
    if (!scene || scene.period || scene.stale || scene.empty) return [];
    const style = this.flowStyle();
    if (style === 'rail') return [];
    const layout = this.arrangement(scene);
    const thin = style === 'legs';
    const size = thin ? 'thin' : 'lane';
    const pulses: Pulse[] = [];
    const push = (
      key: string,
      path: Cubic,
      state: LaneState,
      heads: boolean,
      over = false,
    ): void => {
      if (state.rest || state.hidden || state.watts <= 0) return;
      const travelled = state.way === 'in' ? path : reverse(path);
      const lane = drawn(travelled, size, heads);
      pulses.push({
        key: `${key}-${state.way}`,
        path: travelled,
        run: lane.run,
        body: lane.body,
        watts: state.watts,
        ink: `en-ink--${state.ink.tone}`,
        accent: state.ink.accent,
        thin,
        over,
      });
    };
    const w = this.contentWidth;
    if (layout === 'cross') {
      const g = crossLayout(w);
      const a = scene.allocation;
      const ink = (kind: SourceKind): Ink | undefined =>
        scene.nodes.find((n) => n.kind === kind)?.ink;
      const lanes: [CrossKey, number, Ink | undefined][] = [
        ['sunBattery', a?.solarToBattery ?? 0, ink('solar')],
        ['sunGrid', a?.solarToGrid ?? 0, ink('solar')],
        ['gridBattery', a?.gridToBattery ?? 0, ink('grid')],
        ['batteryGrid', a?.batteryToGrid ?? 0, ink('battery')],
        ['sunHouse', a?.usedSolar ?? 0, ink('solar')],
        ['batteryHouse', a?.usedBattery ?? 0, ink('battery')],
        ['gridHouse', a?.usedGrid ?? 0, ink('grid')],
      ];
      for (const [key, value, laneInk] of lanes)
        if (laneInk && value >= DEFAULT_THRESHOLD)
          push(
            key,
            g.lanes[key],
            { way: 'in', rest: false, hidden: false, watts: value, ink: laneInk },
            true,
            key === 'gridHouse',
          );
      return pulses;
    }
    const wide = scene.consumers.length > 0 && w >= CONSUMERS_WIDE && layout === 'rows';
    if (layout !== 'rows') return [];
    const rows = rowsLayout({
      width: w,
      nodes: scene.nodes.map((n, i) => ({
        wordsH: blockH(scene.words[i]),
        wordsW: this.wordsWidth(scene.words[i] as Words),
        pair: n.pair,
      })),
      houseWordsH: 36,
      ...(wide
        ? {
            consumers: scene.consumerWords.map((cw) => ({
              wordsH: blockH(cw),
              wordsW: this.wordsWidth(cw),
            })),
          }
        : {}),
    });
    if (rows.narrow) return [];
    for (const l of rows.lanes) {
      const n = scene.nodes[l.node] as Node;
      push(`${n.key}-${l.index}`, l.path, n.lanes[l.index] as LaneState, n.arrows);
    }
    if (wide)
      rows.out.forEach((path, i) => {
        const c = scene.consumers[i] as Consumer;
        push(
          c.key,
          path,
          {
            way: 'in',
            rest: (c.watts ?? 0) < DEFAULT_THRESHOLD,
            hidden: false,
            watts: c.watts ?? 0,
            ink: c.accent ? { tone: 'accent', accent: c.accent } : { tone: 'home' },
          },
          true,
        );
      });
    return pulses;
  }
}

/* ---------- pieces ---------- */

/** A words block's height: label 16, a value line 20 each, a direction line 16 when it wraps. */
function blockH(w: Words | undefined, wraps = false): number {
  if (!w) return 36;
  return 16 + 20 + (w.second ? 20 : 0) + (wraps ? (w.way ? 16 : 0) + (w.second?.way ? 16 : 0) : 0);
}

function renderWords(w: Words, align: 'left' | 'right' | 'center', wraps = false): TemplateResult {
  const line = (value: string, unit: string, way: string): TemplateResult =>
    html`<span class="en-words__value"
        >${value}${unit || (way && !wraps) ? html`<span class="en-words__unit">${unit}${way && !wraps ? ` ${way}` : ''}</span>` : nothing}</span
      >${way && wraps ? html`<span class="en-words__dir">${way}</span>` : nothing}`;
  return html`<span class="en-words en-words--${align} ${w.dim ? 'is-dim' : ''}"
    ><span class="en-words__label" data-name>${w.label}</span>${line(w.value, w.unit, w.way)}${
      w.second ? line(w.second.value, w.second.unit, w.second.way) : nothing
    }</span
  >`;
}

/** Per-kind totals of the live readings, for the allocation. */
function totalsOf(nodes: readonly Omit<Node, 'lanes'>[]): Totals {
  const sum = (kind: SourceKind, way: 'in' | 'out'): number =>
    nodes
      .filter((n) => n.kind === kind)
      .reduce((acc, n) => acc + Math.max(0, n.reading[way] ?? 0), 0);
  return {
    solar: sum('solar', 'in'),
    fromGrid: sum('grid', 'in'),
    toGrid: sum('grid', 'out'),
    fromBattery: sum('battery', 'in'),
    toBattery: sum('battery', 'out'),
    generator: sum('generator', 'in'),
    fromVehicle: sum('vehicle', 'in'),
    toVehicle: sum('vehicle', 'out'),
  };
}

/** A period's allocation (kWh) in the card's base unit (Wh). */
const scaleAllocation = (a: Allocation, factor: number): Allocation =>
  Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, (v as number) * factor]),
  ) as unknown as Allocation;

/** The editors' contract: every key the sources list may carry. */
export const FLOW_SOURCE_KEYS = SOURCE_KEYS;
