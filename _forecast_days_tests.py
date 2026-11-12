import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def patch(path, pairs):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    for old, new, label in pairs:
        if old not in text:
            raise SystemExit(f'anchor missing in {path}: {label}')
        text = text.replace(old, new, 1)
        print('patched', os.path.basename(path), label)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


patch(
    os.path.join('packages', 'cards', 'src', 'strategy', 'energy-roles.test.ts'),
    [
        (
            """  it('says nothing when the forecast carries no hours', () => {
    const roles = house([
      reading('sensor.solcast_forecast_today', '今天总发电量-预测', '86.0'),
    ]);
    expect(roles.solarForecast).toBeUndefined();
  });""",
            """  it('reads a day from its total alone when the forecast carries no hours', () => {
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
    expect(roles.solarForecastDays).toEqual([
      'sensor.solcast_forecast_today',
      'sensor.solcast_forecast_tomorrow',
      'sensor.solcast_forecast_day_3',
      'sensor.solcast_forecast_day_5',
    ]);
  });""",
            'roles tests',
        ),
    ],
)

patch(
    os.path.join('packages', 'cards', 'src', 'strategy', 'home-strategy.test.ts'),
    [
        (
            """      'custom:fluvy-forecast-card',
    ]);""",
            """      'custom:fluvy-forecast-card',
      'custom:fluvy-forecast-days-card',
    ]);""",
            'byHand days card',
        ),
    ],
)
print('done')
