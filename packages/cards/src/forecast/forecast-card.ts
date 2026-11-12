import {
  clock12,
  dateFormat,
  formatNumber,
  houseZone,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { axis, head, readout, sheetStyles } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';
import { houseMidnight } from '../energy-model/period.js';
import { hourlyForecast } from '../production/forecast.js';
import { Card, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import { statsRow, type StatText } from '../shared/readouts.js';

const HOUR = 3_600_000;
const HOURS = 24;
/** Below this the axis keeps its first, middle and last hour, as the production card's does. */
const AXIS_FULL = 240;

/** A day's forecast: the total its state says, and its hours when its attributes carry them. */
interface DayForecast {
  readonly total: number | null;
  /** kWh per hour of the house's day, 24 of them; null without hourly attributes. */
  readonly hours: readonly number[] | null;
  readonly unit: string;
}

export interface ForecastCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** Today's forecast sensor — kept so a strategy that passes it stays valid; the card draws tomorrow. */
  entity?: string;
  /** Tomorrow's forecast sensor: its state is the day's total, its attributes the hours (Solcast and friends). */
  tomorrow?: string;
  /** Kept for older configs; tomorrow's forecast needs no meter. */
  actual?: string;
}

const KWH: Readonly<Record<string, number>> = { Wh: 0.001, kWh: 1, MWh: 1000, GJ: 277.778 };

const sum = (list: readonly number[]): number => list.reduce((total, value) => total + value, 0);

/**
 * Tomorrow, and only tomorrow: the day's total, its peak hour, and the shape of the day as 24 bars — a card for a
 * house whose forecast integration (Solcast, Open-Meteo Solar, a template) states a day's total and its hours.
 *
 * Today's forecast is already drawn by the production card, next to the meter's actual gain, so this card leaves it
 * out instead of saying the same numbers twice.
 */
export class FluvyForecastCard extends Card<ForecastCardConfig> {
  static override layoutHeight(): number {
    return 232;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      .fc-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 16px 16px;
      }
      .fc-when {
        margin-inline-start: auto;
        align-self: flex-end;
        padding-block-end: 6px;
        font-size: 12px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .fc-plot {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        align-items: end;
        gap: 2px;
        height: 80px;
        cursor: crosshair;
        touch-action: pan-y;
      }
      .fc-col {
        display: flex;
        align-items: flex-end;
        gap: 1px;
        height: 100%;
        min-width: 0;
      }
      .fc-col > span {
        flex: 1 1 0;
        min-width: 0;
        border-radius: 2px 2px 0 0;
      }
      .fc-fc {
        background: color-mix(in srgb, var(--tone-ink, var(--fluvy-state-energy-solar)) 26%, transparent);
      }
      .fc-fc.is-on {
        background: var(--tone-ink, var(--fluvy-state-energy-solar));
      }
      .fc-none {
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
  static override keys = configKeys<ForecastCardConfig>()(['title', 'subtitle', 'tomorrow', 'actual']);
  private readonly head = new HeadFit(this);
  /** The hour a pointer (or a tap) is on: its forecast in the line instead of the day's total. */
  private hoveredHour: number | null = null;

  /** The hour a pointer at `event` is over, or null when the plot has no width. */
  private hourAt(event: PointerEvent): number | null {
    const plot = event.currentTarget as HTMLElement | null;
    const rect = plot?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const fraction = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(HOURS - 1, Math.floor(fraction * HOURS)));
  }

  private point(hour: number | null): void {
    if (hour === this.hoveredHour) return;
    this.hoveredHour = hour;
    this.requestUpdate();
  }

  protected override watched(): readonly string[] {
    const id = this.config?.tomorrow ?? '';
    return id === '' ? [] : [id];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return Math.ceil(FluvyForecastCard.layoutHeight() / 50);
  }

  private get hour12(): boolean {
    return clock12(this.hass);
  }

  /** The day this card draws, as the house writes a date: "11月13日" or "Nov 13". */
  private dayLabel(): string {
    const hass = this.hass as HomeAssistant | undefined;
    const at = new Date(houseMidnight(hass as HomeAssistant, new Date()).getTime() + 24 * HOUR + 12 * HOUR);
    return dateFormat(hass?.language ?? 'en', { month: 'short', day: 'numeric' }).format(at);
  }

  /** "12:00" on a 24 h clock, "12 PM" on a 12 h one: the same words the production card's axis uses. */
  private hourLabel(hour: number): string {
    if (!this.hour12) return `${String(hour).padStart(2, '0')}:00`;
    return dateFormat(this.hass?.language ?? 'en', { hour: 'numeric', hour12: true }).format(
      new Date(2026, 0, 1, hour % 24),
    );
  }

  /** Tomorrow's forecast, in kWh. */
  private forecastOf(id: string | undefined, dayOffset: number): DayForecast | null {
    if (!id) return null;
    const view = this.entity(id);
    if (view.status !== 'ok') return null;
    const now = new Date();
    const at = new Date(houseMidnight(this.hass as HomeAssistant, now).getTime() + dayOffset * 24 * HOUR + 12 * HOUR);
    const hourly = hourlyForecast(view, at, houseZone(this.hass as HomeAssistant));
    const factor = KWH[view.unit];
    const total = view.number !== null && factor !== undefined ? view.number * factor : null;
    const hours =
      hourly && KWH[hourly.unit] !== undefined
        ? hourly.hours.map((value) => value * (KWH[hourly.unit] as number))
        : null;
    return { total: total ?? (hours ? sum(hours) : null), hours, unit: 'kWh' };
  }

  private plot(forecastHours: readonly number[] | null, ceiling: number): TemplateResult {
    const height = (value: number | undefined): string =>
      ceiling > 0 && value !== undefined ? `${Math.max(0, Math.min(100, (value / ceiling) * 100))}%` : '0%';
    return html`<div
      class="fc-plot"
      @pointermove=${(event: PointerEvent) => {
        if (event.pointerType !== 'touch') this.point(this.hourAt(event));
      }}
      @pointerdown=${(event: PointerEvent) => {
        const hour = this.hourAt(event);
        this.point(event.pointerType === 'touch' && hour === this.hoveredHour ? null : hour);
      }}
      @pointerleave=${(event: PointerEvent) => {
        // a finger lifts off the bar it tapped: the hour it picked stays, a mouse leaving does not
        if (event.pointerType !== 'touch') this.point(null);
      }}
    >
      ${Array.from(
        { length: HOURS },
        (_unused, hour) => html`<div class="fc-col">
          <span
            class="fc-fc ${this.hoveredHour === hour ? 'is-on' : ''}"
            style="height:${height(forecastHours?.[hour])}"
          ></span>
        </div>`,
      )}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const tomorrow = this.forecastOf(this.config?.tomorrow, 1);

    const title = this.config?.title ?? this.t('forecast.title');
    const sub = this.config?.subtitle ?? this.t('forecast.tomorrow');
    const fitted = this.head.fit({ width: this.contentWidth, title, sub });

    const figure = (value: number, digits = 1): string =>
      formatNumber(this.hass as HomeAssistant, value, { digits });
    const peak = tomorrow?.hours ? Math.max(...tomorrow.hours) : null;
    const peakHour =
      tomorrow?.hours && peak !== null && peak > 0 ? tomorrow.hours.indexOf(peak) : null;
    // the hours the sun is expected to reach the panels: the same fact the production card calls sun hours
    const sunHours = tomorrow?.hours ? tomorrow.hours.filter((value) => value > 0.05).length : null;
    const ceiling = Math.max(peak ?? 0, 0);
    // the line reads the hour a pointer is on, or the day's total when it is elsewhere
    const hour = this.hoveredHour !== null && tomorrow?.hours ? this.hoveredHour : null;
    const shown = hour !== null && tomorrow?.hours ? (tomorrow.hours[hour] ?? 0) : (tomorrow?.total ?? 0);

    const body = tomorrow
      ? (() => {
          const lastHour = this.hour12 ? this.hourLabel(24) : '24:00';
          const ticks: [number, string][] = [
            [0, this.hourLabel(0)],
            [6 / HOURS, this.hourLabel(6)],
            [0.5, this.hourLabel(12)],
            [18 / HOURS, this.hourLabel(18)],
            [1, lastHour],
          ];
          const narrowTicks: [number, string][] = [
            [0, this.hourLabel(0)],
            [0.5, this.hourLabel(12)],
            [1, lastHour],
          ];
          const stats: StatText[] = [
            { label: this.t('forecast.peak'), value: peak !== null ? figure(peak) : '—', unit: 'kWh' },
            {
              label: this.t('forecast.peak_at'),
              value: peakHour !== null ? this.hourLabel(peakHour) : '—',
            },
            {
              label: this.t('forecast.sun_hours'),
              value: sunHours !== null ? String(sunHours) : '—',
              unit: sunHours !== null ? this.t('forecast.hours_unit') : '',
            },
          ];
          const row = statsRow(this.head.ruler, this.contentWidth, stats);
          return html`
            <div class="fc-top fv-value-row">
              ${hour !== null
                ? readout({
                    label: `${this.hourLabel(hour)} – ${this.hourLabel(hour + 1)}`,
                    value: figure(shown),
                    unit: 'kWh',
                    size: this.contentWidth < AXIS_FULL ? 'm' : 'l',
                  })
                : readout({
                    label: this.t('forecast.expected'),
                    value: figure(shown),
                    unit: 'kWh',
                    size: this.contentWidth < AXIS_FULL ? 'm' : 'l',
                  })}
              <span class="fc-when">${this.dayLabel()}</span>
            </div>
            ${this.plot(tomorrow.hours, ceiling)}
            ${axis(this.contentWidth < AXIS_FULL ? narrowTicks : ticks)}
            <div
              class="so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}"
              style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
            >
              ${stats.map((stat) => readout({ ...stat, size: row.size }))}
            </div>
          `;
        })()
      : html`<div class="fc-none">${this.t('forecast.none')}</div>`;

    return html`<article class="fv-card fc-card">
      ${head({
        icon: this.config?.icon ?? 'fluvy:sun',
        tone: 'accent',
        title,
        sub: fitted.sub,
        trailing: fitted.badge ?? nothing,
        name: Boolean(this.config?.title),
      })}
      <div class="fc-body">${body}</div>
    </article>`;
  }

  static override getConfigForm(): LovelaceConfigForm {
    // the config's own fields are enough for this card's editor: tomorrow's sensor and the head's words
    return {
      schema: [
        {
          name: 'tomorrow',
          selector: { entity: { domain: ['sensor'] } },
        },
      ],
    };
  }
}
