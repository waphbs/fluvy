import {
  dateFormat,
  formatNumber,
  houseZone,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head, readout, sheetStyles } from '@fluvy/ui';
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit';

import {
  AXIS_GAP,
  barGeometry,
  barPath,
  chartStyles,
  gridLines,
  labelled,
  labelsApart,
  niceTicks,
  thinStep,
  tickLabels,
  UNIT_COLUMN,
  unitLabel,
  type Placed,
} from '../chart/engine/index.js';
import { HeadFit } from '../energy/head.js';
import { houseMidnight } from '../energy-model/period.js';
import { hourlyForecast } from '../production/forecast.js';
import { Card, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import { statsRow, type StatText } from '../shared/readouts.js';

const HOUR = 3_600_000;
const MAX_DAYS = 14;
const KWH: Readonly<Record<string, number>> = { Wh: 0.001, kWh: 1, MWh: 1000, GJ: 277.778 };

/** The chart's measures, the seven-day bars' own (the two cards read alike at the same width). */
const PLOT = 132;
const VALUES = 16;
const DATES = 22;

/** A day of the days ahead: the house's day at noon, and the forecast it comes to (null when none reaches it). */
interface AheadDay {
  readonly at: Date;
  readonly label: string;
  readonly value: number | null;
}

export interface ForecastDaysCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** One sensor per day, starting today: a day's total, its hours in attributes when it has them. */
  forecast?: readonly string[];
  /** How many days from today the card draws, 1–14. */
  days?: number;
}

const sum = (list: readonly number[]): number => list.reduce((total, value) => total + value, 0);

/**
 * The days ahead, day by day: each day's forecast as a bar, from the sensors that state a day's hours
 * (`detailHourly`, `wh_hours`, `hourly`, …) or a day's total. A sensor covers the day it names, so a house with
 * today's and tomorrow's sensors sees two bars — more sensors, or an integration that states a week, fills the rest.
 *
 * The bars are drawn by the chart engine, the way the seven days behind are: a nice scale with its unit, dashed
 * gridlines, the day's figure over each bar and the dates under them, thinned to what the row holds.
 */
export class FluvyForecastDaysCard extends Card<ForecastDaysCardConfig> {
  static override layoutHeight(): number {
    return 316;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    chartStyles,
    css`
      .fd-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        /* the card holds the side padding: the chart is drawn at contentWidth, so the body must not add its own */
        padding: 0 0 16px;
      }
      .fd-chart {
        --ink: var(--tone-ink, var(--fluvy-accent));
        position: relative;
        margin-top: 12px;
        touch-action: pan-y;
        cursor: crosshair;
      }
      .fd-chart.is-scrub .fd-bar:not(.is-hover) {
        opacity: 0.4;
      }
      .fd-chart.is-scrub .fd-bar.is-empty:not(.is-hover) {
        opacity: 0.1;
      }
      .fd-bar {
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .fd-reading {
        display: flex;
        justify-content: center;
        min-height: 44px;
        margin-top: 8px;
      }
      .fd-reading--pair {
        justify-content: space-between;
        gap: 16px;
      }
      .fd-reading--pair > * {
        flex: 1 1 0;
        min-width: 0;
      }
      .fd-chart > svg {
        display: block;
        overflow: visible;
      }
      .fd-bar {
        fill: var(--hb-fill);
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: fv-grow-y 560ms var(--fv-ease-out) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + var(--bar-delay, 0ms));
      }
      .fd-bar.is-empty {
        fill: var(--ink);
        opacity: 0.25;
        animation: none;
      }
      .fd-value {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text);
        color: var(--fluvy-text);
        font-variant-numeric: tabular-nums;
      }
      .fd-date {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text-secondary);
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .fd-none {
        margin-top: 16px;
        font-size: 13px;
        color: var(--fluvy-text-secondary);
      }
    `,
  ];

  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'card_opacity',
    'card_border',
    'unavailable',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<ForecastDaysCardConfig>()([
    'title',
    'subtitle',
    'forecast',
    'days',
  ]);
  private readonly head = new HeadFit(this);
  /** The day the pointer or the finger is on, and the bars' measure to read it by. */
  private hovered: number | null = null;
  private plot = { inset: 0, slot: 1, count: 0 };

  protected override watched(): readonly string[] {
    return this.config?.forecast ?? [];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return Math.ceil(FluvyForecastDaysCard.layoutHeight() / 50);
  }

  /** How many days the card draws, within what a card can hold. */
  private get span(): number {
    const asked = this.config?.days;
    if (typeof asked !== 'number' || !Number.isFinite(asked)) return 7;
    return Math.max(1, Math.min(MAX_DAYS, Math.round(asked)));
  }

  /** The label a day wears under its bar: the house's own "Nov 5" or "11月5日". */
  private dayLabel(at: Date): string {
    const language = this.hass?.language ?? 'en';
    return dateFormat(language, { month: 'short', day: 'numeric' }).format(at);
  }

  /** A sensor's state as kWh, for the days whose sensor states the total but carries no hours. */
  private stated(id: string, at: Date, zone: string | undefined): number | null {
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
    // an empty string is a day the forecast does not reach: the bar stands hollow
    const ids = this.config?.forecast ?? [];
    const days: AheadDay[] = [];
    for (let offset = 0; offset < this.span; offset += 1) {
      const at = new Date(today + offset * 24 * HOUR + 12 * HOUR);
      // a sensor per day: today's first, tomorrow's second, "Forecast Day 3" third. A house that hands the card a
      // single sensor for several days falls back to summing whatever hours each of them carries for the day.
      let total: number | null = null;
      const forDay = ids[offset];
      if (forDay !== undefined) {
        total = forDay === '' ? null : this.stated(forDay, at, zone);
      } else {
        for (const id of ids) {
          const value = this.stated(id, at, zone);
          if (value === null) continue;
          total = (total ?? 0) + value;
        }
      }
      days.push({ at, label: this.dayLabel(at), value: total });
    }
    return days;
  }

  /**
   * The bars, drawn as the seven days behind are: a nice scale with its unit beside it and dashed gridlines across,
   * each day's forecast over its bar and the dates under them thinned to what the row holds.
   */
  private renderBars(days: readonly AheadDay[], unit: string): TemplateResult {
    const width = this.contentWidth;
    const values = days.map((day) => day.value);
    const height = VALUES + PLOT + DATES;
    const known = values.filter((v): v is number => v !== null);
    const ticks = niceTicks(Math.min(0, ...known, 0), Math.max(0, ...known, 0));
    const ruler = this.head.ruler;
    const figure = (value: number, digits = ticks.decimals): string =>
      formatNumber(this.hass as HomeAssistant, value, { digits });
    const tickTexts = ticks.ticks.map((t) => figure(t));
    const tickWidth = Math.max(0, ...tickTexts.map((t) => ruler.width('ax-tick', t)));
    const inset = (unit ? UNIT_COLUMN : 0) + tickWidth + AXIS_GAP;
    const plotWidth = Math.max(1, width - inset);
    const count = days.length;
    const { slot, bar, radius } = barGeometry(count, plotWidth);
    this.plot = { inset, slot, count };
    const span = ticks.max - ticks.min;
    const top = VALUES;
    const y = (v: number): number =>
      span > 0 ? top + PLOT - ((v - ticks.min) / span) * PLOT : top + PLOT;
    const zero = y(0);
    const clampedX = (cx: number, textWidth: number): string => {
      const half = textWidth / 2;
      return Math.max(inset + half, Math.min(width - half, cx)).toFixed(1);
    };

    // a day's figure over its bar, where the slot holds it
    const valueTexts = values.map((v) => (v === null ? '' : figure(v, 0)));
    const valuesHold =
      Math.max(0, ...valueTexts.map((t) => ruler.width('fd-value', t))) <= slot - 2;
    // the dates thinned to what the row holds
    const dateTexts = days.map((day) => day.label);
    const dateWidths = dateTexts.map((t) => ruler.width('fd-date', t));
    let dateStep = thinStep(Math.max(0, ...dateWidths), slot);
    let dated = labelled(count, dateStep);
    const placedDates = (): Placed[] =>
      dated.flatMap((on, i) =>
        on
          ? [
              {
                x: Number(clampedX(inset + i * slot + slot / 2, dateWidths[i] ?? 0)),
                width: dateWidths[i] ?? 0,
              },
            ]
          : [],
      );
    while (dateStep < count && !labelsApart(placedDates())) dated = labelled(count, ++dateStep);
    const dateY = top + PLOT + 8 + 12;

    const drawn = days.map((_day, i) => {
      const v = values[i] ?? null;
      const cx = inset + i * slot + slot / 2;
      const x = (cx - bar / 2).toFixed(1);
      const empty = v === null || v <= 0 || span === 0;
      const tall = empty ? 0 : Math.max(2, Math.round(Math.abs(y(v) - zero)));
      const hover = this.hovered === i ? 'is-hover' : '';
      const rect = empty
        ? svg`<rect class="fd-bar is-empty ${hover}" x=${x} y=${(zero - 2).toFixed(1)} width=${bar} height="2" rx=${Math.min(1, radius)}></rect>`
        : svg`<path class="fd-bar ${hover}" d=${barPath(cx - bar / 2, zero - tall, bar, tall, radius, 'top')} style="--bar-delay:${i * 18}ms"></path>`;
      const label =
        valuesHold && !empty
          ? svg`<text class="fd-value" x=${clampedX(cx, ruler.width('fd-value', valueTexts[i] ?? ''))} y=${zero - tall - 4} text-anchor="middle">${valueTexts[i]}</text>`
          : nothing;
      const date = dated[i]
        ? svg`<text class="fd-date" x=${clampedX(cx, dateWidths[i] ?? 0)} y=${dateY} text-anchor="middle">${dateTexts[i]}</text>`
        : nothing;
      return svg`${rect}${label}${date}`;
    });

    const grid = gridLines(ticks.ticks.map(y), inset, width, 'ax-grid');
    const axis = svg`${tickLabels(
      ticks.ticks.map((t, i) => [y(t), tickTexts[i] ?? ''] as const),
      inset - AXIS_GAP,
    )}${unit ? unitLabel(unit, top, top + PLOT) : nothing}`;

    return html`<div
      class="fd-chart ${this.hovered !== null ? 'is-scrub' : ''}"
      @pointermove=${this.onPoint}
      @pointerdown=${this.onPoint}
      @pointerleave=${this.onLeave}
    >
      <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}" data-measure="drawn">
        <g style="--hb-fill:var(--ink)">${grid}${axis}${drawn}</g>
      </svg>
    </div>`;
  }

  /** The bar under the pointer, from the chart's own measure. */
  private indexAt(event: PointerEvent): number | null {
    const box = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    if (!box) return null;
    const { inset, slot, count } = this.plot;
    if (count <= 0 || slot <= 0) return null;
    const index = Math.floor((event.clientX - box.left - inset) / slot);
    return index >= 0 && index < count ? index : null;
  }

  private readonly onPoint = (event: PointerEvent): void => {
    const index = this.indexAt(event);
    if (index === this.hovered) return;
    this.hovered = index;
    this.requestUpdate();
  };

  private readonly onLeave = (event: PointerEvent): void => {
    // a finger lifting is a pointer leaving too: the day it picked stays read, as the hour card's does
    if (event.pointerType === 'touch') return;
    if (this.hovered === null) return;
    this.hovered = null;
    this.requestUpdate();
  };

  protected renderCard(): TemplateResult {
    const hass = this.hass as HomeAssistant | undefined;
    const days = this.ahead();
    const known = days.filter((day) => day.value !== null);
    const figure = (value: number, digits = 1): string =>
      formatNumber(hass as HomeAssistant, value, { digits });

    const title = this.config?.title ?? this.t('forecast.days_title').replace('{n}', String(this.span));
    const sub = this.config?.subtitle ?? this.t('forecast.days_sub');
    const fitted = this.head.fit({ width: this.contentWidth, title, sub });

    const ceiling = Math.max(...known.map((day) => day.value ?? 0), 0);
    const floor = known.length ? Math.min(...known.map((day) => day.value ?? 0)) : 0;
    const stats: StatText[] = [
      {
        label: this.t('forecast.days_best'),
        value: known.length ? figure(ceiling) : '—',
        unit: known.length ? 'kWh' : '',
      },
      {
        label: this.t('forecast.days_worst'),
        value: known.length ? figure(floor) : '—',
        unit: known.length ? 'kWh' : '',
      },
      {
        label: this.t('forecast.days_average'),
        value: known.length ? figure(sum(known.map((day) => day.value ?? 0)) / known.length) : '—',
        unit: known.length ? 'kWh' : '',
      },
    ];
    const row = statsRow(this.head.ruler, this.contentWidth, stats);
    const under = this.hovered === null ? undefined : days[this.hovered];
    const total = sum(known.map((day) => day.value ?? 0));
    // the row over the chart: the week's own after all, the day under the pointer while it is held — the strip
    // under the chart keeps the week's high, low and average either way
    const reading =
      under && under.value !== null
        ? html`<div class="fd-reading">
            ${readout({
              label: under.label,
              value: figure(under.value),
              unit: 'kWh',
              size: 'm',
            })}
          </div>`
        : html`<div class="fd-reading fd-reading--pair">
            ${readout({ label: this.t('forecast.days_total'), value: figure(total), unit: 'kWh', size: 'm' })}
            ${readout({
              label: this.t('forecast.days_average'),
              value: figure(known.length ? total / known.length : 0),
              unit: 'kWh',
              size: 'm',
            })}
          </div>`;

    const body = known.length
      ? html`
          ${reading}
          ${this.renderBars(days, 'kWh')}
          <div
            class="so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}"
            style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
          >
            ${stats.map((stat) => readout({ ...stat, size: row.size }))}
          </div>
        `
      : html`<div class="fd-none">${this.t('forecast.days_none')}</div>`;

    return html`<article class="fv-card fd-card">
      ${head({
        icon: this.config?.icon ?? 'fluvy:sun',
        tone: 'accent',
        title,
        sub: fitted.sub,
        trailing: fitted.badge ?? nothing,
        name: Boolean(this.config?.title),
      })}
      <div class="fd-body">${body}</div>
    </article>`;
  }

  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        {
          name: 'forecast',
          selector: { entity: { domain: ['sensor'], multiple: true } },
        },
        { name: 'days', selector: { number: { min: 1, max: MAX_DAYS, mode: 'box' } } },
      ],
    };
  }
}
