import {
  formatNumber,
  houseZone,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';
import { houseMidnight } from '../energy-model/period.js';
import { hourlyForecast } from '../production/forecast.js';
import { houseDay, loadDay, type DayRecord } from '../production/day.js';
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
  /** Today's forecast sensor: its state is the day's total, its attributes the hours (Solcast and friends). */
  entity?: string;
  /** Tomorrow's forecast sensor, drawn as the row under today's chart. */
  tomorrow?: string;
  /** Today's production meter: what it gained so far, against the forecast. */
  actual?: string;
}

const KWH: Readonly<Record<string, number>> = { Wh: 0.001, kWh: 1, MWh: 1000, GJ: 277.778 };

const sum = (list: readonly number[]): number => list.reduce((total, value) => total + value, 0);
/** The hour of the house's day an instant falls in. */
const hourOf = (hass: HomeAssistant | undefined, at: Date): number => {
  const wall = new Date(at.getTime());
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: houseZone(hass) })
      .format(wall)
      .replace(/[^0-9]/g, ''),
  );
};

/**
 * The sun's day, forecast against what came in: today's hourly forecast and the meter's gain beside it, the day's
 * total in the head, and tomorrow as a row under them — a card for a house whose forecast integration (Solcast,
 * Open-Meteo Solar, a template) states a day's total and its hours.
 */
export class FluvyForecastCard extends Card<ForecastCardConfig> {
  static override layoutHeight(): number {
    return 292;
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
        gap: 6px;
      }
      .fc-total .fc-value {
        font-size: 32px;
        font-weight: 650;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .fc-total .fc-unit {
        font-size: 13px;
        color: var(--fluvy-text-secondary);
      }
      .fc-meta {
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
        height: 84px;
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
      .fc-act {
        background: var(--tone-ink, var(--fluvy-state-energy-solar));
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
      .fc-tomorrow {
        display: flex;
        align-items: baseline;
        gap: 8px;
        border-top: 1px solid var(--fluvy-divider, var(--fill-2));
        padding-top: 8px;
      }
      .fc-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--fluvy-text-secondary);
      }
      .fc-tomorrow .fc-value {
        font-size: 20px;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }
      .fc-peak {
        margin-inline-start: auto;
        font-size: 12px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .fc-plot--tomorrow {
        height: 44px;
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
  /** Today's meter, hour by hour: read once a day (the recorder), then again when the day turns. */
  private day: DayRecord | null | undefined = undefined;
  private readFor = '';

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const meter = this.config?.actual;
    const now = new Date();
    const key = meter ? `${meter}@${houseDay(this.hass, now)}` : '';
    if (!meter || key === this.readFor) return;
    this.readFor = key;
    this.day = undefined;
    const view = this.entity(meter);
    void loadDay(this.hass as HomeAssistant, meter, view.unit, now)
      .then((record) => {
        this.day = record;
        this.requestUpdate();
      })
      .catch(() => {
        this.day = null;
        this.requestUpdate();
      });
  }

  protected override watched(): readonly string[] {
    return [this.config?.entity ?? '', this.config?.tomorrow ?? '', this.config?.actual ?? ''].filter(
      (id) => id !== '',
    );
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return Math.ceil(FluvyForecastCard.layoutHeight() / 50);
  }

  /** Today's or tomorrow's forecast, in kWh. */
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

  /** The meter's gain so far today, in kWh, hour by hour. */
  private measured(view: string): { total: number; hours: readonly number[] } | null {
    if (!view) return null;
    const meter = this.entity(view);
    const factor = KWH[meter.unit];
    const record = this.day;
    if (record === undefined) return null;
    const hours = new Array<number>(HOURS).fill(0);
    if (record) {
      record.hours.forEach((value, hour) => {
        hours[hour] = Math.max(0, value ?? 0) * (factor ?? 0);
      });
      const hourNow = hourOf(this.hass, new Date());
      if (record.baseline !== null && meter.number !== null && factor !== undefined) {
        const gain = meter.number - record.baseline;
        hours[hourNow] = (hours[hourNow] ?? 0) + (gain >= 0 ? gain : Math.max(0, meter.number)) * factor;
      }
    }
    return { total: sum(hours), hours };
  }

  private plot(
    measuredHours: readonly number[] | null,
    forecastHours: readonly number[] | null,
    ceiling: number,
    cls = '',
  ): TemplateResult {
    const height = (value: number | undefined): string =>
      ceiling > 0 && value !== undefined ? `${Math.max(0, Math.min(100, (value / ceiling) * 100))}%` : '0%';
    return html`<div class="fc-plot ${cls}">
      ${Array.from(
        { length: HOURS },
        (_unused, hour) => html`<div class="fc-col">
          <span class="fc-act" style="height:${height(measuredHours?.[hour])}"></span>
          <span class="fc-fc" style="height:${height(forecastHours?.[hour])}"></span>
        </div>`,
      )}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const today = this.forecastOf(this.config?.entity, 0);
    const tomorrow = this.forecastOf(this.config?.tomorrow, 1);
    const measured = this.config?.actual ? this.measured(this.config.actual) : null;
    const ceiling = Math.max(0, ...(today?.hours ?? []), ...(measured?.hours ?? []));

    const title = this.config?.title ?? this.t('forecast.title');
    const sub = this.config?.subtitle ?? this.t('forecast.today');
    const fitted = this.head.fit({ width: this.contentWidth, title, sub });

    const figure = (value: number, digits = 1): string =>
      formatNumber(this.hass as HomeAssistant, value, { digits });
    const done =
      measured && today?.total && today.total > 0
        ? Math.round((measured.total / today.total) * 100)
        : null;
    const peak = tomorrow?.hours ? Math.max(...tomorrow.hours) : null;
    const peakHour =
      tomorrow?.hours && peak !== null && peak > 0 ? tomorrow.hours.indexOf(peak) : null;

    const body = today
      ? html`
          <div class="fc-total">
            <span class="fc-value">${figure(measured?.total ?? today.total ?? 0)}</span>
            <span class="fc-unit">kWh · ${measured ? this.t('forecast.actual') : this.t('forecast.expected')}</span>
          </div>
          <div class="fc-meta">
            ${this.t('forecast.expected')} ${figure(today.total ?? 0)} kWh${done !== null
              ? ` · ${done}% ${this.t('forecast.of_forecast')}`
              : ''}
          </div>
          ${this.plot(measured?.hours ?? null, today.hours, ceiling)}
          <div class="fc-axis"><span>00:00</span><span>12:00</span><span>24:00</span></div>
          ${tomorrow
            ? html`<div class="fc-tomorrow">
                <span class="fc-label">${this.t('forecast.tomorrow')}</span>
                <span class="fc-value">${figure(tomorrow.total ?? 0)} kWh</span>
                ${peak !== null && peakHour !== null
                  ? html`<span class="fc-peak"
                      >${this.t('forecast.peak')} ${figure(peak)} kW · ${String(peakHour).padStart(2, '0')}:00</span
                    >`
                  : nothing}
              </div>
              ${this.plot(null, tomorrow.hours, Math.max(peak ?? 0, 0), 'fc-plot--tomorrow')}`
            : nothing}
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
    // the config's own fields are enough for this card's editor: entity, tomorrow, actual and the head's words
    return {
      schema: [
        {
          name: 'entity',
          selector: { entity: { domain: ['sensor'] } },
        },
        {
          name: 'tomorrow',
          selector: { entity: { domain: ['sensor'] } },
        },
        {
          name: 'actual',
          selector: { entity: { domain: ['sensor'] } },
        },
      ],
    };
  }
}
