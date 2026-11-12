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
 * registries' words: a reading's name says one role, the longest of words that overlap winning (`shared/words.ts`).
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
 * A forecast is not a reading: Solcast and friends name their sensors "… forecast", and their numbers are still to
 * come. Their device is often named for the day ("今天的总发电量"), so the words alone cannot tell them apart.
 */
const FORECAST =
  /(forecast|prognose|prognoz|prognóz|прогноз|previsi[oó]n|pr[eé]vision|previsto|voorspelling|verwachting|予測|예측|預測|预测)/i;

/** A day's own counter in Chinese and Japanese: "日发电总量" says today without the word 今天. */
const DAILY = /(日发电|日發電|日発電|日发电量|日發電量|日発電量)/;

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
  // each reading's one role by its words (a reading the preferences name may say any)
  const role = new Map(
    [...powers, ...energies].map((id) => [id, says(home.label(id), ROLE_WORDS)]),
  );
  const saying = (list: readonly string[], said: Role): string[] =>
    list.filter((id) => role.get(id) === said);
  const solarWords = saying(powers, 'solar')
    .filter((id) => !FORECAST.test(home.label(id)) && !FORECAST.test(id))
    .slice(0, 1);
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
  // Today's production, in this order: the meter the energy dashboard records production from (a cumulative one:
  // the cards take the day's gain from its statistics), a daily counter the words name, and only then a forecast,
  // which is what the cards draw when a house has one but no meter of its own.
  const solarMeters = house.sources
    .filter((s) => s.kind === 'solar')
    .flatMap((s) => s.energyIn)
    .filter((id) => home.hasState(id) && !FORECAST.test(home.label(id)));
  // A day's counter need not say "solar" in words the solar rules know — "MPPT 日发电总量" is a day counter named in
  // Chinese, and the rules only carry 発電 — so readings the words leave without a role count too, after the solar ones.
  const dayCounter = (id: string): boolean =>
    !FORECAST.test(home.label(id)) &&
    !FORECAST.test(id) &&
    (TODAY.test(home.label(id)) || DAILY.test(home.label(id)));
  const daily = [
    ...energies.filter((id) => role.get(id) === 'solar' && dayCounter(id)),
    ...energies.filter((id) => !role.get(id) && dayCounter(id)),
  ];
  const reading = (id: string): boolean => Number.isFinite(Number.parseFloat(home.state(id) ?? ''));
  const solarToday =
    solarMeters.find(reading) ??
    daily.find(reading) ??
    daily[0] ??
    saying(energies, 'solar').find((id) => TODAY.test(home.label(id))) ??
    house.sources.find((s) => s.kind === 'solar')?.energyIn[0];
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
