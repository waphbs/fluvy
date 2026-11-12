import {
  formatNumber,
  houseZone,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';
import { houseMidnight } from '../energy-model/period.js';
import { hourlyForecast } from '../production/forecast.js';
import { Card, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';

const HOUR = 3_600_000;
const HOURS = 24;

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
    return 176;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      .fc-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 16px 16px;
      }
      .fc-total {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .fc-total .fc-value {
        font-size: 28px;
        font-weight: 650;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .fc-total .fc-unit {
        font-size: 13px;
        color: var(--fluvy-text-secondary);
      }
      .fc-peak {
        margin-inline-start: auto;
        font-size: 12px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .fc-plot {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        align-items: end;
        gap: 2px;
        height: 44px;
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
      .fc-axis {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--fluvy-text-secondary);
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
    return html`<div class="fc-plot">
      ${Array.from(
        { length: HOURS },
        (_unused, hour) => html`<div class="fc-col">
          <span class="fc-fc" style="height:${height(forecastHours?.[hour])}"></span>
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
    const ceiling = Math.max(peak ?? 0, 0);

    const body = tomorrow
      ? html`
          <div class="fc-total">
            <span class="fc-value">${figure(tomorrow.total ?? 0)}</span>
            <span class="fc-unit">kWh</span>
            ${peak !== null && peakHour !== null
              ? html`<span class="fc-peak"
                  >${this.t('forecast.peak')} ${figure(peak)} kW · ${String(peakHour).padStart(2, '0')}:00</span
                >`
              : nothing}
          </div>
          ${this.plot(tomorrow.hours, ceiling)}
          <div class="fc-axis"><span>00:00</span><span>12:00</span><span>24:00</span></div>
        `
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
