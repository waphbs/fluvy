import { describe, expect, it } from 'vitest';
import { findEnergyRoles } from './energy-roles.js';
import { HomeRegistry } from './home-registry.js';

/** A reading, as Home Assistant hands it over. */
const reading = (id: string, name: string, state: string) => ({
  entity_id: id,
  state,
  attributes: {
    friendly_name: name,
    device_class: 'energy',
    state_class: 'total',
    unit_of_measurement: 'kWh',
  },
  last_changed: '',
  last_updated: '',
  context: { id: '', parent_id: null, user_id: null },
});

/** A house of those readings, nothing else. */
const house = (readings: ReadonlyArray<ReturnType<typeof reading>>) =>
  findEnergyRoles(
    new HomeRegistry({
      states: Object.fromEntries(readings.map((r) => [r.entity_id, r])),
      entities: {},
      devices: {},
      areas: {},
      language: 'en',
    } as never),
    null,
  );

describe('findEnergyRoles — today’s production is a reading, not a forecast', () => {
  it('takes the day counter over a forecast that is also named for today', () => {
    expect(
      house([
        reading('sensor.solcast_forecast_today', 'Solcast forecast today', '85.3'),
        reading('sensor.pv_today', 'PV today', '48.1'),
      ]).solarToday,
    ).toBe('sensor.pv_today');
  });

  it('reads a Chinese day counter that names the day without the word 今天', () => {
    expect(
      house([
        reading('sensor.solcast_forecast_today', 'Solcast forecast today', '85.3'),
        reading('sensor.mppt_day_total', 'MPPT 日发电总量', '48.1'),
      ]).solarToday,
    ).toBe('sensor.mppt_day_total');
  });

  it('still draws a forecast when the house has no meter of its own', () => {
    expect(
      house([reading('sensor.solar_forecast_today', 'Solar forecast today', '85.3')]).solarToday,
    ).toBe('sensor.solar_forecast_today');
  });

  it('does not take an hourly forecast slice for today', () => {
    expect(
      house([
        reading('sensor.forecast_next_hour', 'Forecast next hour', '13.3'),
        reading('sensor.pv_today', 'PV today', '48.1'),
      ]).solarToday,
    ).toBe('sensor.pv_today');
  });
});

/** A forecast of a day: its total as the state, its hours in the attribute Solcast ships. */
const dayForecast = (id: string, name: string, state: string) => {
  const base = reading(id, name, state);
  return {
    ...base,
    attributes: {
      ...base.attributes,
      detailedHourly: Array.from({ length: 24 }, (_unused, hour) =>
        hour > 6 && hour < 19 ? 1 : 0,
      ),
    },
  };
};

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
