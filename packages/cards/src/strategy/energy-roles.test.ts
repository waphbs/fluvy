import { describe, expect, it } from 'vitest';
import type { EnergyPrefs } from '../energy-model/prefs.js';
import { findEnergyRoles } from './energy-roles.js';
import { HomeRegistry } from './home-registry.js';

/** A reading of that class, as Home Assistant hands it over, of that integration where one is named. */
const reading = (
  id: string,
  friendly_name: string,
  state: string,
  device_class: 'power' | 'energy' = 'energy',
  platform?: string,
  attributes?: Readonly<Record<string, unknown>>,
) => ({ id, friendly_name, state, device_class, platform, attributes });

/** A house of those readings, nothing else, with the energy dashboard's preferences where it has them. */
function roles(readings: readonly ReturnType<typeof reading>[], prefs: EnergyPrefs | null = null) {
  const home = new HomeRegistry({
    states: Object.fromEntries(
      readings.map(({ id, friendly_name, state, device_class, attributes }) => [
        id,
        {
          entity_id: id,
          state,
          attributes: {
            friendly_name,
            device_class,
            state_class: device_class === 'energy' ? 'total_increasing' : 'measurement',
            unit_of_measurement: device_class === 'energy' ? 'kWh' : 'W',
            ...attributes,
          },
          last_changed: '',
          last_updated: '',
          context: { id: '', parent_id: null, user_id: null },
        },
      ]),
    ),
    entities: Object.fromEntries(
      readings.map(({ id, platform }) => [
        id,
        { entity_id: id, ...(platform ? { platform } : {}) },
      ]),
    ),
    devices: {},
    areas: {},
    language: 'en',
  } as never);
  return findEnergyRoles(home, prefs);
}

describe('findEnergyRoles — a forecast is not a reading (#170)', () => {
  it('takes the day’s counter for today’s production over a forecast also named for the sun and today', () => {
    expect(
      roles([
        reading(
          'sensor.solcast_pv_forecast_forecast_today',
          'Solcast PV Forecast Forecast today',
          '85.3',
          'energy',
        ),
        reading('sensor.today_pv_yield', 'Today PV yield', '48.1', 'energy'),
      ]).solarToday,
    ).toBe('sensor.today_pv_yield');
  });

  it('takes no forecast for today’s production, even where the house has nothing else', () => {
    for (const forecast of [
      reading('sensor.solar_forecast_today', 'Solar forecast today', '85.3', 'energy'),
      reading('sensor.solar_forecast_next_hour', 'Solar forecast next hour', '13.3', 'energy'),
      // Forecast.Solar's, whose name says no forecast: its integration does
      reading(
        'sensor.energy_production_today',
        'Solar Estimated energy production - today',
        '31.0',
        'energy',
        'forecast_solar',
      ),
      // Solcast's, by its integration
      reading('sensor.solar_today_estimate', 'Solar today', '30.2', 'energy', 'solcast_solar'),
    ])
      expect(roles([forecast]).solarToday, forecast.id).toBeUndefined();
  });

  it('reads a forecast in every language the words cover, never as the sun’s', () => {
    const forecasts = [
      reading('sensor.pv_prognose_heute', 'PV Prognose heute', '20', 'energy'),
      reading('sensor.produccion_solar_hoy', 'Previsión producción solar hoy', '20', 'energy'),
      reading(
        'sensor.production_solaire',
        'Prévision production solaire aujourd’hui',
        '20',
        'energy',
      ),
      reading('sensor.taiyoukou_yosoku', '太陽光発電 予測 今日', '20', 'energy'),
      reading('sensor.guangfu_yuce', '光伏 今日 预测发电量', '20', 'energy'),
      reading('sensor.solnechnaya', 'Прогноз солнечной генерации сегодня', '20', 'energy'),
    ];
    for (const forecast of forecasts)
      expect(roles([forecast]).solarToday, forecast.friendly_name).toBeUndefined();
  });

  it('never takes a forecast of power for the sun’s, the grid’s, the battery’s or the house’s', () => {
    const found = roles([
      reading(
        'sensor.solcast_pv_forecast_power_now',
        'Solcast PV Forecast Power now',
        '2100',
        'power',
      ),
      reading('sensor.solar_power_forecast', 'Solar power forecast', '2400', 'power'),
      reading('sensor.grid_power_forecast', 'Grid power forecast', '300', 'power'),
      reading('sensor.house_load_prediction', 'House load prediction', '800', 'power'),
      reading('sensor.inverter_power', 'Inverter power', '1900', 'power'),
    ]);
    expect(found).toMatchObject({
      solarPowers: [{ id: 'sensor.inverter_power' }],
      gridPower: undefined,
      homePower: undefined,
    });
  });

  it('takes the energy dashboard’s solar meter for today’s production first, then the day’s counter', () => {
    const house = [
      reading('sensor.inverter_total_yield', 'Inverter total yield', '9120', 'energy'),
      reading('sensor.pv_today', 'PV today', '48.1', 'energy'),
    ];
    const prefs: EnergyPrefs = {
      energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.inverter_total_yield' }],
    };
    expect(roles(house, prefs).solarToday).toBe('sensor.inverter_total_yield');
    expect(roles(house).solarToday).toBe('sensor.pv_today');
    // a meter the house no longer has is none
    expect(roles(house.slice(1), prefs).solarToday).toBe('sensor.pv_today');
  });
});

/** A forecast of a day: its total as the state, its hours in the attribute Solcast ships. */
const dayForecast = (id: string, name: string, state: string) =>
  reading(id, name, state, 'energy', undefined, {
    detailedHourly: Array.from({ length: 24 }, (_unused, hour) => (hour > 6 && hour < 19 ? 1 : 0)),
  });

/** The older name of the same helper, so the tests below read as they were written. */
const house = roles;

describe('findEnergyRoles — the sun’s forecast of a day', () => {
  it('reads today’s forecast and tomorrow’s apart, by their names', () => {
    const roles = house([
      dayForecast('sensor.solcast_forecast_today', '今天总发电量-预测', '86.0'),
      dayForecast('sensor.solcast_forecast_tomorrow', '明天总发电量-预测', '45.1'),
    ]);
    expect(roles.solarForecast).toBe('sensor.solcast_forecast_today');
    expect(roles.solarForecastTomorrow).toBe('sensor.solcast_forecast_tomorrow');
  });

  it('never takes the hour at hand, the rest of the day or the peak', () => {
    const roles = house([
      dayForecast('sensor.solcast_forecast_hours', '当前1小时内发电量-预测', '13.3'),
      dayForecast('sensor.solcast_remaining', '今日剩余发电量-预测', '30.5'),
      dayForecast('sensor.solcast_peak', '今日峰值-预测', '13.6'),
      dayForecast('sensor.solcast_forecast_today', '今天总发电量-预测', '86.0'),
    ]);
    expect(roles.solarForecast).toBe('sensor.solcast_forecast_today');
  });

  it('reads a day from its total alone when the forecast carries no hours', () => {
    const roles = house([
      reading('sensor.solcast_forecast_today', '今天总发电量-预测', '86.0'),
    ]);
    expect(roles.solarForecast).toBe('sensor.solcast_forecast_today');
  });

  it('orders the days a forecast names, today first ("Forecast Day 3" third)', () => {
    const roles = house([
      reading('sensor.solcast_forecast_day_5', '今天总发电量-预测 Forecast Day 5', '24.0'),
      reading('sensor.solcast_forecast_today', '今天总发电量-预测', '86.0'),
      reading('sensor.solcast_forecast_day_3', '今天总发电量-预测 Forecast Day 3', '75.1'),
      reading('sensor.solcast_forecast_tomorrow', '明天总发电量-预测', '45.1'),
    ]);
    // "Forecast Day 4" is missing: it keeps its hollow place rather than sliding day 5 back
    expect(roles.solarForecastDays).toEqual([
      'sensor.solcast_forecast_today',
      'sensor.solcast_forecast_tomorrow',
      'sensor.solcast_forecast_day_3',
      '',
      'sensor.solcast_forecast_day_5',
    ]);
  });
});
