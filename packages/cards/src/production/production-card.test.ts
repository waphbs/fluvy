// @vitest-environment happy-dom
import {
  CHART_DEFAULTS,
  setChartDefaults,
  type HaFormSchemaItem,
  type HomeAssistant,
} from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { fitSet } from '../chart/engine/index.js';
import { familiesDefined } from '../index.js';
import { FluvyProductionCard, type ProductionCardConfig } from './production-card.js';

// the energy family lands with the index: the card's tag is defined before a page needs it
await familiesDefined;

/** The house's moment, in UTC (the house's zone): 14:30, the day's fourteenth hour in progress. */
const NOW = '2026-09-17T14:30:00Z';
const MIDNIGHT = Date.parse('2026-09-17T00:00:00Z');
const HOUR = 3_600_000;
/** A sunny day's hours so far (kWh): nothing before six, a peak at noon. */
const DAY = [0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.9, 1.4, 1.8, 2.1, 2.3, 2.0];

const meter = (name: string, state: number) => ({
  entity_id: name,
  state: String(state),
  attributes: {
    friendly_name: name,
    unit_of_measurement: 'kWh',
    device_class: 'energy',
    state_class: 'total_increasing',
  },
  last_changed: '',
  last_updated: '',
});

/** A house whose recorder keeps every meter's hours (the day's, the second roof's at half of it), each read a little past its last hour now. */
const house = (): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24', time_zone: 'server' },
    config: { time_zone: 'UTC' },
    themes: { darkMode: false },
    states: {
      'sensor.pv': meter('sensor.pv', 103.4),
      'sensor.east': meter('sensor.east', 103.3),
      'sensor.west': meter('sensor.west', 96.6),
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    callWS: async (message: Record<string, unknown>) => {
      const id = (message['statistic_ids'] as string[] | undefined)?.[0] ?? '';
      const share = id === 'sensor.west' ? 0.5 : 1;
      let state = 90;
      const rows = [-1, ...DAY.keys()].map((hour) => {
        const change = hour < 0 ? 0 : (DAY[hour] ?? 0) * share;
        state += change;
        return { start: MIDNIGHT + hour * HOUR, change, state };
      });
      return { [id]: rows };
    },
    callService: async () => undefined,
  }) as unknown as HomeAssistant;

const settle = async (card: FluvyProductionCard): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await card.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

async function mount(config: Partial<ProductionCardConfig>): Promise<FluvyProductionCard> {
  const card = document.createElement('fluvy-production-card') as FluvyProductionCard;
  card.setConfig({
    type: 'custom:fluvy-production-card',
    entity: 'sensor.pv',
    _now: NOW,
    ...config,
  });
  card.hass = house();
  document.body.append(card);
  await settle(card);
  return card;
}

const ARRAYS = { arrays: ['sensor.east', 'sensor.west'] };

afterEach(() => document.body.replaceChildren());

describe('the production card’s bars, in their styles', () => {
  it('draws classic as 1.10 did: the day’s bars, and the arrays’ stacks', async () => {
    const day = await mount({});
    const arrays = await mount(ARRAYS);
    // recorded on 1.10's card: each hour's bar, and each array's rectangle in its hour
    expect({
      day: [...day.shadowRoot!.querySelectorAll('.so-bar__fill')].map((b) =>
        b.getAttribute('style'),
      ),
      arrays: [...arrays.shadowRoot!.querySelectorAll('.pr-chart rect')].map((r) =>
        ['class', 'x', 'y', 'width', 'height', 'rx'].map((key) => r.getAttribute(key)).join(' '),
      ),
    }).toMatchSnapshot();
  });

  it('draws soft through the engine: an hour a bar, the best one in the ink and the rest quiet, now marked', async () => {
    const card = await mount({ chart: 'soft' });
    const root = card.shadowRoot!;
    expect(root.querySelector('.so-bars')).toBeNull();
    const bars = root.querySelectorAll('.pr-chart .fc-bar');
    // the finished hours with something in them, and the one in progress
    expect(bars.length).toBe(DAY.filter((kwh) => kwh > 0).length + 1);
    expect(root.querySelectorAll('.pr-chart .fc-bar--quiet').length).toBe(bars.length - 1);
    expect(root.querySelector('.pr-chart .fc-now')).not.toBeNull();
  });

  it('stacks the arrays as columns in the series’ colours, their legend’s squares in them', async () => {
    const card = await mount({ ...ARRAYS, chart: 'columns' });
    const root = card.shadowRoot!;
    const inks = [...root.querySelectorAll('.pr-chart g[style]')].map((g) =>
      g.getAttribute('style'),
    );
    expect(new Set(inks)).toEqual(
      new Set(['--tone-ink:var(--fluvy-graph-1)', '--tone-ink:var(--fluvy-graph-2)']),
    );
    expect(
      [...root.querySelectorAll('.pr-legend .en-sq')].map((sq) => sq.getAttribute('style')),
    ).toEqual([
      '--tone-ink:var(--fluvy-graph-1);background:var(--tone-ink)',
      '--tone-ink:var(--fluvy-graph-2);background:var(--tone-ink)',
    ]);
  });

  it('wears the house’s own set where it names one: each column and its square the set’s colour fitted to each mode', async () => {
    const colours = ['#1e3a8a', '#f4e9d0', '#15803d', '#b91c1c', '#7e22ce', '#0f766e'] as const;
    setChartDefaults({
      settings: { ...CHART_DEFAULTS, style: 'columns', series: 'mine' },
      sets: [{ id: 'mine', name: 'Mine', colours }],
    });
    try {
      const root = (await mount(ARRAYS)).shadowRoot!;
      // no look runs here: the set is worn on the default palette
      const { light, dark } = fitSet(colours, 'linen');
      const worn = (n: number) => `--fc-light:${light[n]};--fc-dark:${dark[n]}`;
      expect(
        new Set(
          [...root.querySelectorAll('.pr-chart g.fc-set')].map((g) => g.getAttribute('style')),
        ),
      ).toEqual(new Set([worn(0), worn(1)]));
      expect(
        [...root.querySelectorAll('.pr-legend .en-sq.fc-set')].map((sq) =>
          sq.getAttribute('style'),
        ),
      ).toEqual([`${worn(0)};background:var(--tone-ink)`, `${worn(1)};background:var(--tone-ink)`]);
      // the navy lifted for the dark card, the cream deepened for the light one
      expect([dark[0] !== colours[0], light[1] !== colours[1]]).toEqual([true, true]);
    } finally {
      setChartDefaults({ settings: CHART_DEFAULTS, sets: [] });
    }
  });

  it('draws the arrays classic where the house is soft: soft is one meter’s', async () => {
    const card = await mount({ ...ARRAYS, chart: 'soft' });
    expect(card.shadowRoot!.querySelector('.pr-chart .fc-bar')).toBeNull();
    expect(card.shadowRoot!.querySelectorAll('.pr-chart rect.en-bar').length).toBeGreaterThan(0);
  });
});

describe('the production card’s editor', () => {
  const section = (FluvyProductionCard.getConfigForm().schema as HaFormSchemaItem[]).find(
    (item) => item.type === 'expandable' && item.schema?.some((field) => field.name === 'chart'),
  ) as HaFormSchemaItem;
  const fields = (schema: readonly HaFormSchemaItem[]): HaFormSchemaItem[] =>
    schema.flatMap((item) => (item.schema ? fields(item.schema) : [item]));
  const shown = (data: Record<string, unknown>): string[] =>
    (section.schema ?? [])
      .filter((item) => !item.when || item.when(data))
      .flatMap((item) => fields([item]).filter((field) => !field.when || field.when(data)))
      .map(
        (field) =>
          `${field.name}${field.name === 'chart' ? `:${(field.selector as { select: { options: { value: string }[] } }).select.options.map((o) => o.value).join(',')}` : ''}`,
      );

  it('offers one meter classic, soft and columns, the arrays classic and columns, a highlight to soft alone', () => {
    expect(shown({})).toEqual(['chart:classic,soft,columns', 'animate']);
    expect(shown({ chart: 'soft' })).toEqual([
      'chart:classic,soft,columns',
      'show_now',
      'highlight',
      'animate',
    ]);
    expect(shown({ ...ARRAYS, chart: 'columns' })).toEqual([
      'chart:classic,columns',
      'show_now',
      'animate',
    ]);
  });
});

describe('the production card reads a lifetime meter’s day', () => {
  /** The day's hours from yesterday's last reading, 12,332.2: 11.0 kWh compiled to 12,343.2, the meter read `live` now. */
  async function lifetime(live: number, config: Partial<ProductionCardConfig> = {}) {
    const LIFETIME = 12_242.2;
    const hass = house();
    hass.states['sensor.lifetime'] = meter('sensor.lifetime', live);
    hass.states['sensor.east'] = meter('sensor.east', live);
    const counted = hass.callWS.bind(hass);
    hass.callWS = (async (message: { type: string; [key: string]: unknown }) => {
      const rows = await counted<Record<string, { state: number }[]>>(message);
      return Object.fromEntries(
        Object.entries(rows).map(([id, list]) => [
          id,
          list.map((row) => ({ ...row, state: row.state + LIFETIME })),
        ]),
      );
    }) as HomeAssistant['callWS'];
    const card = document.createElement('fluvy-production-card') as FluvyProductionCard;
    // as the automatic dashboard writes it
    card.setConfig({
      type: 'custom:fluvy-production-card',
      entity: 'sensor.lifetime',
      _now: NOW,
      ...config,
    });
    card.hass = hass;
    document.body.append(card);
    await settle(card);
    return card.shadowRoot!;
  }
  const figure = (root: ShadowRoot, selector = '.so-top .fv-readout__value') =>
    root.querySelector(selector)?.textContent?.replace(/\s+/g, '');

  it('reads today’s gain from a meter that counts a lifetime, never its reading (#170: the energy dashboard’s solar meter)', async () => {
    const root = await lifetime(12_345.6);
    expect(figure(root)).toBe('13.4kWh');
    expect(root.textContent).not.toMatch(/12[,.]?34[0-9]/);
  });

  it('reads a lifetime meter a hair under its last hour as no gain yet, never as a reset worth its whole reading', async () => {
    // 12,343.1 now against 12,343.2 at the hour: a dip, not 12,343.1 kWh more
    const root = await lifetime(12_343.1);
    expect(figure(root)).toBe('11.0kWh');
    expect(root.textContent).not.toMatch(/12[,.]?3[0-9]{3}/);
    const arrays = await lifetime(12_343.1, { arrays: ['sensor.east'] });
    expect(figure(arrays, '.pr-legend .en-legend__value')).toBe('11.0kWh');
  });
});

describe('the production card’s several arrays (#183)', () => {
  const head = (card: FluvyProductionCard) =>
    card.shadowRoot!.querySelector('.so-top .fv-readout__value')?.textContent?.replace(/\s+/g, '');
  const legend = (card: FluvyProductionCard) =>
    [...card.shadowRoot!.querySelectorAll('.pr-legend .en-legend__value')].map((v) =>
      v.textContent?.replace(/\s+/g, ''),
    );

  it('says the arrays’ day together where its meter is one of them, a meter of its own its own', async () => {
    // east: 11.0 kWh compiled and 2.3 since; west: half of it, 5.5 and 1.1
    const both = await mount({ entity: 'sensor.east', ...ARRAYS });
    expect(legend(both)).toEqual(['13.3kWh', '6.6kWh']);
    expect(head(both)).toBe('19.9kWh');
    const own = await mount(ARRAYS);
    expect(head(own)).toBe('13.4kWh');
  });

  it('counts every array in its day past four, and draws four stacks: the fourth is the rest’s, “Other”', async () => {
    // six arrays of 13.3 kWh each (the strategy writes every solar meter): 1.20 counted the first four
    const ids = ['sensor.a', 'sensor.b', 'sensor.c', 'sensor.d', 'sensor.e', 'sensor.f'];
    const card = document.createElement('fluvy-production-card') as FluvyProductionCard;
    card.setConfig({
      type: 'custom:fluvy-production-card',
      entity: 'sensor.a',
      arrays: ids,
      _now: NOW,
    });
    const hass = house();
    card.hass = {
      ...hass,
      states: { ...hass.states, ...Object.fromEntries(ids.map((id) => [id, meter(id, 103.3)])) },
    } as HomeAssistant;
    document.body.append(card);
    await settle(card);
    expect(head(card)).toBe('79.8kWh');
    expect(legend(card)).toEqual(['13.3kWh', '13.3kWh', '13.3kWh', '39.9kWh']);
    const names = [...card.shadowRoot!.querySelectorAll('.pr-legend .en-legend__text')].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(['sensor.a', 'sensor.b', 'sensor.c', 'Other']);
    // four stacks an hour: the ramp's four steps
    const steps = new Set(
      [...card.shadowRoot!.querySelectorAll('.pr-chart rect.en-bar')].map((r) => r.classList[1]),
    );
    expect([...steps].sort()).toEqual(['is-fourth', 'is-second', 'is-third', undefined].sort());
    // and it declares the legend it draws: a fourth array's long name folds four into two by two, "Other" does not
    const garage = { entity: 'sensor.d', name: 'The garage roof over the street' };
    const four = ['sensor.a', 'sensor.b', 'sensor.c', garage];
    const height = (arrays: NonNullable<ProductionCardConfig['arrays']>) =>
      FluvyProductionCard.layoutHeight({ type: '', arrays });
    expect(height(four)).toBeGreaterThan(height(four.slice(0, 3)));
    expect(height([...four, 'sensor.e'])).toBe(
      height([...four.slice(0, 3), { entity: 'sensor.e', name: 'Other' }]),
    );
  });
});

/** An hour of the house's day, `days` after today, as an integration writes it. */
const hourAt = (days: number, hour: number): string =>
  new Date(MIDNIGHT + (days * 24 + hour) * HOUR).toISOString();
/** A clear day's forecast in Wh, 06:00 to 19:00: 18,400 in all. */
const CLEAR = [100, 400, 900, 1500, 2000, 2400, 2600, 2500, 2200, 1700, 1200, 600, 250, 50];
/** A forecast from today on, each day a share of a clear one. */
const forecastOf = (days: readonly number[]): Record<string, number> =>
  Object.fromEntries(
    days.flatMap((share, day) => CLEAR.map((wh, i) => [hourAt(day, 6 + i), wh * share])),
  );

/**
 * A house whose Energy dashboard links forecasts to the meter (each entry's Wh by the hour), which keeps what it was
 * asked.
 */
const forecastHouse = (
  entries: Record<string, Record<string, number>>,
  asked: string[] = [],
): HomeAssistant => {
  const hass = house();
  const statistics = hass.callWS.bind(hass);
  hass.callWS = (async (message: { type: string; [key: string]: unknown }) => {
    asked.push(message.type);
    if (message.type === 'energy/get_prefs')
      return {
        energy_sources: [
          {
            type: 'solar',
            stat_energy_from: 'sensor.pv',
            config_entry_solar_forecast: Object.keys(entries),
          },
        ],
      };
    if (message.type === 'energy/solar_forecast')
      return Object.fromEntries(
        Object.entries(entries).map(([id, hours]) => [id, { wh_hours: hours }]),
      );
    return statistics(message);
  }) as HomeAssistant['callWS'];
  return hass;
};

async function mountIn(
  hass: HomeAssistant,
  config: Partial<ProductionCardConfig>,
): Promise<FluvyProductionCard> {
  const card = document.createElement('fluvy-production-card') as FluvyProductionCard;
  card.setConfig({
    type: 'custom:fluvy-production-card',
    entity: 'sensor.pv',
    _now: NOW,
    ...config,
  });
  card.hass = hass;
  document.body.append(card);
  await settle(card);
  return card;
}

/** Reads the chart at a bar, as a pointer over it does. */
const readAt = async (card: FluvyProductionCard, bar: number | null): Promise<void> => {
  (card as unknown as { scrubber: { value: number | null } }).scrubber.value = bar;
  card.requestUpdate();
  await settle(card);
};
const text = (root: ShadowRoot, selector: string): string[] =>
  [...root.querySelectorAll(selector)].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

describe('the production card reads Home Assistant’s solar forecast', () => {
  it('draws today’s forecast behind the day where no sensor is named, its figure the hour’s while one is read', async () => {
    const asked: string[] = [];
    const card = await mountIn(forecastHouse({ solcast: forecastOf([1, 1.2]) }, asked), {});
    const root = card.shadowRoot!;
    expect(root.querySelectorAll('.so-bar__forecast').length).toBe(13); // 06:00's 100 Wh is under half a step
    expect(text(root, '.fv-card__sub')).toEqual(['Today · vs forecast']);
    expect(text(root, '.so-top__side .fv-readout__value')).toEqual(['18.4kWh']);
    expect(asked.filter((type) => type === 'energy/solar_forecast')).toHaveLength(1);
    await readAt(card, 12);
    expect(text(root, '.so-top__side .fv-readout__value')).toEqual(['2.6kWh']);
    await readAt(card, null);
    expect(text(root, '.so-top__side .fv-readout__value')).toEqual(['18.4kWh']);
  });

  it('reads the badge as the hour’s share of its forecast while one is held, the day’s progress otherwise', async () => {
    const card = await mountIn(forecastHouse({ solcast: forecastOf([1]) }), {});
    const root = card.shadowRoot!;
    // 13.4 kWh against 13.5 expected by 14:30
    expect(text(root, '.fv-badge')).toEqual(['−1 %']);
    // 12:00's 2.3 kWh against its 2.6: the row's own comparison, not the day's
    await readAt(card, 12);
    expect(text(root, '.fv-badge')).toEqual(['−12 %']);
    await readAt(card, null);
    expect(text(root, '.fv-badge')).toEqual(['−1 %']);
  });

  it('adds two entries, lets a named sensor win, and asks for nothing where the forecast is turned off', async () => {
    const planes = await mountIn(
      forecastHouse({ east: forecastOf([0.5]), west: forecastOf([0.25]) }),
      {},
    );
    expect(text(planes.shadowRoot!, '.so-top__side .fv-readout__value')).toEqual(['13.8kWh']);

    const named: string[] = [];
    const hass = forecastHouse({ solcast: forecastOf([1]) }, named);
    hass.states['sensor.expected'] = meter('sensor.expected', 20);
    const sensor = await mountIn(hass, { forecast_entity: 'sensor.expected' });
    expect(text(sensor.shadowRoot!, '.so-top__side .fv-readout__value')).toEqual(['20.0kWh']);
    expect(sensor.shadowRoot!.querySelector('.so-bar__forecast')).toBeNull();
    expect(named).not.toContain('energy/solar_forecast');

    const off: string[] = [];
    const quiet = await mountIn(forecastHouse({ solcast: forecastOf([1]) }, off), {
      show_forecast: false,
    });
    expect(quiet.shadowRoot!.querySelector('.so-top__side')).toBeNull();
    expect(off).not.toContain('energy/get_prefs');
  });

  it('shows tomorrow as its forecast alone: every hour quiet, the day’s total beside today’s, its best hour', async () => {
    const asked: string[] = [];
    const card = await mountIn(forecastHouse({ solcast: forecastOf([1, 1.5]) }, asked), {
      day: 'tomorrow',
    });
    const root = card.shadowRoot!;
    expect(root.querySelectorAll('.so-bar').length).toBe(24);
    expect(root.querySelectorAll('.so-bar__forecast').length).toBe(13);
    expect(root.querySelector('.so-bar__fill')).toBeNull();
    expect(text(root, '.fv-card__sub')).toEqual(['Tomorrow · forecast']);
    expect(root.querySelector('.fv-badge')).toBeNull();
    expect(text(root, '.so-top .fv-readout__label')).toEqual(['Tomorrow', 'Today']);
    expect(text(root, '.so-top .fv-readout__value')).toEqual(['27.6kWh', '18.4kWh']);
    expect(text(root, '.so-cols .fv-readout__value')).toEqual(['3.9kWh', '12:00', '13h']);
    // the meter is not read
    expect(asked).not.toContain('recorder/statistics_during_period');
    await readAt(card, 12);
    expect(text(root, '.so-top .fv-readout__label')).toEqual(['12:00 – 13:00', 'Today']);
    expect(text(root, '.so-top .fv-readout__value')).toEqual(['3.9kWh', '2.6kWh']);
  });

  it('draws a forecast day in a style as bars to come: hollow, no now', async () => {
    const card = await mountIn(forecastHouse({ solcast: forecastOf([1, 1.5]) }), {
      day: 'tomorrow',
      chart: 'soft',
    });
    const root = card.shadowRoot!;
    expect(root.querySelectorAll('.pr-chart .fc-bar').length).toBe(14);
    expect(root.querySelectorAll('.pr-chart .fc-bar--hollow').length).toBe(14);
    expect(root.querySelector('.pr-chart .fc-now')).toBeNull();
  });

  it('shows the days ahead a bar a day, the last one left out where it is cut short, and reads each by its name', async () => {
    const week = forecastOf([1, 1.5, 0.5, 1.25]);
    // the forecast's reach ends in the morning of the day after
    Object.assign(week, { [hourAt(4, 6)]: 100, [hourAt(4, 7)]: 400 });
    const card = await mountIn(forecastHouse({ solcast: week }), { day: 'ahead' });
    const root = card.shadowRoot!;
    expect(root.querySelectorAll('.pr-days .so-bar').length).toBe(3);
    expect(text(root, '.fv-card__sub')).toEqual(['Next 3 days · forecast']);
    expect(text(root, '.fv-axis span')).toEqual(['Fri', 'Sat', 'Sun']);
    expect(text(root, '.so-top .fv-readout__label')).toEqual(['Total']);
    expect(text(root, '.so-top .fv-readout__value')).toEqual(['59.8kWh']);
    expect(text(root, '.so-cols .fv-readout__label')).toEqual([
      'Average',
      'Best day',
      'Lowest day',
    ]);
    expect(text(root, '.so-cols .fv-readout__value')).toEqual(['19.9kWh', 'Fri', 'Sat']);
    await readAt(card, 1);
    expect(text(root, '.so-top .fv-readout__value')).toEqual(['9.2kWh']);
    expect(text(root, '.so-top .fv-readout__label')[0]).toMatch(/^Sat/);

    const capped = await mountIn(forecastHouse({ solcast: week }), {
      day: 'ahead',
      days: 2,
      show_peak: false,
      variant: 'compact',
    });
    expect(capped.shadowRoot!.querySelectorAll('.pr-days .so-bar').length).toBe(2);
    expect(text(capped.shadowRoot!, '.fv-badge')).toEqual(['36.8 kWh']);
    expect(capped.shadowRoot!.querySelector('.so-cols')).toBeNull();
  });

  it('keeps a forecast day’s size with a quiet panel where there is no forecast', async () => {
    for (const [config, height] of [
      [{ day: 'tomorrow' }, 244],
      [{ day: 'ahead', variant: 'compact' }, 104],
      // arrays are today's: a forecast day draws none, and is as tall as one meter's
      [{ day: 'tomorrow', arrays: ['sensor.east', 'sensor.west'] }, 244],
    ] as const) {
      const card = await mountIn(forecastHouse({}), config);
      const root = card.shadowRoot!;
      expect(FluvyProductionCard.layoutHeight(card.config!) - 100).toBe(height);
      expect(root.querySelector('.pr-none')?.getAttribute('style')).toBe(`min-height:${height}px`);
      expect(text(root, '.fv-empty-state__text')).toEqual(['No forecast']);
      expect(root.querySelector('.so-bars')).toBeNull();
      expect(root.querySelector('.is-unavailable')).toBeNull();
    }
  });

  it('reads a forecast day from a sensor that carries it, before Home Assistant’s own', async () => {
    const hass = forecastHouse({ solcast: forecastOf([1, 1.5]) });
    hass.states['sensor.both_days'] = {
      ...meter('sensor.both_days', 18.4),
      attributes: { unit_of_measurement: 'kWh', wh_hours: forecastOf([1, 0.5]) },
    };
    const own = await mountIn(hass, { day: 'tomorrow', forecast_entity: 'sensor.both_days' });
    expect(text(own.shadowRoot!, '.so-top .fv-readout__value')).toEqual(['9.2kWh', '18.4kWh']);
    // a sensor of today's total says nothing of tomorrow: Home Assistant's forecast stands
    hass.states['sensor.expected'] = meter('sensor.expected', 20);
    const fallback = await mountIn(hass, { day: 'tomorrow', forecast_entity: 'sensor.expected' });
    expect(text(fallback.shadowRoot!, '.so-top .fv-readout__value')[0]).toBe('27.6kWh');
  });
});

describe('the production card’s editor, by the day it shows', () => {
  const schema = FluvyProductionCard.getConfigForm().schema as HaFormSchemaItem[];
  const names = (items: readonly HaFormSchemaItem[], data: Record<string, unknown>): string[] =>
    items
      .filter((item) => !item.when || item.when(data))
      .flatMap((item) => (item.schema ? names(item.schema, data) : [item.name]));

  it('offers the day as a choice of three, and only the fields that act on it', () => {
    const day = schema.find((item) => item.name === 'day');
    expect(day?.selector).toEqual({
      select: {
        mode: 'dropdown',
        options: [
          { value: 'today', label: 'Today' },
          { value: 'tomorrow', label: 'Tomorrow' },
          { value: 'ahead', label: 'Days ahead' },
        ],
      },
    });
    const only = (data: Record<string, unknown>): string[] =>
      [
        'days',
        'forecast_entity',
        'peak_entity',
        'show_forecast',
        'show_peak',
        'collection_key',
      ].filter((name) => names(schema, data).includes(name));
    expect(only({ day: 'today' })).toEqual([
      'forecast_entity',
      'peak_entity',
      'show_forecast',
      'show_peak',
      'collection_key',
    ]);
    expect(only({ day: 'tomorrow' })).toEqual(['forecast_entity', 'show_peak']);
    expect(only({ day: 'ahead' })).toEqual(['days', 'forecast_entity', 'show_peak']);
    // a forecast day has no now to mark and no bar to light
    expect(
      names(schema, { day: 'ahead', chart: 'soft' }).filter((name) =>
        ['show_now', 'highlight', 'animate'].includes(name),
      ),
    ).toEqual(['animate']);
    expect(FluvyProductionCard.defaults?.({ type: 'x' }, undefined)).toMatchObject({
      day: 'today',
    });
  });
});
