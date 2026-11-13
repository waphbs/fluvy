import { readPrefs, type EnergyPrefs } from '../energy-model/prefs.js';
import { prefSources } from '../energy-model/sources.js';
import { says, type Rules } from '../shared/words.js';
import type { EnergyRoles, SourcePower } from './types.js';
import {
  BATTERY_POWER,
  CHARGER,
  GRID,
  GRID_EXPORT,
  HOME_POWER,
  SOLAR,
  TODAY,
  type HomeRegistry,
} from './home-registry.js';

/*
 * The house's energy readings by their role — solar, grid, battery, house, a car charger, today's production, the
 * energy dashboard's devices, water and gas — from the energy dashboard's own preferences first, then from the
 * registries' words: a reading's name says one role, the longest of words that overlap winning (`shared/words.ts`); a
 * forecast says none, being what is still to come.
 */

type Role = 'solar' | 'export' | 'grid' | 'battery' | 'charger' | 'home';

/**
 * The roles a reading's name can say, the first listed winning where a name says two that stand apart: the sun,
 * what leaves the house, the grid, the battery, the car's charger, the house itself.
 */
const ROLE_WORDS: Rules<Role> = [
  ['solar', SOLAR],
  ['export', GRID_EXPORT],
  ['grid', GRID],
  ['battery', BATTERY_POWER],
  ['charger', CHARGER],
  ['home', HOME_POWER],
];

/** A grid meter named by its phase: `grid_power_l1`, "Phase A", `fase_2`, `faz 3`. */
const PHASE =
  /(^|[\s_.-])(l[1-3]|phase[\s_-]?[1-3abc]|fase[\s_-]?[1-3]|faz[\s_-]?[1-3])([\s_.-]|$)/i;

/**
 * Every source of a kind the energy preferences give a power sensor the house has, in their order: each with its own
 * sign, and its own charge where it states one.
 */
function preferredPowers(
  home: HomeRegistry,
  prefs: EnergyPrefs | null,
  type: 'solar' | 'grid' | 'battery',
): SourcePower[] {
  return readPrefs(prefs).sources.flatMap((source) => {
    const id = source.kind === type ? source.measure?.power?.[0] : undefined;
    if (!id || !home.hasState(id)) return [];
    const level = source.soc && home.hasState(source.soc) ? source.soc : undefined;
    return [{ id, inverted: source.measure?.invert ?? false, ...(level ? { level } : {}) }];
  });
}

export function findEnergyRoles(home: HomeRegistry, prefs: EnergyPrefs | null): EnergyRoles {
  const { powers, energies } = home;
  const house = readPrefs(prefs);
  // the energy dashboard's own power sensors first, every source of a kind (they carry their sign); otherwise the
  // readings by their words, one a kind
  const solarPrefs = preferredPowers(home, prefs, 'solar');
  const gridPref = preferredPowers(home, prefs, 'grid')[0];
  const batteryPrefs = preferredPowers(home, prefs, 'battery');
  // each reading's one role by its words (a reading the preferences name may say any); a forecast says none (#170)
  const role = new Map(
    [...powers, ...energies].map((id) => [
      id,
      home.forecast(id) ? undefined : says(home.label(id), ROLE_WORDS),
    ]),
  );
  const saying = (list: readonly string[], said: Role): string[] =>
    list.filter((id) => role.get(id) === said);
  const solarWords = saying(powers, 'solar').slice(0, 1);
  const solarPowers = solarPrefs.length
    ? solarPrefs
    : solarWords.map((id) => ({ id, inverted: false }));
  const arrays = solarPowers.map((p) => p.id);
  // a meter named for what leaves the house is never the grid's own: it is the export beside an import
  const exporting = saying(powers, 'export').filter((id) => !arrays.includes(id));
  const gridMeters = saying(powers, 'grid').filter((id) => !arrays.includes(id));
  const phases = gridMeters.filter((id) => PHASE.test(home.label(id)));
  const gridPhases = !gridPref && phases.length >= 2 ? phases.slice(0, 3) : [];
  const gridPower = gridPref?.id ?? gridMeters.find((id) => !gridPhases.includes(id));
  const gridExport = !gridPref ? exporting[0] : undefined;
  // each battery's charge: its own in the energy dashboard (one found by its words, the dashboard's), else the
  // battery-class sensor beside its power sensor
  const stated = house.sources.find(
    (s) => s.kind === 'battery' && s.soc && home.hasState(s.soc),
  )?.soc;
  const batteryWords = saying(powers, 'battery')
    .filter((id) => !arrays.includes(id) && id !== gridPower)
    .slice(0, 1)
    .map((id) => ({ id, inverted: false, ...(stated ? { level: stated } : {}) }));
  const batteryPowers = (batteryPrefs.length ? batteryPrefs : batteryWords).map((p) => {
    const level = p.level ?? home.beside(p.id, 'battery').find((id) => home.hasState(id));
    return level ? { ...p, level } : p;
  });
  const taken = [...arrays, gridPower, ...batteryPowers.map((p) => p.id)];
  const charger = saying(powers, 'charger').find((id) => !taken.includes(id));
  const homePower = saying(powers, 'home').find((id) => !taken.includes(id));
  // today's production: the energy dashboard's solar meter (the cards read its day from its statistics), else a day's
  // counter its words name; never a forecast
  // Two arrays, one forecast: when the house has more than one solar meter, its day is best read from a counter that
  // adds them up ("MPPT 日发电总量(E1+E2)"), which is what a whole-house forecast can be compared with.
  const COMBINED_DAY = /(?:E1\s*\+\s*E2|E2\s*\+\s*E1|1\s*\+\s*2)/i;
  const solarMeters = house.sources.find((s) => s.kind === 'solar')?.energyIn ?? [];
  const combinedToday = home.ids().find(
    (id) =>
      id.startsWith('sensor.') &&
      home.hasState(id) &&
      !home.forecast(id) &&
      COMBINED_DAY.test(home.label(id)) &&
      /(日发电|日發電|日発電|今天|today)/i.test(home.label(id)) &&
      /kwh|wh/i.test(home.unitOf(id)) &&
      /^total/.test(home.stateClass(id)),
  );
  const solarToday =
    combinedToday ??
    solarMeters.find((id) => home.hasState(id)) ??
    saying(energies, 'solar').find((id) => TODAY.test(home.label(id)));
  // The day's forecast: Solcast and friends state a day's total and carry its hours as an attribute. Their device is
  // named for the day, so every sensor of it says "today": the day's total is the reading whose attributes carry the
  // hours — never the sensors of the hour at hand, the rest of the day, a peak or the API's own counters.
  const FORECAST_SKIP =
    /(剩余|当前|小时|功率|峰值|高峰|api|limit|polled|hard\s*limit|今天总发电量-预测\s*home)/i;
  const FORECAST_SKIP_ID =
    /(_sheng_yu|_dang_qian|_1xiao_shi|_gong_lu|_gao_feng|_api_|_hard_limit|_home|_30fen_zhong|_1xiao_shi_hou)/i;
  const HOURY = ['detailedHourly', 'detailedForecast', 'wh_period', 'wh_hours', 'hourly', 'forecast'];
  const DAY_WORDS = /(日发电|日發電|日発電|日发电量|日發電量|日発電量)/;
  const forecastReading = (id: string): boolean =>
    home.forecast(id) &&
    !FORECAST_SKIP.test(home.label(id)) &&
    !FORECAST_SKIP_ID.test(id) &&
    home.hasState(id) &&
    Number.isFinite(Number.parseFloat(home.state(id) ?? ''));
  const forecastDay = (id: string): boolean =>
    forecastReading(id) && HOURY.some((name) => home.hasAttr(id, name));
  const TOMORROW =
    /(明天|明日|tomorrow|morgen|mañana|demain|domani|jutro|amanh|내일|пер[её]д?завтра)/i;
  const forecastDays = energies.filter(forecastDay);
  // A forecast that names its day outright ("Forecast Day 3"): the day's total is its state, and the hours may be
  // missing, so the card reads the state when there are none. Today and tomorrow come first, an explicit "Day 3"
  // beats the "today" their device's name lends them.
  const DAY_OF = /(?:day|día|dia|jour|tag|journée|giorno|dzień|día|dag|日目|일)\s*_?\s*(\d+)/i;
  const dayOf = (id: string): number | null => {
    const words = `${home.label(id)} ${id}`;
    const named = DAY_OF.exec(words);
    if (named?.[1] !== undefined) return Math.max(0, Number(named[1]) - 1);
    if (TOMORROW.test(words)) return 1;
    if (TODAY.test(words) || DAY_WORDS.test(words)) return 0;
    return null;
  };
  const byDay = new Map<number, string>();
  for (const id of energies) {
    if (!forecastReading(id)) continue;
    const offset = dayOf(id);
    if (offset === null || byDay.has(offset)) continue;
    byDay.set(offset, id);
  }
  // a day the forecast skips keeps its place as an empty string: the card draws it hollow rather than sliding the
  // days after it back
  const lastDay = Math.max(-1, ...byDay.keys());
  const solarForecastDays: string[] = [];
  for (let offset = 0; offset <= lastDay && offset < 14; offset += 1) {
    solarForecastDays.push(byDay.get(offset) ?? '');
  }
  const solarForecastTomorrow =
    byDay.get(1) ?? forecastDays.find((id) => TOMORROW.test(home.label(id)));
  const solarForecast =
    byDay.get(0) ??
    forecastDays.find(
      (id) =>
        id !== solarForecastTomorrow &&
        (TODAY.test(home.label(id)) || DAY_WORDS.test(home.label(id))),
    );
    const consumption = (prefs?.device_consumption ?? [])
    .map((d) => d.stat_consumption)
    .filter((id) => home.hasState(id));
  // each device's power: the power sensor beside its energy statistic (same device, or the same name stem);
  // without devices in the energy dashboard, the appliances' own plugs
  const powerBeside = (id: string): string | undefined =>
    home.readoutsOf(id).find((reading) => home.deviceClass(reading) === 'power');
  const consumptionPowers = (consumption.length ? consumption : home.appliances)
    .map(powerBeside)
    .filter((p): p is string => Boolean(p));
  // water and gas: the energy dashboard's meters, else every meter of that class the house has
  const volume = (deviceClass: string): string[] =>
    home
      .sensors(deviceClass, true)
      .filter((id) => home.state(id) !== undefined && home.stateClass(id) === 'total_increasing');
  const meters = [...house.water, ...house.gas].filter((id) => home.hasState(id));
  return {
    solarPowers,
    gridPower,
    gridImport: gridExport ? gridPower : undefined,
    gridExport: gridExport && gridPower ? gridExport : undefined,
    gridPhases,
    batteryPowers,
    homePower,
    charger,
    gridInvert: gridPref?.inverted ?? false,
    gridSigned: gridPref !== undefined || gridPhases.length > 0,
    solarToday,
    solarForecast,
    solarForecastTomorrow,
    solarForecastDays,
    consumption,
    consumptionPowers,
    // the cards read the energy dashboard themselves when it carries the grid's power (or the house has no grid to
    // find): a dashboard that measures only the sun would otherwise hide the grid the words found
    prefsPower:
      prefSources(prefs).some((source) => source.type === 'grid') ||
      (prefSources(prefs).length > 0 && !gridPower && !gridPhases.length),
    prefsMeters: house.sources.some((s) => s.energyIn.length > 0 || s.energyOut.length > 0),
    meters: meters.length ? meters : [...volume('water'), ...volume('gas')].slice(0, 4),
    any: Boolean(
      arrays.length || gridPower || gridPhases.length || consumption.length || energies.length,
    ),
  };
}
