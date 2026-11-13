import {
  APPLIANCE_WORDS,
  applianceDevices,
  kindOf,
  signalsOf,
  type ApplianceKind,
} from '../appliance/kinds.js';
import { printerDevices } from '../printer/roles.js';
import { GATEWAYS } from '../shared/domain.js';
import { says, type Rules } from '../shared/words.js';
import {
  areaContents,
  areaEntities,
  areaOf,
  areasInOrder,
  deviceNameOf,
  floorsInOrder,
  inList,
  isLoad,
  localize,
  plain,
  registryText,
  usableEntity,
  type AreaContents,
  type AreaRegistryEntry,
  type FloorRegistryEntry,
  type HomeAssistant,
  type MessageKey,
  type RoomTuning,
} from '@fluvy/core';
import {
  BATTERY_POWER,
  CHARGER,
  FORECAST,
  GENERIC,
  GRID,
  GRID_EXPORT,
  HOME_POWER,
  LIGHT_WORDS,
  NOT_APPLIANCE,
  OUTDOOR,
  PLACE_JOINS,
  PLACE_NOISE,
  SOLAR,
  TODAY,
} from './words.generated.js';
import type { RoomLook } from './types.js';

/*
 * What a house looks like to the automatic dashboard: the entity, device and area registries read
 * through word rules (the way people name things, in every language Fluvy ships: `words.generated.ts`, from
 * the catalogues) and device classes. Where a name is read among classes of words — a switch's, a place's — the
 * longest of words that overlap wins (`shared/words.ts`). Pure queries, no cards — the views (`views/`) turn them
 * into cards. What the dashboard can do without (the appliances, the pets' among them, the printers, the names it
 * reads) is read as `optional`: a throw on a house nobody foresaw costs that part alone.
 */

export {
  BATTERY_POWER,
  CHARGER,
  GRID,
  GRID_EXPORT,
  HOME_POWER,
  LIGHT_WORDS,
  OUTDOOR,
  SOLAR,
  TODAY,
};
const WEATHER_PLATFORMS =
  /aemet|met\b|met_|openweather|accuweather|forecast|weather|tomorrow|pirate|ecowitt|buienradar|nws/i;
/** The integrations that forecast what the sun will make: Forecast.Solar, Solcast, Open-Meteo's solar forecast. */
const FORECAST_PLATFORMS = /forecast|solcast/i;
const OPENINGS = new Set([
  'door',
  'window',
  'garage_door',
  'opening',
  'motion',
  'occupancy',
  'moisture',
  'smoke',
  'gas',
  'carbon_monoxide',
  'vibration',
  'tamper',
  'lock',
  'safety',
  'presence',
  'sound',
]);
/** A plug's second switch (USB, child lock…): the plain outlet sorts first. */
const TWIN_SWITCH = /outlet|usb|child|lock/i;
/**
 * What a switch's name says it is, read plain: a light, else an appliance of a kind or never one (電気ケトル is a kettle
 * on its plug, not the light 電気; a light's words win over a kind's that stand apart: "oven light").
 */
const SWITCH_WORDS: Rules<'light' | ApplianceKind | 'never'> = [
  ['light', LIGHT_WORDS],
  ...APPLIANCE_WORDS,
];
/** Where a thing is: outdoors, against the house's own words (家庭, the household, holds no garden 庭). */
const PLACE_WORDS: Rules<'outdoor' | 'home'> = [
  ['outdoor', OUTDOOR],
  ['home', HOME_POWER],
];
/**
 * The separators and spaces at a name's ends, once words are taken out of it: the device's name in front of its
 * entity's ("Kitchen sensor: Temperature"), a reading's words after its place ("Kitchen · Temperature", 「寝室：温度」,
 * 「キッチン温度・湿度」, whose 温度 and 湿度 leave 「キッチン ・」), the mark that joined two of them ("Temperature &
 * Humidity Kitchen"), an id's underscore where a name is its id ("garden_humidity").
 */
const LOOSE_ENDS = /^[\s・：:·\-–—/／|&,_]+|[\s・：:·\-–—/／|&,_]+$/g;

/** A word found in a place's name, where it stands: one that says a reading, or one that joins (`PLACE_JOINS`). */
interface PlaceWord {
  readonly at: number;
  readonly end: number;
  readonly join: boolean;
}

/**
 * A name without the words that say a reading rather than a place (`PLACE_NOISE`, written plain, read plain letter by
 * letter where each stands: "Snímač" as "snimac", "Hőmérséklet" as "homerseklet"; a letter that would not stay one, ß,
 * as written), nor the words that join them (`PLACE_JOINS`: an article, a preposition, a conjunction, an elision),
 * read as written — "là" is no "la", "Nó" no "no", and the "O" of "O’Brien" no word of its own — save where one stands
 * between two words that stay: "Fürdő és Konyha", "Sala de estar" and "Salle d'eau" keep theirs, where "Capteur
 * d'humidité Salon" is "Salon". A join of one letter ("a", "e", "i", "o", "v", "y") is a label where it stands after
 * the place or last, and stays: "Sensor Kid E" is "Kid E", "Hall I Sensor" "Hall I"; only before the place does it go,
 * "Termostat V obývačke" being "obývačke". What goes is cut from the name as written.
 */
function withoutPlaceNoise(name: string): string {
  const written = name.normalize('NFC');
  const read = [...written]
    .map((letter) => {
      const bare = plain(letter);
      return bare.length === letter.length ? bare : letter;
    })
    .join('');
  const found = (text: string, words: RegExp, join: boolean): PlaceWord[] =>
    [...text.matchAll(words)]
      // a join glued to an apostrophe and a letter is part of a name, unless it is an elision itself
      .filter(
        ({ index, 0: word }) =>
          !join || /['’]$/.test(word) || !/^['’]\p{L}/u.test(text.slice(index + word.length)),
      )
      .map(({ index, 0: word }) => ({
        at: index,
        end: index + word.length,
        join,
      }));
  const words = [...found(read, PLACE_NOISE, false), ...found(written, PLACE_JOINS, true)].sort(
    (a, b) => a.at - b.at,
  );
  // whether the nearest word that is no join stays, one way from a join: a letter or a figure between two words found
  const staysBeside = (from: number, step: -1 | 1): boolean => {
    for (let at = from; ; at += step) {
      const here = words[at]!;
      const next = words[at + step];
      const between =
        step < 0
          ? written.slice(next?.end ?? 0, here.at)
          : written.slice(here.end, next?.at ?? written.length);
      if (/[\p{L}\p{N}]/u.test(between)) return true;
      if (!next?.join) return false;
    }
  };
  // a join of one letter stays after the place or last; any other between two words that stay
  const stays = (word: PlaceWord, at: number): boolean =>
    word.end - word.at === 1
      ? staysBeside(at, -1) || !/[\p{L}\p{N}]/u.test(written.slice(word.end))
      : staysBeside(at, -1) && staysBeside(at, 1);
  let kept = '';
  let from = 0;
  words.forEach((word, at) => {
    if (word.join && stays(word, at)) return;
    kept += `${written.slice(from, word.at)} `;
    from = Math.max(from, word.end);
  });
  return kept + written.slice(from);
}

/**
 * A place cut out of its name in the name's case: a first word the cut left lower-case ("Termostat v obývačke" leaves
 * "obývačke") takes a capital where the name began with one ("Obývačke"), never where it did not, nor a word written
 * in mixed case ("iPhone").
 */
function inCaseOf(name: string, place: string): string {
  const first = /\p{L}/u.exec(name)?.[0] ?? '';
  const word = /[\p{L}\p{N}]+/u.exec(place)?.[0] ?? '';
  if (first === first.toLowerCase() || word !== word.toLowerCase()) return place;
  return place.replace(/\p{L}/u, (letter) => letter.toUpperCase());
}

/** A name without its place at either end, nor the separators that leaves there (「户外气温」 in 户外 is 气温). */
function withoutPlace(name: string, place: string): string {
  const lower = name.toLowerCase();
  const said = place.toLowerCase();
  const from = lower.startsWith(said) ? place.length : 0;
  const to = !from && lower.endsWith(said) ? name.length - place.length : name.length;
  return name.slice(from, to).replace(LOOSE_ENDS, '');
}

/** How many times each name is said. */
function counted(names: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

export type Registry = Pick<
  HomeAssistant,
  'states' | 'entities' | 'devices' | 'areas' | 'language' | 'user'
> &
  Partial<Pick<HomeAssistant, 'floors'>>;

/** A registry's table by entity id, less the entities `left` answers. */
const without = <T>(
  table: Readonly<Record<string, T>>,
  left: (id: string) => boolean,
): Record<string, T> => Object.fromEntries(Object.entries(table).filter(([id]) => !left(id)));

/** The keys that are a room's photo's alone (`RoomLook`). */
const LOOK = ['name_position', 'readout_style', 'readout_labels'] as const;

/**
 * What a raw configuration says of a room's photo, as its card takes it (#159): the dashboard's for every room
 * (`room_name_position` …: `prefix`), or one room's own (`rooms.<area>`). Words alone are read; one the card does not
 * know it draws as its default.
 */
export function roomLook(raw: unknown, prefix = ''): RoomLook {
  const said: Readonly<Record<string, unknown>> = Object(raw);
  return Object.fromEntries(
    LOOK.flatMap((key) => {
      const value = said[`${prefix}${key}`];
      return typeof value === 'string' ? [[key, value]] : [];
    }),
  ) as RoomLook;
}

export class HomeRegistry {
  /** The house as the dashboard reads it: without what its `exclude` leaves out, as if the house had none of it. */
  private readonly hass: Registry;
  /** What the dashboard's `exclude` leaves out (#141). */
  private readonly left: (id: string) => boolean;
  /** Entity ids by domain, sorted: every query starts from one domain's list. */
  private readonly byDomain = new Map<string, string[]>();
  /** Answers already computed: the registries do not change while a dashboard is generated. */
  private readonly cache = new Map<string, unknown>();
  /** The parts the dashboard is drawn without (`optional`), each said once. */
  private readonly missed = new Set<string>();

  /** The registries as core's readers take them (`areaEntities`, `areaClimate`). */
  get registries(): Registry {
    return this.hass;
  }

  /**
   * `rooms`: each room's own `include` and `exclude` by its area (the dashboard's `rooms`, #95). `exclude`: what no
   * view shows nor counts (the dashboard's `exclude`, #141), read as a room's `exclude` is (`inList`).
   */
  constructor(
    private readonly house: Registry,
    private readonly rooms: Readonly<Record<string, RoomTuning>> = {},
    exclude?: readonly string[],
  ) {
    this.left = inList(house, exclude);
    this.hass = Object.keys(house.states).some(this.left)
      ? {
          ...house,
          states: without(house.states, this.left),
          entities: without(house.entities ?? {}, this.left),
        }
      : house;
    for (const id of Object.keys(this.hass.states).sort()) {
      const domain = id.slice(0, id.indexOf('.'));
      const list = this.byDomain.get(domain);
      if (list) list.push(id);
      else this.byDomain.set(domain, [id]);
    }
  }

  private memo<T>(key: string, compute: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key) as T;
  }

  /**
   * A part the dashboard can do without: what it reads, else what the dashboard draws without it, where it throws on a
   * house nobody foresaw (#129: a fuel station's model, a number, took every dashboard down). The rest is drawn all the
   * same; the throw is said once on the console, by the part's name.
   */
  private optional<T>(part: string, read: () => T, without: T): T {
    try {
      return read();
    } catch (error) {
      if (!this.missed.has(part)) {
        this.missed.add(part);
        console.warn(`fluvy: the automatic dashboard is drawn without its ${part}`, error);
      }
      return without;
    }
  }

  /**
   * A room's own `include` and `exclude`, as the dashboard names them: its card's, its count's and its page's. The
   * raw configuration is read as written: anything but a room's two lists leaves the room as its area holds it. What
   * the dashboard leaves out of every view (`exclude`) and the room shows joins its `exclude`, so its card leaves it
   * out too; what the room includes it keeps, as a room does.
   */
  tuning(areaId: string): RoomTuning {
    const rooms: Readonly<Record<string, unknown>> = Object(this.rooms);
    const own = (Object.hasOwn(rooms, areaId) ? rooms[areaId] : undefined) as
      Partial<Record<keyof RoomTuning, unknown>> | null | undefined;
    const left = areaEntities(this.house, areaId).filter(this.left);
    const exclude = [...(Array.isArray(own?.exclude) ? own.exclude : []), ...left];
    return {
      ...(Array.isArray(own?.include) ? { include: own.include } : {}),
      ...(Array.isArray(own?.exclude) || left.length ? { exclude } : {}),
    };
  }

  /** What the dashboard asks of that room's photo alone (`rooms.<area>`: `roomLook`), over what it asks of every room's. */
  look(areaId: string): RoomLook {
    const rooms: Readonly<Record<string, unknown>> = Object(this.rooms);
    return roomLook(Object.hasOwn(rooms, areaId) ? rooms[areaId] : undefined);
  }

  /** What a room holds (`areaContents`, the room card's own rule, of the house as its card reads it), as tuned. */
  contents(areaId: string): AreaContents {
    return this.memo(`contents ${areaId}`, () =>
      areaContents(this.house, areaId, this.tuning(areaId)),
    );
  }

  t(key: MessageKey): string {
    return localize(this.hass, key);
  }
  /** The entity's state now (`playing`, `on`…). */
  state(id: string): string | undefined {
    return this.hass.states[id]?.state;
  }
  hasState(id: string): boolean {
    return Boolean(this.hass.states[id]);
  }

  /* ---------- one entity ---------- */

  private reg(id: string) {
    return this.hass.entities?.[id];
  }
  private attr<T>(id: string, name: string): T | undefined {
    return this.hass.states[id]?.attributes[name] as T | undefined;
  }
  private name(id: string): string {
    return String(this.attr<string>(id, 'friendly_name') ?? id);
  }
  private platform(id: string): string {
    return registryText(this.reg(id)?.platform) ?? '';
  }
  /** The device an entity is of. */
  deviceOf(id: string): string | undefined {
    return this.reg(id)?.device_id;
  }
  deviceClass(id: string): string {
    return String(this.attr<string>(id, 'device_class') ?? '');
  }
  /** Every reading the registry kept, in a stable order. */
  ids(): readonly string[] {
    return Object.keys(this.hass.states).sort();
  }

  /** The unit a reading carries, if it carries one. */
  unitOf(id: string): string {
    return String(this.attr(id, 'unit_of_measurement') ?? '');
  }

  stateClass(id: string): string {
    return String(this.attr<string>(id, 'state_class') ?? '');
  }
  /** Whether the entity's state carries an attribute of that name (a forecast's hours, a battery's capacity). */
  hasAttr(id: string, name: string): boolean {
    return this.attr<unknown>(id, name) !== undefined;
  }
  /** The id and the name together, in ordinary width (a full-width "ＬＥＤ" reads as "LED"): what the word rules look at. */
  label(id: string): string {
    return `${id} ${this.name(id)}`.normalize('NFKC');
  }

  deviceName(id: string): string | undefined {
    const deviceId = this.deviceOf(id);
    return deviceNameOf(deviceId ? this.hass.devices?.[deviceId] : undefined);
  }
  /** The entity's own words: the friendly name without the device's name in front of it. */
  ownName(id: string): string {
    const full = this.name(id);
    const device = this.deviceName(id);
    const own =
      device && full.toLowerCase().startsWith(device.toLowerCase())
        ? full.slice(device.length).replace(LOOSE_ENDS, '')
        : full;
    return own || full;
  }
  /** A name the dashboard reads for an entity (`optional`): its friendly name where it cannot be read. */
  private called(id: string, read: () => string): string {
    return this.optional('names', read, this.name(id));
  }
  /** What a tile or a row calls the entity: its own name, or its device's when the own name only says the kind of reading. */
  displayName(id: string): string {
    return this.called(id, () => {
      const own = this.ownName(id);
      return GENERIC.test(own.trim()) ? (this.deviceName(id) ?? own) : own;
    });
  }
  /** What a list row calls a device's reading (a battery, a phone): the device, else the display name. */
  deviceLabel(id: string): string {
    return this.called(id, () => this.deviceName(id) ?? this.displayName(id));
  }
  /**
   * Where a reading is: the area, else the device's name without the sensor words (and the separators they leave at
   * its ends: 「寝室：温度」 is 寝室) in the name's case, else the entity's name.
   */
  placeName(id: string): string {
    const area = this.areaName(this.areaOf(id));
    if (area) return area;
    return this.called(id, () => {
      const name = this.deviceName(id) ?? '';
      const device = withoutPlaceNoise(name)
        .replace(/\s{2,}/g, ' ')
        .replace(LOOSE_ENDS, '');
      return device ? inCaseOf(name, device) : this.displayName(id);
    });
  }
  /**
   * A reading's own words: its name without its device's in front of it (`ownName`) nor its place at either end; none
   * where Home Assistant gives it no name.
   */
  private ownWords(id: string): string {
    return this.attr(id, 'friendly_name') === undefined
      ? ''
      : withoutPlace(this.ownName(id), this.placeName(id));
  }
  /**
   * Labels for what is shown together (a card's rows, or cards built together), each as `label` says it, save where
   * two would read alike (#170): those gain, after a "·", what tells them apart, the reading's own words, else its
   * device's name, else its place ("配电室 · 实时放电功率", "大气压 · 寿光天气"). A label said once stays as it is;
   * what nothing tells apart stays alike.
   */
  apart(ids: readonly string[], label: (id: string) => string): (id: string) => string {
    const base = new Map(ids.map((id) => [id, label(id)]));
    const said = new Map(base);
    const tellers = [
      (id: string) => this.ownWords(id),
      (id: string) => this.deviceName(id) ?? '',
      (id: string) => this.placeName(id),
    ];
    for (const tell of tellers) {
      const alike = counted(said.values());
      const told = new Map<string, string>();
      for (const [id, name] of base) {
        if (alike.get(said.get(id)!)! < 2) continue;
        // read only where a label repeats, and as every name is: a throw costs the part alone (`optional`)
        const part = this.optional('names', () => tell(id), '');
        if (part && part.toLowerCase() !== name.toLowerCase()) told.set(id, `${name} · ${part}`);
      }
      // a part that two would share tells neither apart
      const seen = counted([
        ...ids.filter((id) => !told.has(id)).map((id) => said.get(id)!),
        ...told.values(),
      ]);
      for (const [id, name] of told) if (seen.get(name) === 1) said.set(id, name);
    }
    return (id) => said.get(id) ?? label(id);
  }
  /** `name` for a card only when it improves on what the card would show by itself. */
  named(id: string, name = this.displayName(id)): Record<string, string> {
    return name && name !== this.name(id) ? { name } : {};
  }

  areaOf(id: string): string | undefined {
    return areaOf(this.hass, id);
  }
  /** The areas floor by floor, the ones on no floor last. */
  get areas(): readonly AreaRegistryEntry[] {
    return this.memo('areas', () => areasInOrder(this.hass));
  }
  get floors(): readonly FloorRegistryEntry[] {
    return this.memo('floors', () => floorsInOrder(this.hass));
  }
  get zones(): readonly string[] {
    return this.domain('zone');
  }
  areaName(areaId: string | undefined): string | undefined {
    return areaId ? registryText(this.hass.areas?.[areaId]?.name) : undefined;
  }

  /** An entity a dashboard should show: known, not hidden, not a config or diagnostic entity unless asked for. */
  usable(id: string, allowDiagnostic = false): boolean {
    return usableEntity(this.hass, id, { diagnostic: allowDiagnostic });
  }

  dimmable(id: string): boolean {
    return (
      id.startsWith('light.') &&
      (this.attr<string[]>(id, 'supported_color_modes') ?? []).some((m) => m !== 'onoff')
    );
  }
  outdoor(id: string): boolean {
    const where = `${this.label(id)} ${this.areaName(this.areaOf(id)) ?? ''}`;
    return says(where, PLACE_WORDS) === 'outdoor';
  }
  private isLightSwitch(id: string): boolean {
    return id.startsWith('switch.') && says(plain(this.label(id)), SWITCH_WORDS) === 'light';
  }
  private fromWeather(id: string): boolean {
    return WEATHER_PLATFORMS.test(this.platform(id)) || this.forecast(id);
  }
  /**
   * Whether a reading is a forecast, what is still to come (Solcast's, Forecast.Solar's; "… forecast", 预测,
   * "Prognose", "previsión"): never what is measured.
   */
  forecast(id: string): boolean {
    return FORECAST.test(this.label(id)) || FORECAST_PLATFORMS.test(this.platform(id));
  }

  /** The power and energy readings beside an entity: the same device's (or the same name stem's) power, and its energy — today's first. */
  readoutsOf(id: string): readonly string[] {
    const device = this.deviceOf(id);
    const stem = id.slice(id.indexOf('.') + 1);
    const siblings = this.domain('sensor', true).filter(
      (s) => (device && this.deviceOf(s) === device) || s.startsWith(`sensor.${stem}_`),
    );
    const power = siblings.find((s) => this.deviceClass(s) === 'power');
    const energy = siblings
      .filter((s) => this.deviceClass(s) === 'energy')
      .sort((a, b) => Number(TODAY.test(b)) - Number(TODAY.test(a)))[0];
    return [power, energy].filter((s): s is string => Boolean(s));
  }
  /** The sensors of a device class beside an entity: the same device, or the same name before its `_power`. */
  beside(id: string, deviceClass: string): readonly string[] {
    const device = this.deviceOf(id);
    const stem = id.slice(id.indexOf('.') + 1).replace(/_power$/, '');
    return this.domain('sensor', true).filter(
      (s) =>
        s !== id &&
        this.deviceClass(s) === deviceClass &&
        ((device !== undefined && this.deviceOf(s) === device) || s.startsWith(`sensor.${stem}_`)),
    );
  }
  /** The temperature sensor of the same device as a humidity sensor, for the humidity card's dew point. */
  temperatureBeside(humidity: string): string | undefined {
    const device = this.deviceOf(humidity);
    const stem = humidity.replace(/_humidity.*$/, '');
    return this.temperatures.find(
      (t) => (device && this.deviceOf(t) === device) || t.startsWith(stem),
    );
  }
  /* ---------- lists ---------- */

  domain(domain: string, allowDiagnostic = false): readonly string[] {
    return this.memo(`domain:${domain}:${allowDiagnostic}`, () =>
      (this.byDomain.get(domain) ?? []).filter((id) => this.usable(id, allowDiagnostic)),
    );
  }
  sensors(deviceClass: string, allowDiagnostic = false): readonly string[] {
    return this.domain('sensor', allowDiagnostic).filter(
      (id) => this.deviceClass(id) === deviceClass,
    );
  }
  first(domain: string): string | undefined {
    return this.domain(domain)[0];
  }

  get lights(): readonly string[] {
    return this.memo('lights', () => [
      ...this.domain('light'),
      ...this.domain('switch').filter((id) => this.isLightSwitch(id)),
    ]);
  }
  /** Switches that are appliances (not lights, not a device's settings), one per device, the plain outlet before its twin. */
  get appliances(): readonly string[] {
    return this.memo('appliances', () => {
      const all = this.domain('switch').filter(
        (id) =>
          !this.isLightSwitch(id) &&
          (this.deviceClass(id) === 'outlet' || !NOT_APPLIANCE.test(this.label(id))),
      );
      const seen = new Set<string>();
      return all
        .sort((a, b) => Number(TWIN_SWITCH.test(a)) - Number(TWIN_SWITCH.test(b)))
        .filter((id) => {
          const device = this.deviceOf(id) ?? id;
          if (seen.has(device)) return false;
          seen.add(device);
          return true;
        })
        .sort();
    });
  }
  /** Thermostats and heaters, the ones running first (a running heat pump is the house's thermostat, not the idle AC). */
  get climate(): readonly string[] {
    return this.memo('climate', () =>
      [...this.domain('climate'), ...this.domain('water_heater'), ...this.domain('humidifier')]
        .map((id, index) => ({ id, index, idle: this.hass.states[id]?.state === 'off' }))
        .sort((a, b) => Number(a.idle) - Number(b.idle) || a.index - b.index)
        .map(({ id }) => id),
    );
  }
  /** Weather services, the home's own forecast first (`weather.forecast_home`, `…casa`). */
  get weather(): readonly string[] {
    return this.memo('weather', () =>
      [...this.domain('weather')].sort(
        (a, b) => Number(!/home|casa|hogar/i.test(a)) - Number(!/home|casa|hogar/i.test(b)),
      ),
    );
  }
  /** Updates: HA files most of them as config entities, yet they are what a Sensors view lists. */
  get updates(): readonly string[] {
    return this.memo('updates', () =>
      (this.byDomain.get('update') ?? []).filter(
        (id) => this.hass.states[id] && !this.reg(id)?.hidden,
      ),
    );
  }
  /** A room's temperatures: not the weather service's, nor an appliance's (a fridge's, an oven's: its card's). */
  get temperatures(): readonly string[] {
    return this.memo('temperatures', () =>
      this.sensors('temperature').filter((id) => !this.fromWeather(id) && !this.ofAppliance(id)),
    );
  }
  get humidities(): readonly string[] {
    return this.memo('humidities', () =>
      this.sensors('humidity').filter((id) => !this.fromWeather(id) && !this.ofAppliance(id)),
    );
  }
  get powers(): readonly string[] {
    return this.sensors('power');
  }
  get energies(): readonly string[] {
    return this.sensors('energy', true);
  }
  get batteries(): readonly string[] {
    return this.memo('batteries', () =>
      this.sensors('battery', true).filter((id) => this.platform(id) !== 'mobile_app'),
    );
  }
  get phones(): readonly string[] {
    return this.memo('phones', () =>
      this.sensors('battery', true).filter((id) => this.platform(id) === 'mobile_app'),
    );
  }
  get people(): readonly string[] {
    return this.domain('person');
  }
  get openings(): readonly string[] {
    return this.memo('openings', () =>
      this.domain('binary_sensor').filter((id) => OPENINGS.has(this.deviceClass(id))),
    );
  }
  get plants(): readonly string[] {
    return this.memo('plants', () => [
      ...this.sensors('moisture', true),
      ...this.domain('sensor').filter(
        (id) => /soil|planta|plant/i.test(this.label(id)) && this.deviceClass(id) !== 'moisture',
      ),
    ]);
  }
  get helpers(): readonly string[] {
    return this.memo('helpers', () => [
      ...this.domain('input_number'),
      ...this.domain('input_boolean'),
      ...this.domain('input_select'),
      ...this.domain('input_datetime'),
    ]);
  }
  get automations(): readonly string[] {
    return this.domain('automation');
  }
  /** Blinds, curtains, awnings: what a room opens to the light (garage doors and gates are security). */
  get covers(): readonly string[] {
    return this.memo('covers', () =>
      this.domain('cover').filter((id) => !GATEWAYS.has(this.deviceClass(id))),
    );
  }
  /** Garage doors and gates. */
  get gateways(): readonly string[] {
    return this.memo('gateways', () =>
      this.domain('cover').filter((id) => GATEWAYS.has(this.deviceClass(id))),
    );
  }
  get fans(): readonly string[] {
    return this.domain('fan');
  }
  get locks(): readonly string[] {
    return this.domain('lock');
  }
  get alarms(): readonly string[] {
    return this.domain('alarm_control_panel');
  }
  get cameras(): readonly string[] {
    return this.domain('camera');
  }
  /**
   * The house's 3D printers: the devices of a printer integration (OctoPrint, PrusaLink, Bambu Lab, Moonraker,
   * Creality, Elegoo, Anycubic, Snapmaker, FlashForge), and any other device with a printer's signature.
   */
  get printers(): readonly string[] {
    return this.memo('printers', () =>
      this.optional('printers', () => printerDevices(this.hass), []),
    );
  }
  /**
   * The house's appliances (#47): the devices the appliance card reads as one — a washer or a fridge of its
   * integration, a kettle on its plug — found strictly, as the card's own search finds them.
   */
  get applianceDevices(): readonly string[] {
    return this.memo('applianceDevices', () =>
      this.optional('appliances', () => applianceDevices(this.hass), []),
    );
  }
  /** What an appliance is, as its card reads it (`appliance` where nothing says more): a feeder is a pet's. */
  applianceKind(device: string): ApplianceKind {
    return this.optional(
      'appliances',
      () => {
        const verdict = kindOf(signalsOf(this.hass, device));
        return verdict && 'kind' in verdict ? verdict.kind : 'appliance';
      },
      'appliance',
    );
  }
  /**
   * The appliances' switches a tile shows: the loads (`isLoad`, as a room counts its devices: never a dishwasher's
   * option) of a device no appliance card shows (`appliances` keeps every one: the energy views read the plugs' power
   * through it).
   */
  get applianceTiles(): readonly string[] {
    return this.memo('applianceTiles', () =>
      this.appliances.filter((id) => isLoad(this.hass, id) && !this.ofAppliance(id)),
    );
  }
  /** Whether an entity is one of an appliance’s (its card shows it: never a room’s reading). */
  ofAppliance(id: string): boolean {
    const device = this.deviceOf(id);
    return (
      device !== undefined &&
      this.memo('applianceSet', () => new Set(this.applianceDevices)).has(device)
    );
  }
  /** The area a device is in: its own, else its first entity's that has one. */
  deviceArea(device: string): string | undefined {
    const own = this.hass.devices?.[device]?.area_id;
    if (own) return own;
    return this.memo('deviceAreas', () => {
      const areas = new Map<string, string>();
      for (const entry of Object.values(this.hass.entities ?? {}))
        if (entry.device_id && entry.area_id && !areas.has(entry.device_id))
          areas.set(entry.device_id, entry.area_id);
      return areas;
    }).get(device);
  }
  get players(): readonly string[] {
    return this.domain('media_player');
  }
  get calendars(): readonly string[] {
    return this.domain('calendar');
  }
  get lists(): readonly string[] {
    return this.domain('todo');
  }
  get timers(): readonly string[] {
    return this.domain('timer');
  }
  get scenes(): readonly string[] {
    return this.domain('scene');
  }
  /** What a person runs by hand: scripts and buttons. */
  get runnables(): readonly string[] {
    return this.memo('runnables', () => [...this.domain('script'), ...this.domain('input_button')]);
  }
}
