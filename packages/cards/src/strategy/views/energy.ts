import {
  balanced,
  batteriesCard,
  deviceRows,
  energyBalance,
  energyFlow,
  full,
  gridCard,
  hasBattery,
  hasSources,
  runsOf,
  solarCurves,
  solarGauges,
  when,
} from '../layout.js';
import { capped, each, looseAfter, moreCard } from '../caps.js';
import { COLUMNS } from '../context.js';
import { TODAY } from '../home-registry.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The energy dashboard (`custom:fluvy-energy`): now (the flow, the balance, the grid, the batteries, the charger and
 * the day by source), today (a day's flow, where it went, the score, the day's balance), what the sun makes, what
 * the devices draw, water and gas, and a curve a power meter.
 */

/** The live cards: where the energy comes from and goes, and each part of the house's system on its own. */
export function liveCards(ctx: StrategyContext): Card[] {
  const { energy, t } = ctx;
  return [
    ...when(hasSources(energy), () => [energyFlow(energy, ctx.style)]),
    ...when(hasSources(energy) && (energy.solarPowers.length || hasBattery(energy)), () => [
      energyBalance(energy),
    ]),
    ...when(energy.prefsMeters, () => [full('energy', { variant: 'sources' })]),
    ...when(
      energy.gridPower || energy.gridPhases.length || (energy.gridImport && energy.gridExport),
      () => [gridCard(energy)],
    ),
    // the meter's id last: `when` hands its value to the card
    ...when(!energy.gridExport && !energy.prefsPower && energy.gridPower, (id) => [
      full('gauge', {
        entity: id,
        variant: 'signed',
        name: t('energy.grid'),
      }),
    ]),
    ...when(hasBattery(energy), () => [batteriesCard(energy)]),
    ...when(energy.charger, (id) => [full('ev-charger', { entity: id })]),
  ];
}

/**
 * A day's totals as the energy dashboard allocates them: the flow of the day, where it went, the score. Given an
 * Energy date picker's key, each follows its span instead (its chips gone): the Energy dashboard's Today view.
 */
export function todayCards(ctx: StrategyContext, collection?: string): Card[] {
  const { energy } = ctx;
  const follows = collection ? { collection_key: collection } : {};
  return when(energy.prefsMeters, () => [
    energyFlow(energy, ctx.style, { period: 'day', badge: 'self_powered', ...follows }),
    full('energy-sankey', follows),
    full('energy-score', follows),
    energyBalance(energy, { period: 'day', ...follows }),
  ]);
}

/** The energy dashboard's devices as rows, at the cap (`consumption`: eight here, `cap` on a view of their own). */
export function consumptionRows(ctx: StrategyContext, cap?: number): Card[] {
  const { home, t } = ctx;
  const card = (ids: readonly string[]): Card =>
    full('energy-devices', {
      title: t('strategy.appliances'),
      rows: deviceRows(home, ids),
    });
  const devices = capped(
    ctx,
    {
      key: 'consumption',
      title: 'strategy.consumption',
      icon: 'fluvy:plug',
      ...(cap ? { cap } : {}),
    },
    ctx.energy.consumption,
    (ids) => [[card(ids)]],
  );
  return devices.shown.length ? [card(devices.shown), ...moreCard(devices)] : [];
}

/** The day's energy readings as stat tiles, four a card, when there are two or more. */
export function todayTiles(ctx: StrategyContext): Card[] {
  const { home, t } = ctx;
  const todays = home.energies.filter((id) => TODAY.test(home.label(id)));
  if (todays.length < 2) return [];
  const card = (ids: readonly string[]): Card =>
    full('stat-tiles', { title: t('strategy.today'), tiles: [...ids] });
  const today = capped(
    ctx,
    { key: 'today', title: 'strategy.today', icon: 'fluvy:calendar' },
    todays,
    (ids) => runsOf(ids, 4).map((run) => [card(run)]),
  );
  return [...runsOf(today.shown, 4).map(card), ...moreCard(today)];
}

/** The flow and the day by source first, then each part of the system, and the day's curve. */
function nowView(ctx: StrategyContext): Section[] {
  const { t, energy } = ctx;
  const { gridPower, homePower, consumptionPowers } = energy;
  return balanced(ctx, [
    ...liveCards(ctx),
    ...(energy.prefsMeters
      ? []
      : energy.solarPowers.length
        ? solarCurves(energy, { name: t('energy.solar') })
        : gridPower
          ? [full('energy', { entity: gridPower, name: t('energy.grid') })]
          : homePower
            ? [full('energy', { entity: homePower })]
            : []),
    ...when(consumptionPowers.length >= 2, () => [
      full('distribution', {
        title: t('strategy.consumption'),
        entities: consumptionPowers.slice(0, 8),
        ...(energy.homePower ? { total: energy.homePower } : {}),
      }),
    ]),
    ...todayTiles(ctx),
  ]);
}

/**
 * Today in energy: the period strip across the view, then the day's flow, where it went, the score and the day's
 * balance following it — the dashboard's own date picker (`energy_<its url>`), so Home Assistant's energy cards on the
 * view would follow it too. A generated config is never stored: the key is the strip's default, said out loud here.
 */
function todayView(ctx: StrategyContext): Section[] {
  const collection = `energy_${ctx.panelUrl}`;
  const cards = todayCards(ctx, collection);
  return cards.length
    ? [
        {
          type: 'grid',
          column_span: COLUMNS,
          cards: [
            {
              ...full('energy-period', { collection_key: collection }),
              grid_options: { columns: 'full' },
            },
          ],
        },
        ...balanced(ctx, cards),
      ]
    : [];
}

/** What the sun makes: today's production and the day ahead, its last days as bars, each inverter's gauge and its day. */
function productionView(ctx: StrategyContext): Section[] {
  const { t, energy } = ctx;
  const { solarToday, solarForecast, solarForecastTomorrow } = energy;
  // the day and the day ahead ride in the lead column together: a phone then reads them in that order, and the
  // columns are cut level behind them
  const lead: Card[] = [
    ...when(solarToday, (id) => [
      full('production', {
        entity: id,
        ...(solarForecast ? { forecast_entity: solarForecast } : {}),
      }),
    ]),
    ...when(solarForecastTomorrow, (id) => [full('forecast', { tomorrow: id })]),
    ...when(solarForecast ?? solarForecastTomorrow, () => [
      full('forecast-days', {
        forecast: [solarForecast, solarForecastTomorrow].filter(
          (id): id is string => id !== undefined,
        ),
        days: 7,
      }),
    ]),
  ];
  return balanced(ctx, [
    lead,
    ...when(solarToday, (id) => [full('history-bars', { entity: id, color: 'amber' })]),
    ...solarGauges(energy),
    ...solarCurves(energy, { name: t('energy.solar') }),
  ]);
}

/** The energy dashboard's devices, nested as it nests them, and how they share what the house draws. */
function devicesView(ctx: StrategyContext): Section[] {
  const { t, energy } = ctx;
  const { consumptionPowers } = energy;
  return balanced(ctx, [
    // the devices' own view lists twelve before its "N more" row
    ...consumptionRows(ctx, 12),
    ...when(consumptionPowers.length >= 2, () => [
      full('distribution', {
        title: t('strategy.consumption'),
        entities: consumptionPowers.slice(0, 8),
        ...(energy.homePower ? { total: energy.homePower } : {}),
      }),
    ]),
  ]);
}

/** The house's water and gas meters. */
function metersCards({ energy }: StrategyContext): Card[] {
  return when(energy.meters.length, () => [
    full('meters', { meters: energy.meters.map((entity) => ({ entity })) }),
  ]);
}

/** A day's curve for every power meter of the house, each by its place, two of one place told apart (#170). */
function metersView(ctx: StrategyContext): Section[] {
  const { home } = ctx;
  const place = home.apart(home.powers, (id) => home.placeName(id));
  const curve = (id: string): Card => full('energy', { entity: id, name: place(id) });
  const meters = capped(
    ctx,
    { key: 'meters', title: 'strategy.meters', icon: 'fluvy:chart' },
    home.powers,
    each(curve),
  );
  return balanced(ctx, looseAfter(meters.shown.map(curve), meters));
}

export const ENERGY_VIEWS: readonly ViewSpec[] = [
  { key: 'now', icon: 'fluvy:bolt', title: 'strategy.now', build: nowView, when: () => true },
  {
    key: 'today',
    icon: 'fluvy:calendar',
    title: 'strategy.today',
    build: todayView,
    when: ({ energy }) => energy.prefsMeters,
  },
  {
    key: 'production',
    icon: 'fluvy:sun',
    title: 'strategy.production',
    build: productionView,
    when: ({ energy }) => Boolean(energy.solarPowers.length || energy.solarToday),
  },
  {
    key: 'devices',
    icon: 'fluvy:plug',
    title: 'strategy.devices',
    build: devicesView,
    when: ({ energy }) => energy.consumption.length > 0 || energy.consumptionPowers.length >= 2,
  },
  {
    key: 'water',
    icon: 'fluvy:drop',
    title: 'strategy.water_gas',
    build: (ctx) => balanced(ctx, metersCards(ctx)),
    when: ({ energy }) => energy.meters.length > 0,
  },
  {
    key: 'meters',
    icon: 'fluvy:chart',
    title: 'strategy.meters',
    build: metersView,
    when: ({ home }) => home.powers.length > 0,
  },
];

export { metersCards };
