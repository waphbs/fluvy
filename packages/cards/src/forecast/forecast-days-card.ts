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
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';
import { houseMidnight } from '../energy-model/period.js';
import { hourlyForecast } from '../production/forecast.js';
import { Card, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import { statsRow, type StatText } from '../shared/readouts.js';

const HOUR = 3_600_000;
const MAX_DAYS = 14;
const KWH: Readonly<Record<string, number>> = { Wh: 0.001, kWh: 1, MWh: 1000, GJ: 277.778 };

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
 * (`detailHourly`, `wh_hours`, `hourly`, …). A sensor covers the day it names, so a house with today's and
 * tomorrow's sensors sees two bars — more sensors, or an integration that states a week, fills the rest.
 */
export class FluvyForecastDaysCard extends Card<ForecastDaysCardConfig> {
  static override layoutHeight(): number {
    return 300;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      .fd-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 16px 16px;
      }
      .fd-plot {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        align-items: end;
        gap: 4px;
        height: 132px;
      }
      .fd-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-width: 0;
        height: 100%;
      }
      .fd-value {
        font-size: 11px;
        font-weight: 600;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        min-height: 14px;
      }
      .fd-bar {
        width: 100%;
        max-width: 26px;
        border-radius: 3px 3px 0 0;
        background: var(--tone-ink, var(--fluvy-state-energy-solar));
        min-height: 2px;
      }
      .fd-col.is-empty .fd-bar {
        background: color-mix(in srgb, var(--fluvy-text-secondary) 22%, transparent);
        max-width: 14px;
        height: 2px !important;
      }
      .fd-date {
        font-size: 10px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .fd-none {
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
    const height = (value: number | null): string =>
      value === null || ceiling <= 0
        ? '0%'
        : `${Math.max(2, Math.min(100, (value / ceiling) * 100))}%`;

    const stats: StatText[] = [
      {
        label: this.t('forecast.days_total'),
        value: known.length ? figure(sum(known.map((day) => day.value ?? 0))) : '—',
        unit: known.length ? 'kWh' : '',
      },
      {
        label: this.t('forecast.days_average'),
        value: known.length ? figure(sum(known.map((day) => day.value ?? 0)) / known.length) : '—',
        unit: known.length ? 'kWh' : '',
      },
      {
        label: this.t('forecast.days_best'),
        value: known.length ? figure(ceiling) : '—',
        unit: known.length ? 'kWh' : '',
      },
    ];
    const row = statsRow(this.head.ruler, this.contentWidth, stats);

    const body = known.length
      ? html`
          <div class="fd-plot">
            ${days.map(
              (day, index) => html`<div class="fd-col ${day.value === null ? 'is-empty' : ''}">
                <span class="fd-value">${day.value === null ? '' : figure(day.value, 0)}</span>
                <span class="fd-bar" style="height:${height(day.value)}"></span>
                <span class="fd-date"
                  >${index % 2 === 0 || index === days.length - 1 ? day.label : ''}</span
                >
              </div>`,
            )}
          </div>
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
