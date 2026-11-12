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
