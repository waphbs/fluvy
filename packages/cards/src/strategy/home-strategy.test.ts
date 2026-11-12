// @vitest-environment happy-dom
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import '../index.js';
import { CAPS } from './caps.js';
import { findEnergyRoles } from './energy-roles.js';
import { generate } from './generate.js';
import { FluvyHomeStrategy } from './home-strategy.js';
import { HomeRegistry } from './home-registry.js';
import { roomParts } from './rooms.js';
import type { View } from './types.js';
import { BATTERY_POWER, TODAY } from './words.generated.js';
import {
  hcCoffee,
  hcDishwasher,
  hcOven,
  houseOf,
  lgDryer,
  lgFridge,
  lgWasher,
  mieleHob,
  petFixtures,
  plugWasher,
  tuyaKettle,
} from '../appliance/fixtures/index.js';
import { areaContents, inList, type HomeAssistant, type RoomTuning } from '@fluvy/core';

import {
  DEMO_ENERGY_SOURCES,
  DEMO_EXTRAS,
  DEMO_HEAT_PUMP_READINGS,
  DEMO_ROOMS,
  demoHass,
  type DemoEntity,
} from '@fluvy/demo-home';

/** The demo home as a strategy sees it, with what a test adds on top. */
function house(more: readonly DemoEntity[] = [], consumption?: readonly string[]) {
  return demoHass({ more, ...(consumption ? { consumption } : {}) }) as never;
}

const entity = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  registry: Record<string, unknown> = {},
): DemoEntity => ({ id, state, attributes, registry });

const types = (cards: readonly { type: string }[]): string[] =>
  cards.map((c) => c.type.replace('custom:fluvy-', '').replace('-card', ''));

describe('custom:fluvy-home strategy — a house named in Japanese', () => {
  /** A power reading of that name. */
  const power = (id: string, friendly_name: string) =>
    [
      id,
      {
        entity_id: id,
        state: '100',
        attributes: { friendly_name, device_class: 'power', unit_of_measurement: 'W' },
        last_changed: '',
        last_updated: '',
        context: { id: '', parent_id: null, user_id: null },
      },
    ] as const;
  /** A house of those readings, nothing else, in that language. */
  const powerHouse = (states: ReadonlyArray<ReturnType<typeof power>>, language: string) =>
    new HomeRegistry({
      states: Object.fromEntries(states),
      entities: {},
      devices: {},
      areas: {},
      language,
    } as never);

  it('reads a switch as a light by its kana or kanji, a garden as outdoors, a full-width name in ordinary width', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.ribingu_no_denki', 'on', { friendly_name: 'リビングの電気' }),
        entity('switch.shinshitsu', 'off', { friendly_name: '寝室の照明' }),
        entity('switch.niwa', 'off', { friendly_name: '庭のライト' }),
        entity('switch.led_tape', 'off', { friendly_name: 'ＬＥＤ テープ' }),
        entity('switch.denki_ketoru', 'off', { friendly_name: '電気ケトル' }),
        entity('switch.despot', 'off', { friendly_name: 'Despot' }),
      ]),
    );
    const { lights } = registry;
    for (const id of [
      'switch.ribingu_no_denki',
      'switch.shinshitsu',
      'switch.niwa',
      'switch.led_tape',
    ])
      expect(lights, id).toContain(id);
    for (const id of ['switch.denki_ketoru', 'switch.despot']) expect(lights, id).not.toContain(id);
    expect(registry.outdoor('switch.niwa')).toBe(true);
    expect(registry.outdoor('switch.shinshitsu')).toBe(false);
  });

  it('reads a switch among a light’s words and the appliances’, the longest of words that overlap winning, and a place against the house’s', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.denki_potto', 'off', { friendly_name: '電気ポット' }),
        entity('switch.oobun_toosutaa', 'off', { friendly_name: 'オーブントースター' }),
        entity('switch.gasu_renji', 'off', { friendly_name: 'ガスレンジ' }),
        entity('switch.niwa_no_raito', 'off', { friendly_name: '庭のライト' }),
        entity('switch.katei_konsento', 'off', { friendly_name: '家庭用コンセント' }),
        entity('switch.wasserkocher', 'off', { friendly_name: 'Wasserkocher Küche' }),
        entity('switch.backofen_lampe', 'off', { friendly_name: 'Lampe Backofen' }),
      ]),
    );
    const { lights, appliances } = registry;
    // a kettle, a toaster, a hob on their plugs: the appliance's word holds the light's 電気, or stands alone
    for (const id of [
      'switch.denki_potto',
      'switch.oobun_toosutaa',
      'switch.gasu_renji',
      'switch.wasserkocher',
    ]) {
      expect(lights, id).not.toContain(id);
      expect(appliances, id).toContain(id);
    }
    // a light's word that stands apart from an appliance's keeps the light (the light's words are listed first)
    for (const id of ['switch.niwa_no_raito', 'switch.backofen_lampe'])
      expect(lights, id).toContain(id);
    // 家庭 (the household) holds no garden 庭; 庭のライト is in the garden
    expect(registry.outdoor('switch.katei_konsento')).toBe(false);
    expect(registry.outdoor('switch.niwa_no_raito')).toBe(true);
  });

  it('names its energy readings’ roles: the sun, what is bought and sold, the battery, the charger, the house', () => {
    const registry = powerHouse(
      [
        power('sensor.taiyoukou', '太陽光発電 電力'),
        power('sensor.kaiden', '買電 電力'),
        power('sensor.baiden', '売電 電力'),
        power('sensor.chikudenchi', '蓄電池 電力'),
        power('sensor.ev_juudenki', 'EV充電器 電力'),
        power('sensor.katei', '家庭の消費電力'),
      ],
      'ja',
    );
    expect(findEnergyRoles(registry, null)).toMatchObject({
      solarPowers: [{ id: 'sensor.taiyoukou' }],
      gridPower: 'sensor.kaiden',
      gridImport: 'sensor.kaiden',
      gridExport: 'sensor.baiden',
      batteryPowers: [{ id: 'sensor.chikudenchi' }],
      charger: 'sensor.ev_juudenki',
      homePower: 'sensor.katei',
    });
  });

  it('never takes a bathroom for the house: "casa de banho" and "casa de baño" are rooms, "consumo da casa" is the house', () => {
    const bathrooms = [
      power('sensor.toalheiro_casa_de_banho_power', 'Toalheiro casa de banho'),
      power('sensor.calefactor_casa_de_bano_power', 'Calefactor casa de baño'),
    ];
    expect(findEnergyRoles(powerHouse(bathrooms, 'pt-PT'), null).homePower).toBeUndefined();
    expect(
      findEnergyRoles(
        powerHouse([...bathrooms, power('sensor.consumo_da_casa', 'Consumo da casa')], 'pt-PT'),
        null,
      ).homePower,
    ).toBe('sensor.consumo_da_casa');
  });

  it('takes Slovak’s house as a word: a domestic water heater or a random plug is no "dom", "Spotreba domu" is the house', () => {
    const others = [
      power('sensor.domestic_hot_water_power', 'Domestic hot water'),
      power('sensor.random_plug_power', 'Random plug'),
    ];
    expect(findEnergyRoles(powerHouse(others, 'sk'), null).homePower).toBeUndefined();
    expect(
      findEnergyRoles(
        powerHouse([...others, power('sensor.spotreba_domu', 'Spotreba domu')], 'sk'),
        null,
      ).homePower,
    ).toBe('sensor.spotreba_domu');
    expect(findEnergyRoles(powerHouse([power('sensor.dom', 'Dom')], 'sk'), null).homePower).toBe(
      'sensor.dom',
    );
  });

  it('takes Slovak’s today and its home battery as words, never inside another (hardness, Bessie)', () => {
    for (const text of ['water hardness', 'bessie plug', 'kindness lamp'])
      expect([TODAY.test(text), BATTERY_POWER.test(text)], text).toEqual([false, false]);
    expect(TODAY.test('spotreba dnes')).toBe(true);
    expect(TODAY.test('dnesna spotreba')).toBe(true);
    expect(BATTERY_POWER.test('bess power')).toBe(true);
  });

  it('reads a Polish house by its names as written: a light, a garden, a washer’s switch, a child lock that is none', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.s1', 'on', { friendly_name: 'Światło w salonie' }),
        entity('switch.s2', 'off', { friendly_name: 'Lampa ogród' }),
        entity('switch.s3', 'off', { friendly_name: 'Włącznik pralki' }),
        entity('switch.s4', 'off', { friendly_name: 'Blokada rodzicielska zmywarki' }),
      ]),
    );
    const { lights, appliances } = registry;
    expect(lights).toEqual(expect.arrayContaining(['switch.s1', 'switch.s2']));
    expect(registry.outdoor('switch.s2')).toBe(true);
    expect(registry.outdoor('switch.s1')).toBe(false);
    // a switch (włącznik) is no setting to switch on (włącz): the washer's plug is the washer
    expect(appliances).toContain('switch.s3');
    expect(appliances).not.toContain('switch.s4');
  });

  it('reads a house named in Simplified Chinese by its Han, anywhere in a name: its lights, its garden, its appliances’ plugs', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.z1', 'on', { friendly_name: '卧室 灯' }),
        entity('switch.z2', 'off', { friendly_name: '主卧吊灯' }),
        entity('switch.z3', 'off', { friendly_name: '花园灯' }),
        entity('switch.z4', 'off', { friendly_name: '洗碗机插座' }),
        entity('switch.z5', 'off', { friendly_name: '厨房热水壶' }),
        entity('switch.z6', 'off', { friendly_name: '洗碗机童锁' }),
      ]),
    );
    const { lights, appliances } = registry;
    expect(lights).toEqual(expect.arrayContaining(['switch.z1', 'switch.z2', 'switch.z3']));
    expect(registry.outdoor('switch.z3')).toBe(true);
    expect(registry.outdoor('switch.z1')).toBe(false);
    // a dishwasher's and a kettle's plugs are those appliances, not lights; a child lock is no appliance
    for (const id of ['switch.z4', 'switch.z5']) {
      expect(lights, id).not.toContain(id);
      expect(appliances, id).toContain(id);
    }
    expect(appliances).not.toContain('switch.z6');
  });

  it('names a Chinese house’s energy readings’ roles: the sun, the grid, the battery, the charger, the house', () => {
    const registry = powerHouse(
      [
        power('sensor.pv', '光伏发电功率'),
        power('sensor.meter', '电网 功率'),
        power('sensor.storage', '储能电池 功率'),
        power('sensor.wallbox', '充电桩 功率'),
        power('sensor.house', '全屋用电'),
      ],
      'zh-Hans',
    );
    expect(findEnergyRoles(registry, null)).toMatchObject({
      solarPowers: [{ id: 'sensor.pv' }],
      gridPower: 'sensor.meter',
      batteryPowers: [{ id: 'sensor.storage' }],
      charger: 'sensor.wallbox',
      homePower: 'sensor.house',
    });
  });

  it('reads a Russian house by its names as written: its lights, its garden, its appliances’ switches, a lock that is none', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.r1', 'on', { friendly_name: 'Свет в гостиной' }),
        entity('switch.r2', 'off', { friendly_name: 'Фонарь сад' }),
        entity('switch.r3', 'off', { friendly_name: 'Люстра' }),
        entity('switch.r4', 'off', { friendly_name: 'Розетка стиральной машины' }),
        entity('switch.r5', 'off', { friendly_name: 'Чайник' }),
        entity('switch.r6', 'off', { friendly_name: 'Блокировка посудомойки' }),
      ]),
    );
    const { lights, appliances } = registry;
    expect(lights).toEqual(expect.arrayContaining(['switch.r1', 'switch.r2', 'switch.r3']));
    expect(registry.outdoor('switch.r2')).toBe(true);
    expect(registry.outdoor('switch.r1')).toBe(false);
    for (const id of ['switch.r4', 'switch.r5']) {
      expect(lights, id).not.toContain(id);
      expect(appliances, id).toContain(id);
    }
    expect(appliances).not.toContain('switch.r6');
  });

  it('names a Russian house’s energy readings’ roles: the sun, what is bought and sold, the battery, the charger, the house', () => {
    const registry = powerHouse(
      [
        power('sensor.solnechnye_paneli', 'Солнечные панели'),
        power('sensor.iz_seti', 'Импорт из сети'),
        power('sensor.v_set', 'Экспорт в сеть'),
        power('sensor.akkumuliator', 'Аккумулятор'),
        power('sensor.zariadnaia_stantsiia', 'Зарядная станция'),
        power('sensor.potreblenie_doma', 'Потребление дома'),
      ],
      'ru',
    );
    expect(findEnergyRoles(registry, null)).toMatchObject({
      solarPowers: [{ id: 'sensor.solnechnye_paneli' }],
      gridPower: 'sensor.iz_seti',
      gridImport: 'sensor.iz_seti',
      gridExport: 'sensor.v_set',
      batteryPowers: [{ id: 'sensor.akkumuliator' }],
      charger: 'sensor.zariadnaia_stantsiia',
      homePower: 'sensor.potreblenie_doma',
    });
    // a power strip (сетевой фильтр), a home cinema and a sunny side say no role: "сеть", "дом" and the sun's panels
    // are words of their own
    for (const name of ['Сетевой фильтр', 'Домашний кинотеатр', 'Солнечная сторона']) {
      const roles = findEnergyRoles(powerHouse([power('sensor.x', name)], 'ru'), null);
      expect(
        [roles.solarPowers, roles.gridPower, roles.batteryPowers, roles.homePower],
        name,
      ).toEqual([[], undefined, [], undefined]);
    }
  });
});

describe('custom:fluvy-home strategy — a place named by its device, no separator left hanging', () => {
  /** A house of readings, each on a device of its own name, in no area: the place is the device's name. */
  const readings = (devices: Record<string, string>, names: Record<string, string> = {}) =>
    new HomeRegistry({
      states: Object.fromEntries(
        Object.keys(devices).map((id) => [
          id,
          {
            entity_id: id,
            state: '21',
            attributes: { friendly_name: names[id] ?? devices[id], device_class: 'temperature' },
            last_changed: '',
            last_updated: '',
            context: { id: '', parent_id: null, user_id: null },
          },
        ]),
      ),
      entities: Object.fromEntries(
        Object.keys(devices).map((id) => [id, { entity_id: id, device_id: `d.${id}` }]),
      ),
      devices: Object.fromEntries(
        Object.entries(devices).map(([id, name]) => [`d.${id}`, { id: `d.${id}`, name }]),
      ),
      areas: {},
      language: 'ja',
    } as never);

  it('takes the separators the sensor words leave at its ends with them, in Japanese and in Latin letters', () => {
    const registry = readings({
      'sensor.kitchen': 'キッチン温度・湿度',
      'sensor.bedroom': '寝室：温度',
      'sensor.study': '書斎 ／ 温度計',
      'sensor.hall': 'Hall · Temperature',
      'sensor.attic': 'Attic temperature',
      'sensor.porch': 'Temperature – Porch',
    });
    expect(registry.placeName('sensor.kitchen')).toBe('キッチン');
    expect(registry.placeName('sensor.bedroom')).toBe('寝室');
    expect(registry.placeName('sensor.study')).toBe('書斎');
    expect(registry.placeName('sensor.hall')).toBe('Hall');
    expect(registry.placeName('sensor.attic')).toBe('Attic');
    expect(registry.placeName('sensor.porch')).toBe('Porch');
  });

  it('keeps a separator inside the place, and the entity’s name for a device named only by sensor words', () => {
    const registry = readings(
      { 'sensor.loft': 'Loft · Nord Temperatur', 'sensor.bare': '温湿度センサー' },
      { 'sensor.bare': '温湿度センサー 書斎' },
    );
    expect(registry.placeName('sensor.loft')).toBe('Loft · Nord');
    expect(registry.placeName('sensor.bare')).toBe(registry.displayName('sensor.bare'));
    expect(registry.placeName('sensor.bare')).toBe('書斎');
  });

  it('reads an entity’s own name without the device’s in front of it, nor a separator at either end', () => {
    const registry = readings(
      { 'sensor.a': 'Kitchen sensor', 'sensor.b': '寝室センサー' },
      { 'sensor.a': 'Kitchen sensor: Temperature', 'sensor.b': '寝室センサー／温度 ・' },
    );
    expect(registry.ownName('sensor.a')).toBe('Temperature');
    expect(registry.ownName('sensor.b')).toBe('温度');
  });

  it('reads the sensor words on a name without its accents, each a whole word beside any letter, and keeps the place as written', () => {
    const registry = readings({
      'sensor.sk': 'Snímač Obývačka',
      'sensor.sk_humidity': 'Čidlo vlhkosť Spálňa',
      'sensor.de': 'Thermostat Großes Bad',
      'sensor.fr': 'Capteur humidité Chambre à coucher',
      'sensor.hu': 'Hőmérséklet és páratartalom érzékelő Nappali',
      'sensor.pt': 'Termóstato Salão',
      'sensor.tr': 'Sıcaklık sensörü Oturma odası',
    });
    expect(registry.placeName('sensor.sk')).toBe('Obývačka');
    // "a" is a word of its own only where it stands alone: never Spálňa's end, nor Großes's "es", nor Salão's "o"
    expect(registry.placeName('sensor.sk_humidity')).toBe('Spálňa');
    expect(registry.placeName('sensor.de')).toBe('Großes Bad');
    // a word of one letter keeps its mark: French "à" is no article "a"
    expect(registry.placeName('sensor.fr')).toBe('Chambre à coucher');
    expect(registry.placeName('sensor.hu')).toBe('Nappali');
    expect(registry.placeName('sensor.pt')).toBe('Salão');
    expect(registry.placeName('sensor.tr')).toBe('Oturma odası');
  });

  /**
   * Every language's place words of a category, as the words files write them; a stem of its own regex (Japanese の
   * before a reading's word) is the generator's to test.
   */
  const listed = async (category: 'place_noise' | 'place_joins'): Promise<string[]> => {
    const folder = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'core',
      'src',
      'i18n',
      'words',
    );
    const lists = await Promise.all(
      (await readdir(folder)).map(
        async (file) =>
          (JSON.parse(await readFile(join(folder, file), 'utf8')) as Record<string, string[]>)[
            category
          ] ?? [],
      ),
    );
    return lists.flat().filter((stem) => !/[\\[\]()$^]/.test(stem));
  };
  /** Where each name places its reading, each the name of a device of its own in no area. */
  const placed = (names: readonly string[]): string[] => {
    const registry = readings(Object.fromEntries(names.map((name, at) => [`sensor.${at}`, name])));
    return names.map((_, at) => registry.placeName(`sensor.${at}`));
  };

  it('reads a word that joins as written, a mark making another word: "Nº", "Nó" and "Là" are none of the articles they fold into', async () => {
    expect(placed(['Sensor Quarto Nº 2', 'Sensor Nó 3', 'Capteur Là-haut'])).toEqual([
      'Quarto Nº 2',
      'Nó 3',
      'Là-haut',
    ]);
    // every language's: each beside a sensor word goes, and with a mark on its first vowel stays (unless that is one too),
    // capitalised as the name is
    const joins = (await listed('place_joins')).filter((join) => !join.endsWith("'"));
    const marked = joins
      .map((join) => join.replace(/[aeiouy]/, (vowel) => `${vowel}\u0301`).normalize('NFC'))
      .filter((word) => !joins.includes(word));
    expect(marked.length).toBeGreaterThan(30);
    expect(placed(joins.map((join) => `Sensor ${join} 3`))).toEqual(joins.map(() => '3'));
    expect(placed(marked.map((word) => `Sensor ${word} 3`))).toEqual(
      marked.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)} 3`),
    );
  });

  it('keeps a letter alone after the place or last as the place’s own label, in every language, and takes one before it', async () => {
    expect(
      placed([
        'Sensor Kid E',
        'Hall I Sensor',
        'Bedroom A Sensor',
        'Sensor Kid Y',
        'Termostat V obývačke',
        'Sensor A nappali',
        'Sensor O’Brien Room',
        "Sensor O'Brien Room",
      ]),
    ).toEqual([
      'Kid E',
      'Hall I',
      'Bedroom A',
      'Kid Y',
      'Obývačke',
      'Nappali',
      'O’Brien Room',
      "O'Brien Room",
    ]);
    // every language's joins of one letter: a label after the place or last, a join only before it or between two places
    const letters = (await listed('place_joins')).filter((join) => [...join].length === 1);
    expect(letters).toEqual(expect.arrayContaining(['a', 'e', 'i', 'o', 'v', 'y']));
    for (const letter of letters) {
      const label = letter.toUpperCase();
      expect(
        placed([
          `Sensor Kid ${label}`,
          `Hall ${label} Sensor`,
          `Hall ${letter}`,
          `Sensor ${letter} Hall`,
          `Sensor ${label} Hall`,
          `Hall ${letter} Kitchen Sensor`,
          `Temperature ${letter} Humidity Sensor Hall`,
        ]),
        letter,
      ).toEqual([
        `Kid ${label}`,
        `Hall ${label}`,
        `Hall ${letter}`,
        'Hall',
        'Hall',
        `Hall ${letter} Kitchen`,
        'Hall',
      ]);
    }
  });

  it('keeps the case the place was written in: a capital where the name began with one, never where it did not', async () => {
    // every language's sensor words before a place written in lower case
    const noise = await listed('place_noise');
    const capital = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    expect(placed(noise.map((word) => `${capital(word)} kuchyňa`))).toEqual(
      noise.map((word) => (word === capital(word) ? 'kuchyňa' : 'Kuchyňa')),
    );
    expect(placed(noise.map((word) => `${word} kuchyňa`))).toEqual(noise.map(() => 'kuchyňa'));
    // a place's own capitals stay as written, and a word in mixed case is never capitalised
    expect(
      placed(['Sensor iPhone Lounge', 'Sensor Wohnzimmer', 'Thermostat bad OG', 'sensor obývačka']),
    ).toEqual(['iPhone Lounge', 'Wohnzimmer', 'Bad OG', 'obývačka']);
  });

  it('takes an elision with the sensor word it leans on, in either apostrophe, and keeps one between two words that stay', () => {
    expect(
      placed([
        "Capteur d'humidité Salon",
        'Capteur d’humidité Salon',
        "Sensore dell'umidità Cucina",
        "Capteur l'Entrée",
        "Capteur Salle d'eau",
      ]),
    ).toEqual(['Salon', 'Salon', 'Cucina', 'Entrée', "Salle d'eau"]);
  });

  it('reads a Chinese place out of its sensor’s name, the reading’s words anywhere in it (a Japanese 和室 keeps its 和)', () => {
    expect(
      placed([
        '客厅温度传感器',
        '卧室温湿度传感器',
        '书房 温度',
        '主卧湿度计',
        '儿童房：温度',
        '和室温度',
      ]),
    ).toEqual(['客厅', '卧室', '书房', '主卧', '儿童房', '和室']);
  });

  it('reads Slovak’s sensor words in every case they are said in, and Hungarian’s as the reading’s own', () => {
    expect(
      placed([
        'Snímač teploty Obývačka',
        'Senzor teploty a vlhkosti Spálňa',
        'Snímač vlhkosti Kúpeľňa',
        'Teplota v Pracovni',
        'Snímačom teploty Garáž',
        'Konyha hőmérséklete',
        'Nappali páratartalma',
      ]),
    ).toEqual(['Obývačka', 'Spálňa', 'Kúpeľňa', 'Pracovni', 'Garáž', 'Konyha', 'Nappali']);
  });

  it('reads Russian’s sensor words in every case they are said in, ё or е, a place keeping its own', () => {
    expect(
      placed([
        'Датчик температуры Гостиная',
        'Датчик температуры и влажности Спальня',
        'Термометр Детская',
        'Температура в гостиной',
        'Влажность на кухне',
        'Термостатом Кабинет',
        'Датчики Ёлочная',
      ]),
    ).toEqual(['Гостиная', 'Спальня', 'Детская', 'Гостиной', 'Кухне', 'Кабинет', 'Ёлочная']);
  });

  it('keeps a word that joins two places, a conjunction among them, and takes one that joins the sensor words, in every language', () => {
    // each language's "and" between two sensor words, then between two places: [name, its place] each
    const and: Record<string, readonly (readonly [string, string])[]> = {
      de: [
        ['Temperatur und Luftfeuchtigkeit Bad', 'Bad'],
        ['Bad und Küche Thermostat', 'Bad und Küche'],
      ],
      en: [
        ['Temperature and Humidity Sensor Kitchen', 'Kitchen'],
        ['Kitchen and Dining Sensor', 'Kitchen and Dining'],
      ],
      es: [
        ['Sensor de temperatura y humedad Salón', 'Salón'],
        ['Cocina y Comedor Sensor', 'Cocina y Comedor'],
      ],
      fr: [
        ['Capteur température et humidité Salon', 'Salon'],
        ['Salon et Cuisine Capteur', 'Salon et Cuisine'],
      ],
      hu: [
        ['Hőmérséklet és páratartalom érzékelő Nappali', 'Nappali'],
        ['Fürdő és Konyha', 'Fürdő és Konyha'],
      ],
      it: [
        ['Sensore temperatura e umidità Cucina', 'Cucina'],
        ['Cucina e Sala Sensore', 'Cucina e Sala'],
      ],
      ja: [
        ['キッチン温度と湿度', 'キッチン'],
        ['リビングとキッチン温度', 'リビングとキッチン'],
      ],
      nl: [
        ['Temperatuur en vochtigheid sensor Keuken', 'Keuken'],
        ['Keuken en Woonkamer Sensor', 'Keuken en Woonkamer'],
      ],
      pl: [
        ['Czujnik temperatury i wilgotności Salon', 'Salon'],
        ['Kuchnia i Salon Czujnik', 'Kuchnia i Salon'],
      ],
      'pt-BR': [
        ['Sensor de temperatura e umidade Sala', 'Sala'],
        ['Sala e Cozinha Sensor', 'Sala e Cozinha'],
      ],
      'pt-PT': [
        ['Sensor de temperatura e humidade Sala', 'Sala'],
        ['Sala e Cozinha Sensor', 'Sala e Cozinha'],
      ],
      sk: [
        ['Senzor teploty a vlhkosti Spálňa', 'Spálňa'],
        ['Kuchyňa a Obývačka Senzor', 'Kuchyňa a Obývačka'],
      ],
      tr: [
        ['Sıcaklık ve nem sensörü Salon', 'Salon'],
        ['Mutfak ve Salon Sensör', 'Mutfak ve Salon'],
      ],
      'zh-Hans': [
        ['客厅温度和湿度', '客厅'],
        ['客厅和餐厅温度', '客厅和餐厅'],
        ['客厅温度与湿度', '客厅'],
        ['客厅与餐厅温度', '客厅与餐厅'],
      ],
      ru: [
        ['Датчик температуры и влажности Гостиная', 'Гостиная'],
        ['Кухня и Гостиная Датчик', 'Кухня и Гостиная'],
      ],
    };
    for (const [code, names] of Object.entries(and))
      expect(placed(names.map(([name]) => name)), code).toEqual(names.map(([, place]) => place));
    // a name typed without its marks says its "and" as plainly; an article or a preposition between two places stays
    expect(
      placed([
        'Homerseklet es paratartalom erzekelo Nappali',
        'Temperature & Humidity Sensor Hall',
        'Sensor Sala de estar',
        'Salle de bain Capteur',
        'Casa de banho Sensor',
        'Sala da pranzo Sensore',
        'Thermostat Bad im Keller',
        'Temperatur im Bad',
      ]),
    ).toEqual([
      'Nappali',
      'Hall',
      'Sala de estar',
      'Salle de bain',
      'Casa de banho',
      'Sala da pranzo',
      'Bad im Keller',
      'Bad',
    ]);
  });

  it('takes every language’s sensor words out of a name, as the words write them and capitalised', async () => {
    // a word that joins goes too where it joins nothing that stays: at a name's end (a letter alone there is a label)
    const stems = [...(await listed('place_noise')), ...(await listed('place_joins'))];
    expect(stems.length).toBeGreaterThan(100);
    const letters = new Set((await listed('place_joins')).filter((join) => [...join].length === 1));
    const names = Object.fromEntries(
      stems.flatMap((stem, at) => [
        [`sensor.${at}`, `Werkstatt ${stem}`],
        [`sensor.${at}_capital`, `${stem.charAt(0).toUpperCase()}${stem.slice(1)} Werkstatt`],
      ]),
    );
    const registry = readings(names);
    for (const [id, name] of Object.entries(names))
      expect(registry.placeName(id), name).toBe(
        letters.has(name.slice('Werkstatt '.length)) ? name : 'Werkstatt',
      );
  });
});

describe("custom:fluvy-home strategy — the grid meter's sign", () => {
  /** A grid meter found by its words, negative while the house imports at night. */
  const withMeter = (hourly: number) => {
    const hass = house([
      entity('sensor.solar_inverter_power', '0', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Solar inverter power',
      }),
      entity('sensor.grid_meter_power', '-1286', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid meter power',
      }),
    ]) as unknown as { callWS: (msg: { type: string }) => Promise<unknown> };
    const prefs = hass.callWS;
    hass.callWS = async (msg) =>
      msg.type === 'recorder/statistics_during_period'
        ? {
            'sensor.grid_meter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: hourly,
            })),
            'sensor.solar_inverter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: 0,
            })),
          }
        : prefs(msg);
    return hass as never;
  };
  const flow = (views: Awaited<ReturnType<typeof FluvyHomeStrategy.generate>>['views']) =>
    views
      .flatMap((v) => v.sections.flatMap((s) => s.cards))
      .find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as Record<
      string,
      unknown
    >;

  it('inverts a meter that reads negative through the dark hours', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(-1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
      invert: true,
    });
  });

  it('keeps a meter that imports as positive', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
    });
  });
});

/** The moment the appliances' fixtures are read at. */
const APPLIANCES_AT = Date.parse('2026-09-17T19:47:00Z');
/** A house with the reporter's kitchen and laundry (#47): a large appliance of every kind, a kettle and a plug's washer. */
const withAppliances = (base: Record<string, unknown> = demoHass() as never) =>
  houseOf(
    [
      hcCoffee(APPLIANCES_AT),
      mieleHob(APPLIANCES_AT),
      hcOven(APPLIANCES_AT),
      lgDryer(APPLIANCES_AT),
      lgWasher(APPLIANCES_AT),
      hcDishwasher(APPLIANCES_AT),
      lgFridge(APPLIANCES_AT),
      tuyaKettle(APPLIANCES_AT),
      plugWasher(APPLIANCES_AT),
    ],
    APPLIANCES_AT,
    base as Partial<HomeAssistant>,
  ) as never;

/** A forecast integration of the sun: a day's total, and its hours in the attribute. */
const solcast = (id: string, name: string, total: number): DemoEntity =>
  entity(
    id,
    String(total),
    {
      friendly_name: name,
      device_class: 'energy',
      state_class: 'total',
      unit_of_measurement: 'kWh',
      detailedHourly: Array.from({ length: 24 }, (_unused, hour) =>
        hour > 6 && hour < 19 ? Math.max(0, Math.sin((hour - 6) / 12) * 10) : 0,
      ),
    },
    { platform: 'solcast_solar' },
  );

/** The demo home with one of everything the library has a card for. */
const everything = () =>
  withAppliances(
    demoHass({
      more: [
        ...DEMO_EXTRAS,
        ...DEMO_ROOMS,
        solcast('sensor.solcast_forecast_today', '今天总发电量-预测', 86),
        solcast('sensor.solcast_forecast_tomorrow', '明天总发电量-预测', 45),
      ],
      consumption: ['sensor.washing_machine_energy_today', 'sensor.dryer_energy_today'],
      sources: DEMO_ENERGY_SOURCES,
    }) as never,
  );

describe('custom:fluvy-home strategy', () => {
  it('writes only configs its cards accept', async () => {
    await (await import('../index.js')).catalogue(); // the energy family too
    const rejected: string[] = [];
    for (const hass of [house(), everything()]) {
      const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
      for (const card of views.flatMap((v) => v.sections.flatMap((s) => s.cards))) {
        const Card = customElements.get(card.type.replace(/^custom:/, '')) as
          (new () => HTMLElement & { setConfig(config: unknown): void }) | undefined;
        if (!Card) {
          rejected.push(`${card.type}: not defined`);
          continue;
        }
        try {
          new Card().setConfig(card);
        } catch (error) {
          rejected.push(`${card.type}: ${(error as Error).message}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it('draws the cards in the style the dashboard asks for', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      {
        type: 'custom:fluvy-home',
        thermostat_variant: 'compact',
        tile_size: 'compact',
        flow_style: 'rail',
      },
      house(),
    );
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const of = (type: string) => cards.filter((c) => c.type === `custom:fluvy-${type}-card`);
    expect(of('thermostat').every((c) => c['variant'] === 'compact')).toBe(true);
    expect(of('energy-flow').every((c) => c['flow_style'] === 'rail')).toBe(true);
    const lights = views.find((v) => v.path === 'lights')!.sections.flatMap((s) => s.cards);
    const tiles = lights.filter((c) => c.type === 'custom:fluvy-tile-card');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((c) => c['size'] === 'compact')).toBe(true);
  });

  it('hides its tiles’ switches, or says their level in their place, where the dashboard asks (#160)', async () => {
    const tilesOf = async (config: Record<string, unknown>) => {
      const { views } = await FluvyHomeStrategy.generate(
        { type: 'custom:fluvy-home', ...config },
        everything(),
      );
      return views
        .flatMap((v) => v.sections.flatMap((s) => s.cards))
        .filter((c) => c.type === 'custom:fluvy-tile-card');
    };
    // the lights' tiles and the appliances', with their readings: nothing said where the switches show
    const shown = await tilesOf({});
    expect(shown.some((c) => Array.isArray(c['readouts']))).toBe(true);
    expect(shown.some((c) => !c['readouts'] && c['size'] !== 'compact')).toBe(true);
    expect(shown.every((c) => !('show_switch' in c))).toBe(true);
    expect(await tilesOf({ tile_switch: 'show' })).toEqual(shown);
    for (const [asked, said] of [
      ['hide', false],
      ['value', 'value'],
    ] as const) {
      const tiles = await tilesOf({ tile_switch: asked });
      // every tile carries the dashboard's word, and nothing else of it moved
      expect(tiles.every((c) => c['show_switch'] === said)).toBe(true);
      expect(
        tiles.map((c) =>
          Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'show_switch')),
        ),
      ).toEqual(shown);
    }
    // a word no dashboard knows says nothing
    expect(await tilesOf({ tile_switch: 'never' })).toEqual(shown);
  });

  it('puts every card of the library to use in a house that has one of everything', async () => {
    const CATALOGUE = await (await import('../index.js')).catalogue();
    // the views as chips under the greeting too: the chips card is in use
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      everything(),
    );
    const used = new Set(
      views.flatMap((v) => v.sections.flatMap((s) => s.cards.map((c) => c.type))),
    );
    // the automations card is placed by hand (1.8): the automatic dashboards do not put it on a view; the appliance
    // card is drawn by the appliances card, which lays the strategy's out whole (#47); a template card says what its
    // templates say, and only the person writes those (#59), as only the person knows a web page's address (#61); an
    // items card lists what a sensor's attribute holds, and only the person says what its items are (#66); the Energy
    // period strip leads the Energy dashboard's Today view (1.11), while the home's energy view keeps its cards' own
    // periods; a chart card draws the series the person names, in a list or a forecast only they know of (#68); the
    // Energy usage card (#62) is the person's to place; so is the Slider card (#77): the dashboards set a player's
    // volume, a number and a fan on their own cards; and the Vehicle card (#84), a car being the person's to place;
    // and the remote card (#143): which television, which remote entity and which receiver its volume goes to are
    // the person's to say, and a player's own card stands for a television on the dashboards; the solar forecast card
    // is the Energy dashboard's production view (1.19), and the home never draws the sun's forecast
    const byHand = new Set([
      'custom:fluvy-automations-card',
      'custom:fluvy-remote-card',
      'custom:fluvy-appliance-card',
      'custom:fluvy-template-card',
      'custom:fluvy-web-card',
      'custom:fluvy-items-card',
      'custom:fluvy-energy-period-card',
      'custom:fluvy-chart-card',
      'custom:fluvy-energy-usage-card',
      'custom:fluvy-slider-card',
      'custom:fluvy-vehicle-card',
      'custom:fluvy-forecast-card',
      'custom:fluvy-forecast-days-card',
    ]);
    expect(
      CATALOGUE.map(([tag]) => `custom:${tag}`).filter(
        (type) => !used.has(type) && !byHand.has(type),
      ),
    ).toEqual([]);
  });

  it('builds a view for each thing the house has, with the greeting (and the tabs, when asked) on every one', async () => {
    // by default the header's tabs are the way between the views: the greeting stands alone
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of plain.views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).not.toContain('chips');
    expect(types(plain.views[0]!.sections[0]!.cards)[0]).toBe('hello');
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(),
    );
    expect(views.filter((v) => !v.subview).map((v) => v.path)).toEqual([
      'home',
      'rooms',
      'lights',
      'climate',
      'energy',
      'media',
      'sensors',
    ]);
    for (const v of views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).toEqual(['hello', 'chips']);
    const chips = views[0]!.sections[0]!.cards[1] as unknown as {
      chips: { label: string; path: string; icon: string }[];
    };
    expect(chips.chips.map((c) => c.label)).toEqual([
      'Home',
      'Rooms',
      'Lights',
      'Climate',
      'Energy',
      'Media',
      'Sensors',
    ]);
    expect(chips.chips[2]!.path.endsWith('/lights')).toBe(true);
    expect(chips.chips.every((c) => c.icon.startsWith('fluvy:'))).toBe(true);
  });

  it('generates the same dashboard for the demo home (golden file: a change here is a change of the dashboard)', async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    expect(await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass)).toMatchSnapshot();
  });

  it('puts the running thermostat and the home forecast first, greets whoever looks, and keeps valves out of appliances', async () => {
    const hass = house([
      entity('climate.aa_idle_ac', 'off', { temperature: 24 }),
      entity('weather.met_service', 'sunny'),
      entity('weather.forecast_house', 'sunny'),
      entity('person.me', 'home', { user_id: 'u-1' }),
      entity('switch.sink_water_valve', 'on', { friendly_name: 'Sink water valve' }),
      entity('update.zigbee', 'on', {}, { entity_category: 'config' }),
    ]) as unknown as Record<string, unknown>;
    hass['user'] = { id: 'u-1', name: 'Me', is_admin: true };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const home = views[0]!.sections.flatMap((section) => section.cards);
    expect(home.find((c) => c.type === 'custom:fluvy-thermostat-card')?.['entity']).toBe(
      'climate.heat_pump',
    );
    expect(home.find((c) => c.type === 'custom:fluvy-weather-card')?.['entity']).not.toBe(
      'weather.met_service',
    ); // the home's forecast (home / forecast_home) before the national service
    // the greeting names no one: each person who opens the dashboard is greeted (a saved copy too)
    const hello = home.find((c) => c.type === 'custom:fluvy-hello-card');
    expect(hello).toBeDefined();
    expect(hello?.['person']).toBeUndefined();
    expect(home.some((c) => c['entity'] === 'switch.sink_water_valve')).toBe(false);
    const sensors = views
      .find((v) => v.path === 'sensors')!
      .sections.flatMap((section) => section.cards);
    expect(
      (
        sensors.find((c) => c.type === 'custom:fluvy-updates-card')?.['entities'] as string[]
      ).includes('update.zigbee'),
    ).toBe(true);
  });

  it('adds a Rooms view when the house has two rooms with something in them, and a subview per room', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(DEMO_ROOMS),
    );
    const rooms = views.find((view) => view.path === 'rooms');
    expect(rooms).toBeDefined();
    const cards = rooms!.sections.flatMap((section) => section.cards);
    const areas = cards
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toEqual(['kitchen', 'living_room', 'bedroom', 'garden']); // ground floor, upstairs, then the garden on no floor
    expect(
      cards
        .filter((card) => card.type === 'custom:fluvy-heading-card')
        .map((card) => card['title']),
    ).toEqual(['Ground floor', 'Upstairs', 'Rooms']);
    const subviews = views.filter((view) => view.subview);
    expect(subviews.map((view) => view.path)).toEqual(areas.map((area) => `room-${area}`));
    expect(subviews[0]?.back_path).toBe('/fluvy-home/rooms');
    // a subview is not a tab
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.includes('room-'))).toBe(false);
    // a room's subview opens with the way back to every room, then what the room holds
    const living = subviews.find((view) => view.path === 'room-living_room')!;
    const livingCards = living.sections
      .flatMap((section) => section.cards)
      .filter(
        (card) =>
          card.type !== 'custom:fluvy-hello-card' && card.type !== 'custom:fluvy-chips-card',
      );
    expect(livingCards[0]).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'All rooms',
      path: '/fluvy-home/rooms',
    });
    expect(
      livingCards.some(
        (card) =>
          card.type === 'custom:fluvy-tile-card' && card['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('makes a room of what the room card draws: an area that names its hidden sensors, and the reading it names alone (#39)', async () => {
    const hass = house([
      ...DEMO_ROOMS,
      entity(
        'sensor.cellar_temperature',
        '14.2',
        { device_class: 'temperature', unit_of_measurement: '°C' },
        { area_id: 'cellar', hidden: true },
      ),
      entity(
        'sensor.loft_humidity',
        '61',
        { device_class: 'humidity', unit_of_measurement: '%' },
        { area_id: 'loft', entity_category: 'diagnostic' },
      ),
      entity('switch.attic_led', 'on', {}, { area_id: 'attic', entity_category: 'config' }),
    ]) as { areas: Record<string, unknown> };
    hass.areas['cellar'] = {
      area_id: 'cellar',
      name: 'Cellar',
      temperature_entity_id: 'sensor.cellar_temperature',
    };
    hass.areas['loft'] = {
      area_id: 'loft',
      name: 'Loft',
      humidity_entity_id: 'sensor.loft_humidity',
    };
    hass.areas['attic'] = { area_id: 'attic', name: 'Attic' };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const areas = views
      .find((view) => view.path === 'rooms')!
      .sections.flatMap((section) => section.cards)
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toContain('cellar');
    expect(areas).toContain('loft');
    expect(areas).not.toContain('attic');
    const loft = views
      .find((view) => view.path === 'room-loft')!
      .sections.flatMap((section) => section.cards)
      .find((card) => card.type === 'custom:fluvy-readouts-card');
    // on the room's own page a reading is named by what it measures
    expect(loft?.['rows']).toEqual([{ entity: 'sensor.loft_humidity', name: 'Humidity' }]);
  });

  it('puts the map beside the people once the house has a zone', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      house(DEMO_ROOMS),
    );
    const sensors = views.find((view) => view.path === 'sensors')!;
    const cards = sensors.sections.flatMap((section) => section.cards);
    expect(cards.some((card) => card.type === 'custom:fluvy-map-card')).toBe(true);
  });

  it('gives every view three columns, so the header never moves between tabs', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of views) {
      expect(v.max_columns).toBe(3);
      expect(v.sections.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('tells lights from appliances by their words and gives plugs their readings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const home = views[0]!.sections.flatMap((section) => section.cards); // wherever the columns cut
    const lights = home.find((c) => c.type === 'custom:fluvy-heading-card') as unknown as {
      entities: string[];
    };
    expect(lights.entities).toEqual([
      'light.living_room_lamp',
      'switch.kitchen_light',
      'switch.patio_light',
    ]);
    const washer = home.find((c) => c['entity'] === 'switch.washing_machine') as unknown as {
      readouts?: string[];
    };
    expect(washer.readouts).toEqual([
      'sensor.washing_machine_power',
      'sensor.washing_machine_energy_today',
    ]);
    expect(
      home.some(
        (c) => c['entity'] === 'switch.heat_pump_boost' || c['entity'] === 'switch.plug_beep',
      ),
    ).toBe(false);
  });

  it('groups the lights by area, dimmable ones as light cards', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const lights = views.find((v) => v.path === 'lights')!;
    const headings = lights.sections.flatMap((s) =>
      s.cards.filter((c) => c.type === 'custom:fluvy-heading-card').map((c) => c['title']),
    );
    expect(headings).toEqual(['Living room', 'Kitchen', 'Outdoor']);
    expect(
      lights.sections[0]!.cards.some(
        (c) => c.type === 'custom:fluvy-light-card' && c['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('pairs the tiles and closes an odd run with a compact tile across the column', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const columns = (card: { grid_options?: unknown }) =>
      (card.grid_options as { columns?: number } | undefined)?.columns;
    const runs: number[] = [];
    for (const cards of views.flatMap((v) => v.sections.map((s) => s.cards))) {
      let run = 0;
      for (const card of [...cards, {}]) {
        if (columns(card) === 6) run++;
        else {
          if (run) runs.push(run);
          run = 0;
        }
      }
    }
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.filter((n) => n % 2)).toEqual([]);
    const compact = views.flatMap((v) =>
      v.sections.flatMap((s) => s.cards.filter((c) => c['size'] === 'compact')),
    );
    expect(compact.length).toBeGreaterThan(0);
    expect(compact.every((c) => columns(c) === 12)).toBe(true);
  });

  it("leaves the weather service's sensors out of the climate view and pairs humidity with its temperature", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const climate = views.find((v) => v.path === 'climate')!.sections.flatMap((s) => s.cards);
    expect(climate.some((c) => c['entity'] === 'sensor.met_temperature')).toBe(false);
    const humidity = climate.find((c) => c.type === 'custom:fluvy-humidity-card') as unknown as {
      temperature_entity?: string;
    };
    expect(humidity.temperature_entity).toBe('sensor.garden_temperature');
  });

  it("finds solar and grid power for the flow and the energy dashboard's devices", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const flow = energy.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: { type: string; power: string }[];
    };
    expect(flow.sources.map((s) => [s.type, s.power])).toEqual([
      ['solar', 'sensor.solar_inverter_power'],
      ['grid', 'sensor.grid_meter_power'],
    ]);
    expect(
      energy.some(
        (c) =>
          c.type === 'custom:fluvy-production-card' &&
          c['entity'] === 'sensor.solar_inverter_daily_yield',
      ),
    ).toBe(true);
    const devices = energy.find(
      (c) => c.type === 'custom:fluvy-energy-devices-card',
    ) as unknown as { rows: { entity: string }[] };
    expect(devices.rows.map((r) => r.entity)).toEqual(['sensor.washing_machine_energy_today']);
  });

  it('counts every array and battery the energy dashboard names, each with its own sign and charge (#140)', async () => {
    const power = (id: string, state: string) =>
      entity(id, state, {
        unit_of_measurement: 'W',
        device_class: 'power',
        state_class: 'measurement',
        friendly_name: id.split('.')[1],
      });
    // the reporter's house: E1's inverter offline, E2 making 942 W; the grid metered, its power found by its words; two
    // batteries, the second's meter signed the other way
    const hass = demoHass({
      more: [
        power('sensor.mppt_power_e1', 'unavailable'),
        power('sensor.mppt_power_e2', '942'),
        power('sensor.pack_a_power', '300'),
        power('sensor.pack_b_power', '-200'),
        entity('sensor.pack_a_level', '64', { unit_of_measurement: '%', device_class: 'battery' }),
      ],
      sources: [
        { type: 'grid', stat_energy_from: 'sensor.grid_energy_today' },
        { type: 'solar', stat_energy_from: 'sensor.e1_energy', stat_rate: 'sensor.mppt_power_e1' },
        { type: 'solar', stat_energy_from: 'sensor.e2_energy', stat_rate: 'sensor.mppt_power_e2' },
        {
          type: 'battery',
          stat_energy_from: 'sensor.pack_a_out',
          power_config: { stat_rate: 'sensor.pack_a_power' },
          stat_soc: 'sensor.pack_a_level',
        },
        {
          type: 'battery',
          stat_energy_from: 'sensor.pack_b_out',
          power_config: { stat_rate_inverted: 'sensor.pack_b_power' },
        },
      ],
    }) as never;
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = (path: string) =>
      views.find((v) => v.path === path)!.sections.flatMap((s) => s.cards);
    const flow = cards('energy').find(
      (c) => c.type === 'custom:fluvy-energy-flow-card',
    ) as unknown as { sources: Record<string, unknown>[] };
    expect(flow.sources).toEqual([
      { type: 'solar', power: 'sensor.mppt_power_e1' },
      { type: 'solar', power: 'sensor.mppt_power_e2' },
      { type: 'grid', power: 'sensor.grid_meter_power' },
      { type: 'battery', power: 'sensor.pack_a_power', level: 'sensor.pack_a_level' },
      { type: 'battery', power: 'sensor.pack_b_power', invert: true },
    ]);
    expect(cards('energy').find((c) => c.type === 'custom:fluvy-batteries-card')).toMatchObject({
      batteries: [
        { power: 'sensor.pack_a_power', level: 'sensor.pack_a_level' },
        { power: 'sensor.pack_b_power', invert: true },
      ],
    });
    // the sun's gauge and curve an array each, named by its own sensor: never the first for both (in any column)
    const sun = (path: string) =>
      cards(path)
        .filter((c) => String(c['entity']).startsWith('sensor.mppt'))
        .map((c) => `${types([c])[0]} ${String(c['entity'])}${c['name'] ? ' named' : ''}`)
        .sort();
    expect(sun('energy')).toEqual(['gauge sensor.mppt_power_e1', 'gauge sensor.mppt_power_e2']);
    expect(sun('home')).toEqual(['energy sensor.mppt_power_e1', 'energy sensor.mppt_power_e2']);
  });

  it('reads an export meter as the grid’s second sensor, never as the grid', async () => {
    const hass = house([
      entity('sensor.grid_import_power', '1900', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid import power',
      }),
      entity('sensor.grid_export_power', '400', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid export power',
      }),
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    // the ordinary house's own meter is named for the grid too: the one named for the export is never it
    expect(JSON.stringify(flow.sources)).not.toContain('"power":"sensor.grid_export_power"');
    expect(flow.sources).toContainEqual({
      type: 'grid',
      import: expect.any(String),
      export: 'sensor.grid_export_power',
    });
  });

  it('reads a grid named by its phases as one source summed per phase', async () => {
    const phase = (n: number, w: string) =>
      entity(`sensor.grid_power_l${n}`, w, {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: `Grid power L${n}`,
      });
    const hass = house([phase(1, '-400'), phase(2, '1000'), phase(3, '900')]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    expect(flow.sources).toContainEqual({
      type: 'grid',
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
    expect(cards.find((c) => c.type === 'custom:fluvy-grid-card')).toMatchObject({
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
  });

  it("draws the distribution of the energy dashboard's devices from the power sensor beside each statistic", async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const distribution = energy.find(
      (c) => c.type === 'custom:fluvy-distribution-card',
    ) as unknown as { entities: string[] } | undefined;
    expect(distribution?.entities).toEqual([
      'sensor.washing_machine_power',
      'sensor.heat_pump_power',
    ]);
  });

  it('splits batteries into devices and phones, and keeps connectivity sensors out of openings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const sensors = views.find((v) => v.path === 'sensors')!.sections.flatMap((s) => s.cards);
    const bars = sensors.filter((c) => c.type === 'custom:fluvy-bars-card') as unknown as {
      title: string;
      rows: { entity: string }[];
    }[];
    expect(bars.map((b) => [b.title, b.rows.map((r) => r.entity)])).toEqual([
      ['Batteries', ['sensor.garden_battery']],
      ['Phones', ['sensor.phone_battery_level']],
    ]);
    const openings = sensors.find((c) => c.type === 'custom:fluvy-openings-card') as unknown as {
      entities: string[];
    };
    expect(openings.entities).toEqual(['binary_sensor.kitchen_leak']);
  });

  it('hands every opening to the sensors card, which folds them itself', async () => {
    const windows = Array.from({ length: 10 }, (_, i) =>
      entity(`binary_sensor.window_${i}`, 'off', { device_class: 'window' }),
    );
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      house(windows),
    );
    const sensors = views.find((v) => v.path === 'sensors')!.sections.flatMap((s) => s.cards);
    const openings = sensors.find((c) => c.type === 'custom:fluvy-openings-card') as unknown as {
      entities: string[];
    };
    expect(openings.entities).toHaveLength(11);
    expect(openings.entities).toContain('binary_sensor.window_9');
  });

  it("speaks the dashboard's language and leaves out hidden views", async () => {
    const hass = house() as unknown as { language: string };
    hass.language = 'es';
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', hide: ['energy', 'media'] },
      hass as never,
    );
    expect(views.filter((v) => !v.subview).map((v) => v.title)).toEqual([
      'Inicio',
      'Habitaciones',
      'Luces',
      'Clima',
      'Sensores',
    ]);
  });
});

describe('custom:fluvy-home strategy — the appliances, as the reporter of #47 drew them', () => {
  const band = (views: readonly { path: string; sections: readonly Section[] }[], path: string) =>
    views.find((view) => view.path === path)!.sections.filter((section) => section.column_span);
  type Section = { column_span?: number; cards: Record<string, unknown>[] };

  it('lays them across Home under its columns: the large ones as whole cards, then the small ones as rows', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const home = views[0]!;
    // the columns first (the greeting in the first), then the band across them
    expect(home.sections.slice(0, 3).every((section) => !section.column_span)).toBe(true);
    const [across, ...more] = band(views, 'home');
    expect(more).toEqual([]);
    expect(across?.column_span).toBe(3);
    const [large, largeCards, small, smallCards] = across!.cards;
    expect(large).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Large appliances',
      icon: 'fluvy:dishwasher',
      subtitle: 'All appliances',
      path: '/fluvy-home/appliances',
    });
    // what keeps food cold, what cleans, what cooks, the coffee — the reporter's order
    expect(largeCards).toMatchObject({
      type: 'custom:fluvy-appliances-card',
      variant: 'cards',
      grid_options: { columns: 'full' },
    });
    expect((largeCards!['appliances'] as { kind: string }[]).map((item) => item.kind)).toEqual([
      'fridge',
      'dishwasher',
      'washer',
      'washer',
      'dryer',
      'oven',
      'hob',
      'coffee',
    ]);
    expect(small).toMatchObject({ title: 'Small appliances', subtitle: 'Show all' });
    expect(smallCards!['appliances']).toEqual([{ device: 'tuya-kettle', kind: 'kettle' }]);
  });

  it('gives the pets’ feeders, fountains and litter boxes a band of their own after the small appliances (#112)', async () => {
    const hass = houseOf(
      [tuyaKettle(APPLIANCES_AT), ...petFixtures(APPLIANCES_AT)],
      APPLIANCES_AT,
      demoHass() as never,
    );
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const [across] = band(views, 'home');
    const [small, , pets, petCards] = across!.cards;
    expect(small).toMatchObject({ title: 'Small appliances' });
    expect(pets).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Pets',
      icon: 'mdi:paw',
      subtitle: 'Show all',
    });
    // whole cards, by kind and then by name; never a pet of its own
    expect(petCards!['appliances']).toEqual([
      { device: 'pk-feeder', kind: 'feeder' },
      { device: 'pl-feeder', kind: 'feeder' },
      { device: 'pl-fountain', kind: 'fountain' },
      { device: 'pk-fountain', kind: 'fountain' },
      { device: 'pk-litter', kind: 'litter_box' },
      { device: 'pl-litter', kind: 'litter_box' },
    ]);
  });

  it('takes the appliances out of the plug tiles and the room readings, never out of the energy views', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const cards = (path: string, of = views) =>
      of.find((view) => view.path === path)!.sections.flatMap((section) => section.cards);
    // the washer on its plug is an appliance card now, not a tile; the demo's own plug stays a tile
    const tiles = cards('home').filter((card) => card.type === 'custom:fluvy-tile-card');
    expect(tiles.some((card) => card['entity'] === 'switch.waschmaschine_keller')).toBe(false);
    expect(tiles.some((card) => card['entity'] === 'switch.washing_machine')).toBe(true);
    // an oven's or a fridge's temperature is not a room's
    expect(JSON.stringify(cards('climate'))).not.toMatch(/backofen|kuhlschrank|fridge/);
    // without devices in the energy dashboard, its consumption reads every plug's power as it did: the appliance's too
    const unlisted = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(demoHass({ consumption: [] }) as never),
    );
    expect(
      cards('energy', unlisted.views).find(
        (card) => card.type === 'custom:fluvy-distribution-card',
      )?.['entities'],
    ).toEqual(['sensor.waschmaschine_keller_leistung', 'sensor.washing_machine_power']);
  });

  it('opens every appliance on a subview of its own, back to Home, never a tab', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      withAppliances(),
    );
    const all = views.find((view) => view.path === 'appliances')!;
    expect(all).toMatchObject({ subview: true, back_path: '/fluvy-home/home', max_columns: 3 });
    // the greeting keeps the first column; the bands lead nowhere further, every appliance in them
    expect(all.sections[0]!.cards[0]!.type).toBe('custom:fluvy-hello-card');
    const [across] = band(views, 'appliances');
    expect(across!.cards.filter((card) => card['path'])).toEqual([]);
    expect((across!.cards[1]!['appliances'] as unknown[]).length).toBe(8);
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.endsWith('/appliances'))).toBe(false);
    // golden file: Home and the subview of a house with appliances (a change here is a change of the dashboard)
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, withAppliances());
    expect(
      plain.views.filter((view) => view.path === 'home' || view.path === 'appliances'),
    ).toMatchSnapshot();
  });

  it('shows Home two rows of four large ones and a row of five small ones; the rest on the subview', async () => {
    const extra = Array.from({ length: 6 }, (_, i) => {
      const id = `plug-${i}`;
      return [
        id,
        {
          id,
          name: `Toaster ${i + 1}`,
          name_by_user: null,
          area_id: null,
          model: null,
          manufacturer: null,
          via_device_id: null,
        },
      ] as const;
    });
    const hass = withAppliances() as unknown as HomeAssistant;
    for (const [id, device] of extra) {
      (hass.devices as Record<string, unknown>)[id] = device;
      const slug = id.replace('-', '_');
      hass.entities[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        device_id: id,
        platform: 'shelly',
      };
      hass.entities[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        device_id: id,
        platform: 'shelly',
      };
      hass.states[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        state: 'off',
        attributes: {},
        last_changed: '',
        last_updated: '',
      };
      hass.states[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        state: '0',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
        last_changed: '',
        last_updated: '',
      };
    }
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const count = (path: string, index: number) =>
      (band(views, path)[0]!.cards[index]!['appliances'] as unknown[]).length;
    expect([count('home', 1), count('home', 3)]).toEqual([8, 5]);
    expect([count('appliances', 1), count('appliances', 3)]).toEqual([8, 7]);
  });

  it('gives a room its own appliances across under what it holds', async () => {
    const hass = withAppliances(
      demoHass({ more: DEMO_ROOMS }) as never,
    ) as unknown as HomeAssistant;
    (hass.devices['hc-dish'] as { area_id: string | null }).area_id = 'kitchen';
    hass.entities['sensor.wasserkocher_status'] = {
      ...hass.entities['sensor.wasserkocher_status']!,
      area_id: 'kitchen',
    };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const kitchen = band(views, 'room-kitchen');
    expect(kitchen).toHaveLength(1);
    // in the room the bands name what they hold and lead nowhere: every appliance of the room is in them
    expect(kitchen[0]!.cards.map((card) => [card['title'], card['path']])).toEqual([
      ['Large appliances', undefined],
      [undefined, undefined],
      ['Small appliances', undefined],
      [undefined, undefined],
    ]);
    expect(band(views, 'room-living_room')).toEqual([]);
  });

  it('leaves a house without appliances as it was: no band, no subview', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    expect(views.some((view) => view.sections.some((section) => section.column_span))).toBe(false);
    expect(views.some((view) => view.path === 'appliances')).toBe(false);
  });
});

/** The views' cards. */
const cardsIn = (views: readonly View[]) =>
  views.flatMap((view) => view.sections.flatMap((section) => section.cards));

/** Every entity a card names, however deep (an `entity`, a list of ids, a row's), as the house knows it. */
function namedIn(
  value: unknown,
  hass: { states: Record<string, unknown> },
  out = new Set<string>(),
) {
  if (typeof value === 'string') {
    if (value in hass.states) out.add(value);
  } else if (Array.isArray(value)) for (const item of value) namedIn(item, hass, out);
  else if (value && typeof value === 'object')
    for (const inner of Object.values(value)) namedIn(inner, hass, out);
  return out;
}

/**
 * What a room's page reaches: the entities its cards name, those of the appliances it draws whole, and the same on
 * the subviews its "N more" rows open.
 */
function reachedFrom(
  views: readonly View[],
  path: string,
  hass: { states: Record<string, unknown>; entities: Record<string, { device_id?: string }> },
): Set<string> {
  const page = views.find((view) => view.path === path)!;
  const lists = views.filter((view) => view.subview && view.back_path?.endsWith(`/${path}`));
  const cards = cardsIn([page, ...lists]);
  const reached = namedIn(cards, hass);
  const devices = new Set(
    cards.flatMap((card) =>
      ((card['appliances'] as { device: string }[] | undefined) ?? []).map(({ device }) => device),
    ),
  );
  for (const [id, entry] of Object.entries(hass.entities))
    if (entry.device_id && devices.has(entry.device_id)) reached.add(id);
  return reached;
}

describe('custom:fluvy-home strategy — a room’s page shows everything its card counts (#76)', () => {
  /** The reporter's garage: a temperature and humidity sensor, a smoke detector, a leak sensor and a garage door. */
  const garage = (more: readonly DemoEntity[] = []) => {
    const hass = house([
      entity(
        'sensor.garage_climate_temperature',
        '12.5',
        { device_class: 'temperature', unit_of_measurement: '°C' },
        { device_id: 'd-garage-climate' },
      ),
      entity(
        'sensor.garage_climate_humidity',
        '71',
        { device_class: 'humidity', unit_of_measurement: '%' },
        { device_id: 'd-garage-climate' },
      ),
      entity(
        'binary_sensor.garage_smoke',
        'off',
        { device_class: 'smoke', friendly_name: 'Smoke detector' },
        { area_id: 'garage' },
      ),
      entity(
        'binary_sensor.garage_leak',
        'off',
        { device_class: 'moisture', friendly_name: 'Leak sensor' },
        { area_id: 'garage' },
      ),
      entity(
        'cover.garage_main_door',
        'closed',
        { device_class: 'garage', friendly_name: 'Garage door', supported_features: 3 },
        { area_id: 'garage' },
      ),
      ...more,
    ]) as unknown as HomeAssistant;
    hass.areas['garage'] = { area_id: 'garage', name: 'Garage', icon: 'mdi:garage' } as never;
    hass.devices['d-garage-climate'] = {
      id: 'd-garage-climate',
      area_id: 'garage',
      name: 'Garage climate',
    } as never;
    return hass;
  };

  it('names two readings of one measure on a room’s page by their own names', async () => {
    const hass = garage([
      entity(
        'sensor.garage_bench_temperature',
        '14.0',
        { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Workbench' },
        { area_id: 'garage' },
      ),
    ]);
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const cards = cardsIn(views.filter((view) => view.path === 'room-garage'));
    const rows = cards.find((card) => card.type === 'custom:fluvy-readouts-card')?.['rows'] as {
      name: string;
    }[];
    const names = rows.map((row) => row.name);
    // the two thermometers by their own names (the fixture's first has none but its id), the one hygrometer by its measure
    expect(names).toHaveLength(3);
    expect(names).toContain('Workbench');
    expect(names).not.toContain('Temperature');
    expect(names).not.toContain('Garage');
    expect(names).toContain('Humidity');
  });

  it('draws the reporter’s garage whole: its readings, the smoke and the leak on its Openings card, the door as a cover', async () => {
    const hass = garage();
    // the page's five, of which the card counts the door (#95: its sensors are not devices)
    expect(areaContents(hass, 'garage').entities).toHaveLength(5);
    expect(areaContents(hass, 'garage').devices).toEqual(['cover.garage_main_door']);
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const cards = cardsIn(views.filter((view) => view.path === 'room-garage'));
    // the room's own readings, named by what they measure: the place is the page's
    expect(cards.find((card) => card.type === 'custom:fluvy-readouts-card')?.['rows']).toEqual([
      { entity: 'sensor.garage_climate_temperature', name: 'Temperature' },
      { entity: 'sensor.garage_climate_humidity', name: 'Humidity' },
    ]);
    expect(cards.find((card) => card.type === 'custom:fluvy-openings-card')).toMatchObject({
      title: 'Sensors',
      entities: ['binary_sensor.garage_leak', 'binary_sensor.garage_smoke'],
    });
    expect(cards.find((card) => card.type === 'custom:fluvy-cover-card')).toMatchObject({
      entity: 'cover.garage_main_door',
    });
  });

  it('reaches every entity the room card counts, by one rule for both, on Home’s rooms and the rooms dashboard', async () => {
    // the garage besides: lights past their cap, a fan, a vacuum, a lock, a battery, a plug's USB outlet, a button
    const hass = garage([
      ...Array.from({ length: 9 }, (_, i) =>
        entity(
          `light.garage_${i + 1}`,
          'off',
          { supported_color_modes: ['onoff'] },
          { area_id: 'garage' },
        ),
      ),
      entity('fan.garage', 'off', {}, { area_id: 'garage' }),
      entity('vacuum.garage', 'docked', {}, { area_id: 'garage' }),
      entity('lock.garage_side', 'locked', {}, { area_id: 'garage' }),
      entity(
        'sensor.garage_smoke_battery',
        '90',
        { device_class: 'battery', unit_of_measurement: '%' },
        { area_id: 'garage' },
      ),
      entity(
        'switch.garage_plug',
        'on',
        { device_class: 'outlet' },
        { device_id: 'd-garage-plug' },
      ),
      entity(
        'switch.garage_plug_usb',
        'on',
        { friendly_name: 'Garage plug USB' },
        { device_id: 'd-garage-plug' },
      ),
      entity(
        'sensor.garage_plug_power',
        '12',
        { device_class: 'power', unit_of_measurement: 'W' },
        { device_id: 'd-garage-plug' },
      ),
      entity('button.garage_door_identify', 'unknown', {}, { area_id: 'garage' }),
    ]);
    hass.devices['d-garage-plug'] = {
      id: 'd-garage-plug',
      area_id: 'garage',
      name: 'Garage plug',
    } as never;
    const { entities: counted, devices } = areaContents(hass, 'garage');
    // the one rule: each entity the room shows in exactly one part of the page, or shown by a part's card; the devices
    // its card counts among them
    expect(devices.filter((id) => !counted.includes(id))).toEqual([]);
    const parts = roomParts(new HomeRegistry(hass), 'garage');
    const placed = [
      ...parts.thermostats,
      ...parts.lights,
      ...parts.covers,
      ...parts.gates,
      ...parts.fans,
      ...parts.players,
      ...parts.appliances,
      ...parts.readings,
      ...parts.openings,
      ...parts.cameras,
      ...parts.rest,
      ...parts.within,
    ];
    expect([...placed].sort()).toEqual([...counted].sort());
    expect(parts.rest).toEqual(
      expect.arrayContaining([
        'button.garage_door_identify',
        'lock.garage_side',
        'sensor.garage_smoke_battery',
        'switch.garage_plug_usb',
        'vacuum.garage',
      ]),
    );
    // the plug's power is its tile's readout
    expect(parts.within).toEqual(['sensor.garage_plug_power']);
    for (const type of ['custom:fluvy-home', 'custom:fluvy-rooms'] as const) {
      const { views } = await generate({ type }, hass as never);
      const reached = reachedFrom(views, 'room-garage', hass as never);
      expect(
        counted.filter((id) => !reached.has(id)),
        type,
      ).toEqual([]);
      // the lights past their cap are a "N more" row away, on a subview back to the room
      const page = cardsIn(views.filter((view) => view.path === 'room-garage'));
      expect(page.filter((card) => card.type === 'custom:fluvy-tile-card').length).toBeGreaterThan(
        0,
      );
      expect(page.find((card) => card['more_path'] !== undefined)).toMatchObject({
        type: 'custom:fluvy-entities-card',
        more: 3,
        more_path: '/fluvy-home/room-garage-lights',
      });
      const lights = views.find((view) => view.path === 'room-garage-lights')!;
      expect(lights).toMatchObject({
        subview: true,
        back_path: '/fluvy-home/room-garage',
        title: 'Lights',
      });
    }
  });
});

describe('custom:fluvy-home strategy — a room counts its devices, never an appliance’s controls (#95)', () => {
  /** A galley kitchen of two lights, a radio on its plug and a dishwasher of an integration the appliance card does not read. */
  const kitchen = () => {
    const dishwasher = (id: string, state: string, attributes: Record<string, unknown> = {}) =>
      entity(id, state, attributes, { device_id: 'd-dishwasher', platform: 'esphome' });
    const hass = house([
      entity(
        'light.galley_ceiling',
        'on',
        { supported_color_modes: ['onoff'] },
        { area_id: 'galley' },
      ),
      entity(
        'light.galley_counter',
        'off',
        { supported_color_modes: ['onoff'] },
        { area_id: 'galley' },
      ),
      entity('switch.galley_radio', 'off', { friendly_name: 'Radio' }, { device_id: 'd-radio' }),
      entity(
        'sensor.galley_radio_power',
        '0',
        { device_class: 'power', unit_of_measurement: 'W' },
        { device_id: 'd-radio' },
      ),
      dishwasher('switch.dishwasher_power', 'on', { friendly_name: 'Dishwasher Power' }),
      dishwasher('switch.dishwasher_extra_dry', 'on', { friendly_name: 'Dishwasher Extra dry' }),
      dishwasher('switch.dishwasher_half_load', 'off', { friendly_name: 'Dishwasher Half load' }),
      dishwasher('select.dishwasher_course', 'eco', { options: ['eco', 'auto', 'quick'] }),
      dishwasher('select.dishwasher_zone', 'all', { options: ['all', 'upper', 'lower'] }),
      dishwasher('number.dishwasher_delay_start', '0', { min: 0, max: 24, step: 1 }),
      dishwasher('button.dishwasher_start', 'unknown'),
      dishwasher('button.dishwasher_pause', 'unknown'),
      dishwasher('sensor.dishwasher_remaining', '42', { unit_of_measurement: 'min' }),
      dishwasher('binary_sensor.dishwasher_door', 'off', { device_class: 'door' }),
    ]) as unknown as HomeAssistant;
    hass.areas['kitchen'] = { area_id: 'galley', name: 'Kitchen' } as never;
    for (const id of ['d-radio', 'd-dishwasher'])
      hass.devices[id] = { id, area_id: 'galley', name: id.slice(2) } as never;
    return hass;
  };

  it('counts the lights and the radio’s plug, and keeps the dishwasher’s options off the room’s plugs', async () => {
    const hass = kitchen();
    const { entities, devices } = areaContents(hass, 'galley');
    expect(devices).toEqual([
      'light.galley_ceiling',
      'light.galley_counter',
      'switch.galley_radio',
    ]);
    const parts = roomParts(new HomeRegistry(hass), 'galley');
    expect(parts.appliances).toEqual(['switch.galley_radio']);
    // the page still reaches every one of them: the dishwasher's controls as rows, under Devices
    expect(parts.rest).toEqual(
      expect.arrayContaining(['switch.dishwasher_extra_dry', 'select.dishwasher_course']),
    );
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const reached = reachedFrom(views, 'room-galley', hass as never);
    expect(entities.filter((id) => !reached.has(id))).toEqual([]);
    // Home's plugs, as the room's
    expect(new HomeRegistry(hass).applianceTiles).not.toContain('switch.dishwasher_power');
  });

  it('gives a room’s automations a card of their own, never rows among its devices (#118)', async () => {
    const hass = kitchen();
    const automation = entity(
      'automation.galley_lights',
      'on',
      { friendly_name: 'Galley lights', last_triggered: null },
      { area_id: 'galley' },
    );
    const adapt = entity(
      'switch.adaptive_lighting_galley_adapt_brightness',
      'on',
      { friendly_name: 'Adapt Brightness' },
      { area_id: 'galley' },
    );
    const more = house([automation, adapt]) as unknown as HomeAssistant;
    Object.assign(hass.states, more.states);
    Object.assign(hass.entities, more.entities);
    const parts = roomParts(new HomeRegistry(hass), 'galley');
    expect(parts.automations).toEqual(['automation.galley_lights']);
    expect(parts.rest).not.toContain('automation.galley_lights');
    // a switch is still the room's: a tile or a row on its page
    expect([...parts.appliances, ...parts.rest]).toContain(
      'switch.adaptive_lighting_galley_adapt_brightness',
    );
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const cards = cardsIn([views.find((view) => view.path === 'room-galley')!]);
    expect(cards.find((card) => card.type === 'custom:fluvy-automations-card')).toMatchObject({
      title: 'Automations',
      entities: ['automation.galley_lights'],
      show_add: false,
    });
    // its page still reaches it, as it reaches everything the room holds
    expect(reachedFrom(views, 'room-galley', hass as never).has('automation.galley_lights')).toBe(
      true,
    );
    const rows = cards
      .filter((card) => card.type === 'custom:fluvy-entities-card')
      .flatMap((card) => (card['rows'] as { entity: string }[]).map((row) => row.entity));
    expect(rows).not.toContain('automation.galley_lights');
  });

  it('takes each room’s own include and exclude from the dashboard’s `rooms`: its card, its count and its page', async () => {
    const hass = kitchen();
    const galley = {
      include: ['switch.dishwasher_power'],
      exclude: ['light.galley_counter', 'select.dishwasher_*'],
    };
    const home = new HomeRegistry(hass, { galley });
    expect(home.contents('galley').devices).toEqual([
      'light.galley_ceiling',
      'switch.dishwasher_power',
      'switch.galley_radio',
    ]);
    const parts = roomParts(home, 'galley');
    expect(parts.lights).toEqual(['light.galley_ceiling']);
    expect(parts.rest).not.toContain('select.dishwasher_course');
    const { views } = await generate(
      { type: 'custom:fluvy-rooms', rooms: { galley } } as never,
      hass as never,
    );
    const card = views
      .flatMap((view) => view.sections.flatMap((section) => section.cards))
      .find((each) => each.type === 'custom:fluvy-room-card' && each['area'] === 'galley');
    expect(card).toMatchObject(galley);
    // its page reaches what its card counts, and nothing it leaves out
    const reached = reachedFrom(views, 'room-galley', hass as never);
    expect(reached.has('switch.dishwasher_power')).toBe(true);
    expect(reached.has('light.galley_counter')).toBe(false);
    expect(reached.has('select.dishwasher_course')).toBe(false);
    // a room the dashboard says nothing of, or says nonsense of, holds what its area does
    const stray = new HomeRegistry(hass, { galley: 'all', constructor: {} } as never);
    expect(stray.tuning('galley')).toEqual({});
    expect(stray.tuning('constructor')).toEqual({});
    expect(stray.contents('galley')).toEqual(areaContents(hass, 'galley'));
    expect(new HomeRegistry(hass, null as never).tuning('galley')).toEqual({});
    expect(new HomeRegistry(hass, { galley: null } as never).tuning('galley')).toEqual({});
  });

  it('asks of every room’s photo what the dashboard says, and of one room what `rooms` says of it (#159)', async () => {
    const hass = kitchen();
    const own = ['name_position', 'readout_style', 'readout_labels'];
    const rooms = async (config: Record<string, unknown>) =>
      (await generate({ type: 'custom:fluvy-rooms', ...config } as never, hass as never)).views
        .flatMap((view) => view.sections.flatMap((section) => section.cards))
        .filter((card) => card.type === 'custom:fluvy-room-card');
    // nothing said: the card's own defaults, and no key written
    const plain = await rooms({});
    expect(plain.length).toBeGreaterThan(0);
    for (const card of plain) for (const key of own) expect(card).not.toHaveProperty(key);
    const asked = await rooms({
      room_name_position: 'top',
      room_readout_style: 'wrap',
      room_readout_labels: 'icons',
    });
    for (const card of asked)
      expect(card).toMatchObject({
        name_position: 'top',
        readout_style: 'wrap',
        readout_labels: 'icons',
      });
    // one room's own comes over the dashboard's, beside its include and exclude; what is no word is not read
    const tuned = await rooms({
      room_name_position: 'top',
      room_readout_labels: 'none',
      rooms: {
        galley: { name_position: 'bottom', readout_labels: 7, exclude: ['light.galley_counter'] },
      },
    });
    const galley = tuned.find((card) => card['area'] === 'galley');
    expect(galley).toMatchObject({
      name_position: 'bottom',
      readout_labels: 'none',
      exclude: ['light.galley_counter'],
    });
    expect(galley).not.toHaveProperty('readout_style');
    expect(new HomeRegistry(hass, { galley: 'all' } as never).look('galley')).toEqual({});
    expect(new HomeRegistry(hass, null as never).look('galley')).toEqual({});
  });
});

describe('custom:fluvy-home strategy — capped lists (#78)', () => {
  /** A house of twelve rooms, each with its temperature, its humidity and its light. */
  const twelveRooms = () => {
    const more: DemoEntity[] = [];
    const hass = house(
      Array.from({ length: 12 }, (_, i) => {
        const area = `room_${i + 1}`;
        more.push(
          entity(
            `sensor.${area}_humidity`,
            String(40 + i),
            { device_class: 'humidity', unit_of_measurement: '%' },
            { area_id: area },
          ),
          entity(`light.${area}`, 'off', { supported_color_modes: ['onoff'] }, { area_id: area }),
        );
        return entity(
          `sensor.${area}_temperature`,
          String(20 + i / 10),
          { device_class: 'temperature', unit_of_measurement: '°C' },
          { area_id: area },
        );
      }).concat(more),
    ) as unknown as HomeAssistant;
    for (let i = 1; i <= 12; i++)
      hass.areas[`room_${i}`] = { area_id: `room_${i}`, name: `Room ${i}` } as never;
    return hass;
  };
  const moreRows = (cards: readonly Record<string, unknown>[]) =>
    cards.filter((card) => card['more_path'] !== undefined);

  it('ends a capped list with "N more", which opens a subview of every one, back to the view', async () => {
    const hass = twelveRooms();
    const home = new HomeRegistry(hass);
    const { views } = await generate({ type: 'custom:fluvy-home' }, hass as never);
    const climate = cardsIn(views.filter((view) => view.path === 'climate'));
    const humidity = climate.filter((card) => card.type === 'custom:fluvy-humidity-card');
    expect(humidity).toHaveLength(3);
    expect(moreRows(climate)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'custom:fluvy-entities-card',
          more: home.humidities.length - 3,
          more_path: '/fluvy-home/climate-humidity',
        }),
        expect.objectContaining({
          more: home.temperatures.length - 4,
          more_path: '/fluvy-home/climate-temperatures',
        }),
      ]),
    );
    const every = views.find((view) => view.path === 'climate-humidity')!;
    expect(every).toMatchObject({
      subview: true,
      back_path: '/fluvy-home/climate',
      title: 'Humidity',
    });
    expect(
      cardsIn([every])
        .filter((card) => card.type === 'custom:fluvy-humidity-card')
        .map((card) => card['entity']),
    ).toEqual(home.humidities);
    // its way back first, after the greeting
    expect(every.sections[0]!.cards[1]).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Climate',
      path: '/fluvy-home/climate',
    });
    // Home's lights: six tiles, the rest on a subview of every light by room; never a tab
    const homeCards = cardsIn(views.filter((view) => view.path === 'home'));
    expect(moreRows(homeCards).map((card) => card['more_path'])).toContain(
      '/fluvy-home/home-lights',
    );
    const lights = namedIn(
      cardsIn(views.filter((view) => view.path === 'home-lights')),
      hass as never,
    );
    expect(home.lights.filter((id) => !lights.has(id))).toEqual([]);
    const tabs = views.filter((view) => !view.subview).map((view) => view.path);
    expect(tabs).not.toContain('climate-humidity');
    expect(tabs).not.toContain('home-lights');
  });

  it('raises a list’s cap, lifts it, or lifts them all (`caps`)', async () => {
    const hass = twelveRooms();
    const home = new HomeRegistry(hass);
    const raised = await generate(
      { type: 'custom:fluvy-home', caps: { humidity: 20, temperatures: 'none' } },
      hass as never,
    );
    const climate = cardsIn(raised.views.filter((view) => view.path === 'climate'));
    expect(climate.filter((card) => card.type === 'custom:fluvy-humidity-card')).toHaveLength(
      home.humidities.length,
    );
    expect(climate.filter((card) => card.type === 'custom:fluvy-sensor-card')).toHaveLength(
      home.temperatures.length,
    );
    expect(moreRows(climate)).toEqual([]);
    expect(raised.views.some((view) => view.path.startsWith('climate-'))).toBe(false);
    // the others keep the house's
    expect(raised.views.some((view) => view.path === 'home-lights')).toBe(true);
    const whole = await generate({ type: 'custom:fluvy-home', caps: 'none' }, hass as never);
    expect(moreRows(cardsIn(whole.views))).toEqual([]);
    expect(
      whole.views.filter((view) => view.subview).every((view) => view.path.startsWith('room-')),
    ).toBe(true);
    // a cap that is no number is the house's
    const nonsense = await generate(
      { type: 'custom:fluvy-home', caps: { humidity: 0, fridges: 3 } as never },
      hass as never,
    );
    expect(
      cardsIn(nonsense.views.filter((view) => view.path === 'climate')).filter(
        (card) => card.type === 'custom:fluvy-humidity-card',
      ),
    ).toHaveLength(CAPS.humidity);
  });

  it('folds the cards that fold their own lists, a room’s openings and automations, at the house’s cap, raised or lifted (`caps`)', async () => {
    const hass = house([
      ...Array.from({ length: 7 }, (_, i) =>
        entity(
          `automation.study_${i}`,
          'on',
          { friendly_name: `Study ${i}`, last_triggered: null },
          { area_id: 'study' },
        ),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        entity(
          `binary_sensor.study_window_${i}`,
          'off',
          { device_class: 'window' },
          { area_id: 'study' },
        ),
      ),
    ]) as unknown as HomeAssistant;
    hass.areas['study'] = { area_id: 'study', name: 'Study' } as never;
    const folds = async (caps?: unknown) => {
      const { views } = await generate(
        { type: 'custom:fluvy-home', ...(caps ? { caps } : {}) } as never,
        hass as never,
      );
      const cards = cardsIn(views.filter((view) => view.path === 'room-study'));
      return ['openings', 'automations'].map(
        (type) => cards.find((card) => card.type === `custom:fluvy-${type}-card`)?.['max_rows'],
      );
    };
    expect(await folds()).toEqual([CAPS.openings, CAPS.automations]);
    // in full: every one of them, the card folding none
    expect(await folds('none')).toEqual([6, 7]);
    expect(await folds({ openings: 2, automations: 'none' })).toEqual([2, 7]);
  });

  it('shows one past the cap of a list of rows or tiles, never a "1 more" row', async () => {
    // seven lights in all: Home's six and the one past them
    const lights = (count: number) =>
      Array.from({ length: count - new HomeRegistry(house()).lights.length }, (_, i) =>
        entity(`light.l${i}`, 'off', { supported_color_modes: ['onoff'] }),
      );
    const lightsMore = async (count: number) =>
      moreRows(
        cardsIn(
          (
            await generate({ type: 'custom:fluvy-home' }, house(lights(count)) as never)
          ).views.filter((view) => view.path === 'home'),
        ),
      ).filter((card) => card['more_path'] === '/fluvy-home/home-lights');
    expect(await lightsMore(CAPS.lights + 1)).toEqual([]);
    expect((await lightsMore(CAPS.lights + 2)).map((card) => card['more'])).toEqual([2]);
  });
});

describe('custom:fluvy-home strategy — what a dashboard leaves out of every view (#141)', () => {
  const THERMOSTAT = 'climate.shui_xiang_wen_kong_qi_re_shui_qi_xu_ni';
  /**
   * The reporter's house, in the demo home with one of everything: a water heater's virtual thermostat in the kitchen
   * among the air conditioners, and the inverter's MPPT readings, whose words make either of them the solar power,
   * beside its total.
   */
  const reporter = () => {
    const mppt = (n: number, watts: string) =>
      entity(`sensor.inverter_mppt_${n}_power`, watts, {
        device_class: 'power',
        unit_of_measurement: 'W',
        friendly_name: `Inverter MPPT ${n} 总功率`,
      });
    return house([
      ...DEMO_EXTRAS,
      ...DEMO_ROOMS,
      entity(
        THERMOSTAT,
        'heat',
        {
          friendly_name: '水箱温控 空气热水器 虚拟',
          hvac_modes: ['off', 'heat'],
          temperature: 55,
          current_temperature: 52,
        },
        { area_id: 'kitchen', platform: 'generic_thermostat' },
      ),
      mppt(1, '820'),
      mppt(2, '790'),
    ]) as unknown as HomeAssistant;
  };
  /** An entry for each view, the reporter's two first: ids, a pattern, a device (the printer's). */
  const EXCLUDE = [
    THERMOSTAT,
    'sensor.inverter_mppt_*',
    'light.hall',
    'sensor.garden_humidity',
    'camera.garden',
    'lock.front_door',
    'media_player.tv',
    'calendar.family',
    'd-printer',
  ];
  /** Every entity of the house the entries leave out. */
  const leftOut = (hass: HomeAssistant): string[] =>
    Object.keys(hass.states).filter(inList(hass, EXCLUDE));
  /** What the cards draw: every entity they name, but in a room card's `exclude`. */
  const drawn = (views: readonly View[], hass: HomeAssistant): Set<string> =>
    namedIn(
      cardsIn(views).map(({ exclude, ...card }) =>
        card.type === 'custom:fluvy-room-card' ? card : { ...card, exclude },
      ),
      hass,
    );

  it('draws none of it on any view of any dashboard, the rooms’ and the lists’ subviews too', async () => {
    const hass = reporter();
    const left = leftOut(hass);
    expect(left).toContain('sensor.p1s_print_status');
    for (const type of ['home', 'rooms', 'energy', 'security', 'wall'] as const) {
      const config = { type: `custom:fluvy-${type}` } as const;
      const before = drawn((await generate(config, hass)).views, hass);
      const { views } = await generate({ ...config, exclude: EXCLUDE }, hass);
      const after = drawn(views, hass);
      // what it drew of them it draws no more, and everything else as it did
      expect(
        left.some((id) => before.has(id)),
        type,
      ).toBe(true);
      expect(
        left.filter((id) => after.has(id)),
        type,
      ).toEqual([]);
      expect(
        [...before].filter((id) => !after.has(id) && !left.includes(id)),
        type,
      ).toEqual([]);
      expect(
        cardsIn(views).filter((card) => card['device'] === 'd-printer'),
        type,
      ).toEqual([]);
    }
  });

  it('keeps the air conditioners on the Climate view, and the water heater off it', async () => {
    const hass = reporter();
    const climate = async (exclude: readonly string[] = []) =>
      cardsIn(
        (await generate({ type: 'custom:fluvy-home', exclude }, hass)).views.filter(
          (view) => view.path === 'climate',
        ),
      )
        .filter((card) => card.type === 'custom:fluvy-thermostat-card')
        .map((card) => card['entity']);
    const every = await climate();
    expect(every).toContain(THERMOSTAT);
    expect(await climate(EXCLUDE)).toEqual(every.filter((id) => id !== THERMOSTAT));
  });

  it('never takes a reading it leaves out for an energy role: the solar power is the inverter’s', () => {
    const roles = (exclude?: readonly string[]) =>
      JSON.stringify(findEnergyRoles(new HomeRegistry(reporter(), {}, exclude), null));
    // the reporter's MPPT readings say solar as the inverter's own does, and come first
    expect(roles()).toContain('inverter_mppt');
    expect(roles(EXCLUDE)).not.toContain('inverter_mppt');
    expect(roles(EXCLUDE)).toContain('"sensor.solar_inverter_power"');
  });

  it('counts none of it in a room, whose card is told to leave it out as the dashboard does', async () => {
    const hass = reporter();
    expect(new HomeRegistry(hass).contents('kitchen').devices).toContain(THERMOSTAT);
    const home = new HomeRegistry(hass, {}, EXCLUDE);
    expect(home.contents('kitchen').entities).not.toContain(THERMOSTAT);
    const { views } = await generate({ type: 'custom:fluvy-rooms', exclude: EXCLUDE }, hass);
    const card = cardsIn(views).find(
      (each) => each.type === 'custom:fluvy-room-card' && each['area'] === 'kitchen',
    )!;
    // what it leaves out of the kitchen, nothing of another room's
    expect(card['exclude']).toEqual([THERMOSTAT]);
    expect(areaContents(hass, 'kitchen', card as RoomTuning)).toEqual(home.contents('kitchen'));
    expect(reachedFrom(views, 'room-kitchen', hass as never).has(THERMOSTAT)).toBe(false);
  });

  it('joins a room’s own exclude, and keeps what a room includes, as a room does', () => {
    const hass = reporter();
    const kitchen = new HomeRegistry(hass, { kitchen: { exclude: ['switch.kettle'] } }, EXCLUDE);
    expect(kitchen.tuning('kitchen')).toEqual({ exclude: ['switch.kettle', THERMOSTAT] });
    const kept = new HomeRegistry(hass, { kitchen: { include: [THERMOSTAT] } }, EXCLUDE);
    expect(kept.contents('kitchen').devices).toContain(THERMOSTAT);
    // a list that leaves nothing out tunes no room
    for (const exclude of [[], ['light.nothing_here'], [7, '', null] as never])
      expect(new HomeRegistry(hass, {}, exclude).tuning('kitchen')).toEqual({});
  });
});
