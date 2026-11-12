// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import { catalogue } from '../index.js';

const CATALOGUE = await catalogue();
import { CAPS } from './caps.js';
import { FluvyHomeStrategy } from './home-strategy.js';
import { generate, generateWith } from './generate.js';
import {
  HOME_TEMPLATE,
  strategyOptions,
  TEMPLATES,
  templateById,
  templateOf,
} from './templates.js';
import type { View } from './types.js';
import type { HomeAssistant } from '@fluvy/core';
import {
  hcDishwasher,
  houseOf,
  lgFridge,
  plugWasher,
  tuyaKettle,
} from '../appliance/fixtures/index.js';

import {
  DEMO_ENERGY_SOURCES,
  DEMO_EXTRAS,
  DEMO_HEAT_PUMP_READINGS,
  DEMO_ROOMS,
  demoHass,
  type DemoEntity,
} from '@fluvy/demo-home';

const house = (more: readonly DemoEntity[] = [], consumption?: readonly string[]) =>
  demoHass({ more, ...(consumption ? { consumption } : {}) }) as never;
const entity = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  registry: Record<string, unknown> = {},
): DemoEntity => ({ id, state, attributes, registry });
/** The moment the appliances' fixtures are read at. */
const APPLIANCES_AT = Date.parse('2026-09-17T19:47:00Z');
/** A forecast integration of the sun (Solcast and friends): a day's total, and its hours in the attribute. */
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

/** The demo home with one of everything the library has a card for, appliances large and small among them (#47). */
const everything = () =>
  houseOf(
    [
      lgFridge(APPLIANCES_AT),
      hcDishwasher(APPLIANCES_AT),
      plugWasher(APPLIANCES_AT),
      tuyaKettle(APPLIANCES_AT),
    ],
    APPLIANCES_AT,
    demoHass({
      more: [
        ...DEMO_EXTRAS,
        ...DEMO_ROOMS,
        solcast('sensor.solcast_forecast_today', '今天总发电量-预测', 86),
        solcast('sensor.solcast_forecast_tomorrow', '明天总发电量-预测', 45),
      ],
      consumption: ['sensor.washing_machine_energy_today', 'sensor.dryer_energy_today'],
      sources: DEMO_ENERGY_SOURCES,
    }) as unknown as Partial<HomeAssistant>,
  ) as never;
const cardsOf = (views: readonly View[]) =>
  views.flatMap((v) => v.sections.flatMap((s) => s.cards));

/**
 * `everything()` with what custom integrations write where Home Assistant types text (#129), each through `write`: the
 * reporter's two fuel stations, their model a number; a thermometer whose integration names it, its maker and its
 * model by numbers; a loft whose name and floor's name are numbers.
 */
function numbered(write: (value: number) => unknown): HomeAssistant {
  const hass = everything() as unknown as HomeAssistant;
  const reading = (
    id: string,
    device: string,
    value: string,
    attributes: Record<string, unknown>,
  ): void => {
    hass.states[id] = {
      entity_id: id,
      state: value,
      attributes,
      last_changed: '',
      last_updated: '',
    };
    hass.entities[id] = { entity_id: id, device_id: device, platform: 'prix_carburant' };
  };
  const device = (id: string, name: unknown, manufacturer: unknown, model: unknown): void => {
    hass.devices[id] = {
      id,
      name,
      name_by_user: null,
      area_id: null,
      manufacturer,
      model,
    } as never;
  };
  device('station-leclerc', 'Station Bapdis Sas', 'Leclerc', write(76380002));
  device('station-esso', 'Station Esso DU MIN', 'Esso Express', write(76000007));
  reading('sensor.station_bapdis_sas_gazole', 'station-leclerc', '1.689', {
    friendly_name: 'Station Bapdis Sas Gazole',
    unit_of_measurement: '€/L',
  });
  reading('sensor.station_esso_du_min_sp98', 'station-esso', '1.859', {
    friendly_name: 'Station Esso DU MIN SP98',
    unit_of_measurement: '€/L',
  });
  device('thermo', write(4711), write(1234), write(3));
  hass.devices['thermo']!.model_id = write(7) as never;
  reading('sensor.thermo_temperature', 'thermo', '19.5', {
    friendly_name: '4711 Temperature',
    device_class: 'temperature',
    unit_of_measurement: '°C',
  });
  hass.floors = { ...hass.floors, attic: { floor_id: 'attic', name: write(2) as never, level: 2 } };
  hass.areas['loft'] = { area_id: 'loft', name: write(3) as never, floor_id: 'attic' };
  hass.states['light.loft'] = {
    entity_id: 'light.loft',
    state: 'on',
    attributes: { friendly_name: 'Loft light' },
    last_changed: '',
    last_updated: '',
  };
  hass.entities['light.loft'] = { entity_id: 'light.loft', area_id: 'loft' };
  return hass;
}

/** Every `entity` a card config names, however deep, and every id of its `entities`. */
function entitiesOf(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) entitiesOf(item, out);
  else if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'entity') out.push(inner);
      else if (key === 'entities' && Array.isArray(inner))
        for (const item of inner) {
          if (typeof item === 'string' || typeof item !== 'object') out.push(item);
          else entitiesOf(item, out);
        }
      else entitiesOf(inner, out);
    }
  return out;
}

describe('the dashboard templates', () => {
  it('name every entity by its id: a card is never handed a flag for an entity', async () => {
    for (const template of TEMPLATES)
      for (const hass of [house(), everything()]) {
        const { views } = await generate({ type: template.type }, hass);
        const named = entitiesOf(cardsOf(views));
        expect(named.length, template.id).toBeGreaterThan(0);
        expect(
          named.filter((id) => typeof id !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)),
          template.id,
        ).toEqual([]);
      }
  });

  it('are found by their strategy type, and nothing else is', () => {
    expect(templateOf('custom:fluvy-energy')?.id).toBe('energy');
    expect(templateOf('custom:fluvy-home')).toBe(HOME_TEMPLATE);
    expect(templateOf('custom:button-card')).toBeUndefined();
    expect(templateOf(undefined)).toBeUndefined();
  });

  it('generate the same dashboard for the demo home, template by template (golden file)', async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    for (const template of TEMPLATES.filter((t) => t.id !== 'home'))
      expect(await generate({ type: template.type }, hass)).toMatchSnapshot(template.id);
  });

  it('lay a room’s appliances across its subview, on the wall across its two columns (golden file, #47)', async () => {
    const hass = everything() as unknown as HomeAssistant;
    // the kitchen holds the dishwasher and the kettle
    (hass.devices['hc-dish'] as { area_id: string | null }).area_id = 'kitchen';
    (hass.devices['tuya-kettle'] as { area_id: string | null }).area_id = 'kitchen';
    for (const template of [templateById('rooms'), templateById('wall')]) {
      const kitchen = (await generate({ type: template.type }, hass as never)).views.find(
        (view) => view.path === 'room-kitchen',
      )!;
      const across = kitchen.sections.filter((section) => section.column_span);
      expect(across.map((section) => section.column_span)).toEqual([template.columns]);
      expect(kitchen).toMatchSnapshot(template.id);
    }
  });

  it('build the home dashboard exactly as the home strategy always did', async () => {
    const hass = house();
    const config = { type: 'custom:fluvy-home' as const, tile_size: 'compact' as const };
    expect(await generate(config, hass)).toEqual(await FluvyHomeStrategy.generate(config, hass));
    expect(await generateWith(HOME_TEMPLATE, config, hass)).toEqual(
      await FluvyHomeStrategy.generate(config, hass),
    );
  });

  it('write only configs their cards accept', async () => {
    const rejected: string[] = [];
    for (const hass of [house(), everything()])
      for (const template of TEMPLATES) {
        const { views } = await generate({ type: template.type }, hass);
        for (const card of cardsOf(views)) {
          const Card = customElements.get(card.type.replace(/^custom:/, '')) as
            (new () => HTMLElement & { setConfig(config: unknown): void }) | undefined;
          if (!Card) {
            rejected.push(`${template.id} ${card.type}: not defined`);
            continue;
          }
          try {
            new Card().setConfig(card);
          } catch (error) {
            rejected.push(`${template.id} ${card.type}: ${(error as Error).message}`);
          }
        }
      }
    expect(rejected).toEqual([]);
  });

  it('put every card of the library to use, between them, in a house that has one of everything', async () => {
    const used = new Set<string>();
    for (const template of TEMPLATES)
      for (const card of cardsOf((await generate({ type: template.type }, everything())).views))
        used.add(card.type);
    // the automations card is placed by hand (1.8): the automatic dashboards do not put it on a view; the appliance
    // card is drawn by the appliances card, which lays the strategy's out whole (#47); a template card says what its
    // templates say, and only the person writes those (#59), as only the person knows a web page's address (#61); an
    // items card lists what a sensor's attribute holds, and only the person says what its items are (#66); a chart card
    // draws the series the person names, in a list or a forecast only they know of (#68); the Energy usage card (#62)
    // is the person's to place, the Energy dashboard's views keep the cards they had; so is the Slider card (#77), the
    // dashboards setting a player's volume, a number and a fan on their own cards; and the Vehicle card (#84); and the
    // remote card (#143), whose television, remote entity and receiver are the person's to say
    const byHand = new Set([
      'custom:fluvy-automations-card',
      'custom:fluvy-remote-card',
      'custom:fluvy-appliance-card',
      'custom:fluvy-template-card',
      'custom:fluvy-web-card',
      'custom:fluvy-items-card',
      'custom:fluvy-chart-card',
      'custom:fluvy-energy-usage-card',
      'custom:fluvy-slider-card',
      'custom:fluvy-vehicle-card',
    ]);
    expect(
      CATALOGUE.map(([tag]) => `custom:${tag}`).filter(
        (type) => !used.has(type) && !byHand.has(type),
      ),
    ).toEqual([]);
  });

  it('give every view the template’s columns: three, and two on the wall', async () => {
    for (const template of TEMPLATES) {
      const { views } = await generate({ type: template.type }, everything());
      expect(views.length).toBeGreaterThan(0);
      for (const view of views) {
        expect(view.max_columns).toBe(template.columns);
        // the columns, side by side, and a band across all of them where the view has one: before them where the view
        // leads with it (the Energy dashboard's period strip), else after them (the appliances)
        const across = view.sections.filter((section) => section.column_span);
        expect(view.sections.length - across.length).toBe(template.columns);
        const first = view.sections.findIndex((section) => !section.column_span);
        expect(
          view.sections.slice(first, first + template.columns).some((s) => s.column_span),
        ).toBe(false);
        for (const band of across) expect(band.column_span).toBe(template.columns);
      }
    }
  });

  it('open with the greeting (and the tabs, when asked), except the wall, which opens with its own composition', async () => {
    for (const template of TEMPLATES) {
      // by default the header's tabs lead between the views: no chips under the greeting
      const plain = await generate({ type: template.type }, everything());
      expect(
        plain.views[0]!.sections[0]!.cards.some(
          (c) =>
            c.type === 'custom:fluvy-chips-card' &&
            (c['chips'] as { path?: string }[]).every((chip) => chip.path !== undefined),
        ),
      ).toBe(false);
      const { views } = await generate(
        { type: template.type, greeting_tabs: 'show' },
        everything(),
      );
      const first = views[0]!.sections[0]!.cards;
      expect(first[0]!.type).toBe('custom:fluvy-hello-card');
      const tabs = first.filter(
        (c) =>
          c.type === 'custom:fluvy-chips-card' &&
          (c['chips'] as { path?: string }[]).every((chip) => chip.path !== undefined),
      );
      // the tabs only when there is more than one; a wall has none (its chips are its scenes)
      if (template.header === 'hello' && views.filter((v) => !v.subview).length > 1)
        expect(first[1]).toBe(tabs[0]);
      else expect(tabs).toEqual([]);
    }
  });

  it('keep the subviews out of the tabs and give each a way back', async () => {
    // a list past its cap opens a subview after its view's path, back to it (#78)
    const list = new RegExp(`^(.+)-(${Object.keys(CAPS).join('|')})$`);
    for (const template of TEMPLATES) {
      const { views } = await generate({ type: template.type }, everything());
      const tabs = views.filter((v) => !v.subview).map((v) => v.path);
      const rooms = views.filter((v) => v.subview);
      for (const room of rooms) {
        // a room, every appliance (Home's), or every one of a capped list
        const of = list.exec(room.path)?.[1];
        expect(room.path.startsWith('room-') || room.path === 'appliances' || of).toBeTruthy();
        expect(room.back_path).toBeDefined();
        if (of && !room.path.startsWith('room-'))
          expect(room.back_path?.endsWith(`/${of}`)).toBe(true);
        const chips = cardsOf(views).filter(
          (c) => c.type === 'custom:fluvy-chips-card',
        ) as unknown as {
          chips: { path?: string }[];
        }[];
        for (const card of chips)
          expect(card.chips.some((chip) => chip.path?.endsWith(`/${room.path}`))).toBe(false);
      }
      // the home opens a room from its Rooms view, the rooms and the wall always
      if (template.id === 'rooms' || template.id === 'wall')
        expect(rooms.length).toBeGreaterThan(0);
      if (template.id === 'home')
        expect(rooms.some((room) => room.path.startsWith('room-'))).toBe(tabs.includes('rooms'));
    }
  });

  it('lead the Energy dashboard’s Today view with the period strip, its cards following it; Now stays live', async () => {
    const hass = { ...(everything() as object), panelUrl: 'fluvy-energy' } as never;
    const { views } = await generate({ type: 'custom:fluvy-energy' }, hass);
    const today = views.find((view) => view.path === 'today')!;
    const [band, first] = today.sections;
    expect(band!.column_span).toBe(3);
    expect(band!.cards).toEqual([
      {
        type: 'custom:fluvy-energy-period-card',
        collection_key: 'energy_fluvy-energy',
        grid_options: { columns: 'full' },
      },
    ]);
    // the greeting still opens the columns
    expect(first!.cards[0]!.type).toBe('custom:fluvy-hello-card');
    const followers = cardsOf([{ ...today, sections: today.sections.slice(1) }]).filter((card) =>
      card.type.startsWith('custom:fluvy-energy'),
    );
    expect(followers.map((card) => card.type).sort()).toEqual([
      'custom:fluvy-energy-balance-card',
      'custom:fluvy-energy-flow-card',
      'custom:fluvy-energy-sankey-card',
      'custom:fluvy-energy-score-card',
    ]);
    for (const card of followers) expect(card['collection_key']).toBe('energy_fluvy-energy');
    // the live view and the home dashboard's energy keep their own periods
    const now = views.find((view) => view.path === 'now')!;
    expect(cardsOf([now]).some((card) => 'collection_key' in card)).toBe(false);
    const home = await generate({ type: 'custom:fluvy-home' }, hass);
    expect(cardsOf(home.views).some((card) => 'collection_key' in card)).toBe(false);
  });

  it('leave out the views `hide` names, never the first', async () => {
    const energy = templateById('energy');
    const all = (await generate({ type: energy.type }, everything())).views
      .filter((v) => !v.subview)
      .map((v) => v.path);
    expect(all[0]).toBe('now');
    expect(all.length).toBeGreaterThan(2);
    const kept = (
      await generate({ type: energy.type, hide: ['now', 'meters', all[1]!] }, everything())
    ).views.map((v) => v.path);
    expect(kept[0]).toBe('now');
    expect(kept).not.toContain('meters');
    expect(kept).not.toContain(all[1]);
  });

  it('give the wall the rooms asked for that exist, in that order, and every room without a choice', async () => {
    const wall = templateById('wall');
    const roomsOf = (views: readonly View[]) => views.filter((v) => v.subview).map((v) => v.path);
    // an attic with nothing in it: never a room by itself, kept when the wall asks for it
    const house = () => {
      const hass = everything() as { areas: Record<string, unknown> };
      hass.areas['attic'] = { area_id: 'attic', name: 'Attic' };
      return hass as never;
    };
    const all = roomsOf((await generate({ type: wall.type }, house())).views);
    expect(all.length).toBeGreaterThan(2);
    expect(all).not.toContain('room-attic');
    const chosen = (
      await generate(
        { type: wall.type, areas: ['kitchen', 'attic', 'living_room', 'nowhere'] },
        house(),
      )
    ).views;
    expect(roomsOf(chosen)).toEqual(['room-kitchen', 'room-attic', 'room-living_room']);
    const wallView = chosen[0]!;
    const roomCards = wallView.sections[0]!.cards.filter(
      (c) => c.type === 'custom:fluvy-room-card',
    );
    expect(roomCards.map((c) => c['area'])).toEqual(['kitchen', 'attic', 'living_room']);
    expect(roomCards.every((c) => c['variant'] === 'tile')).toBe(true);
    expect(wallView.back_path).toBeUndefined();
    expect(chosen[1]!.back_path).toBe('/fluvy-home/wall');
  });

  it('give the rooms dashboard a tab a floor when the house has two, and a room its floor’s tab to come back to', async () => {
    const rooms = templateById('rooms');
    const { views } = await generate({ type: rooms.type }, everything());
    const tabs = views.filter((v) => !v.subview);
    expect(tabs.map((v) => v.path)).toEqual(['floor-ground', 'floor-upstairs', 'rooms']);
    expect(tabs.map((v) => v.title)).toEqual(['Ground floor', 'Upstairs', 'Other rooms']);
    const bedroom = views.find((v) => v.path === 'room-bedroom')!;
    expect(bedroom.back_path).toBe('/fluvy-home/floor-upstairs');
    const garden = views.find((v) => v.path === 'room-garden')!;
    expect(garden.back_path).toBe('/fluvy-home/rooms');
  });

  it('draw the security cameras on one Cameras card a view at the refresh asked for, and the wall’s scenes up to the number asked for', async () => {
    const security = templateById('security');
    const { views } = await generate({ type: security.type, camera_refresh: 30 }, everything());
    // the overview's first four, then every camera across the cameras view's columns (#60)
    const [overview, all, ...more] = cardsOf(views).filter(
      (c) => c.type === 'custom:fluvy-cameras-card',
    ) as unknown as { cameras: string[]; refresh: number; grid_options: unknown }[];
    expect(more).toEqual([]);
    expect(overview!.cameras.length).toBeGreaterThan(0);
    expect(overview!.cameras.length).toBeLessThanOrEqual(4);
    expect(all!.cameras.length).toBeGreaterThanOrEqual(overview!.cameras.length);
    expect(all!.grid_options).toEqual({ columns: 'full' });
    expect([overview!.refresh, all!.refresh]).toEqual([30, 30]);
    expect(cardsOf(views).some((c) => c.type === 'custom:fluvy-camera-card')).toBe(false);
    const wall = templateById('wall');
    const chips = cardsOf(
      (await generate({ type: wall.type, scenes_max: 4 }, everything())).views,
    ).find((c) => c.type === 'custom:fluvy-chips-card') as unknown as { chips: unknown[] };
    expect(chips.chips.length).toBeLessThanOrEqual(4);
  });

  it('offer what is a room’s photo’s alone on the dashboards of rooms, while their rooms may be photos (#159)', () => {
    const own = ['room_name_position', 'room_readout_style', 'room_readout_labels'];
    for (const template of TEMPLATES) {
      const offered = template.options.filter((option) => own.includes(option.key));
      const draws = template.id === 'home' || template.id === 'rooms';
      expect(
        offered.map((option) => option.key),
        template.id,
      ).toEqual(draws ? own : []);
      for (const option of offered) {
        if (option.kind !== 'choice') throw new Error(`${option.key} is no choice`);
        // the default where an area has a picture, and the photo asked for: offered; tiles and rows draw none
        expect(option.when?.({})).toBe(true);
        expect(option.when?.({ room_variant: 'photo' })).toBe(true);
        expect(option.when?.({ room_variant: 'tile' })).toBe(false);
        expect(option.when?.({ room_variant: 'row' })).toBe(false);
      }
    }
    // a settings file carries them, each well formed: a word the card does not know is dropped
    expect(
      strategyOptions(
        { room_name_position: 'top', room_readout_style: 'wrap', room_readout_labels: 'glyphs' },
        templateById('rooms'),
      ),
    ).toEqual({ room_name_position: 'top', room_readout_style: 'wrap' });
    expect(strategyOptions({ room_readout_labels: 'none' }, HOME_TEMPLATE)).toEqual({
      room_readout_labels: 'none',
    });
    expect(strategyOptions({ room_name_position: 'top' }, templateById('wall'))).toEqual({});
  });

  it('keep only the options a template knows, each well formed', () => {
    expect(
      strategyOptions(
        {
          thermostat_variant: 'ruler',
          tile_size: 'huge',
          flow_style: 'rail',
          hide: ['media', 'home', 'nowhere', 'media'],
          weather: 'weather.home',
          areas: ['kitchen'],
        },
        HOME_TEMPLATE,
      ),
    ).toEqual({ thermostat_variant: 'ruler', flow_style: 'rail', hide: ['media'] });
    expect(
      strategyOptions(
        { camera_refresh: 30, hide: ['cameras'], flow_style: 'rail', areas: ['kitchen'] },
        templateById('security'),
      ),
    ).toEqual({ camera_refresh: 30, hide: ['cameras'] });
    expect(
      strategyOptions(
        { areas: ['kitchen', '', 7, 'kitchen'], scenes_max: 5 },
        templateById('wall'),
      ),
    ).toEqual({ areas: ['kitchen'] });
    // the tiles' switches (#160) beside their size: the dashboards that draw large tiles, a word they know
    for (const id of ['home', 'rooms'] as const) {
      expect(strategyOptions({ tile_switch: 'hide' }, templateById(id))).toEqual({
        tile_switch: 'hide',
      });
      expect(strategyOptions({ tile_switch: 'value' }, templateById(id))).toEqual({
        tile_switch: 'value',
      });
      expect(strategyOptions({ tile_switch: false }, templateById(id))).toEqual({});
    }
    expect(strategyOptions({ tile_switch: 'hide' }, templateById('energy'))).toEqual({});
    expect(strategyOptions('nonsense', HOME_TEMPLATE)).toEqual({});
    // the caps: every list whole, or a list's own number or `none`, the lists every template knows
    for (const template of TEMPLATES) {
      expect(strategyOptions({ caps: 'none' }, template)).toEqual({ caps: 'none' });
      expect(
        strategyOptions(
          { caps: { lights: 12, humidity: 'none', fridges: 2, covers: 0 } },
          template,
        ),
      ).toEqual({ caps: { lights: 12, humidity: 'none' } });
      expect(strategyOptions({ caps: 'some' }, template)).toEqual({});
      // what a dashboard leaves out is the house's own, as its weather is: every template offers it, no file carries it
      expect(template.options.some((option) => option.key === 'exclude')).toBe(true);
      expect(strategyOptions({ exclude: ['climate.water_heater'] }, template)).toEqual({});
      // what lies behind its cards (#155): every template offers its own, parsed whole; anything else is the house's
      expect(template.options.some((option) => option.key === 'background')).toBe(true);
      expect(
        strategyOptions(
          { background: { type: 'image', image: '/local/a b.jpg', dim: 30, blur: true } },
          template,
        ),
      ).toEqual({
        background: { type: 'image', colors: ['#dbe5d8'], image: '', dim: 30, blur: true },
      });
      expect(strategyOptions({ background: 'gradient' }, template)).toEqual({});
    }
  });

  it('draw the reporter’s garage whole on its page: readings, the Openings card, the door as a cover (golden file, #76)', async () => {
    const hass = house([
      entity('sensor.garage_temperature', '12.5', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      entity('sensor.garage_humidity', '71', {
        device_class: 'humidity',
        unit_of_measurement: '%',
      }),
      entity('binary_sensor.garage_smoke', 'off', { device_class: 'smoke' }),
      entity('binary_sensor.garage_leak', 'off', { device_class: 'moisture' }),
      entity('cover.garage_main_door', 'closed', { device_class: 'garage', supported_features: 3 }),
    ]) as unknown as HomeAssistant;
    for (const id of Object.keys(hass.entities).filter((id) => id.includes('.garage_')))
      hass.entities[id] = { ...hass.entities[id]!, area_id: 'garage' };
    hass.areas['garage'] = { area_id: 'garage', name: 'Garage', icon: 'mdi:garage' } as never;
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    expect(views.find((view) => view.path === 'room-garage')).toMatchSnapshot();
  });

  it('build every dashboard for a house whose registries say numbers, each read as it is written (#129)', async () => {
    for (const template of TEMPLATES) {
      const read = await generate({ type: template.type }, numbered((value) => value) as never);
      expect(read, template.id).toEqual(
        await generate({ type: template.type }, numbered(String) as never),
      );
    }
    // the thermometer on no area is placed by its device's name; the loft's page is titled by its own
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, numbered((v) => v) as never);
    expect(views.find((view) => view.path === 'room-loft')?.title).toBe('3');
    const home = await generate({ type: 'custom:fluvy-home' }, numbered((v) => v) as never);
    expect(
      cardsOf(home.views).find((card) => card['entity'] === 'sensor.thermo_temperature')?.['name'],
    ).toBe('4711');
  });

  it('draw a dashboard without a part that throws on a house nobody foresaw, and say once which part (#129)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    /** A house whose registry entry throws when that field of it is read. */
    const broken = (entry: (hass: HomeAssistant) => object, key: string): HomeAssistant => {
      const hass = everything() as unknown as HomeAssistant;
      Object.defineProperty(entry(hass), key, {
        get: () => {
          throw new Error(`${key} nobody foresaw`);
        },
      });
      return hass;
    };
    const parts = [
      // a device's model: the appliances' search alone reads it
      { part: 'appliances', hass: () => broken((hass) => hass.devices['hc-dish']!, 'model') },
      // a printer entity's key: the printers' search, and the appliances' (which leaves the printers out)
      {
        part: 'printers',
        hass: () => broken((hass) => hass.entities['sensor.p1s_print_status']!, 'translation_key'),
      },
      // a device's name: the names its entities are called and placed by, and the appliances' search
      { part: 'names', hass: () => broken((hass) => hass.devices['d-garden']!, 'name') },
    ];
    const whole = await generate({ type: 'custom:fluvy-home' }, everything());
    for (const { part, hass } of parts) {
      warn.mockClear();
      const { views } = await generate({ type: 'custom:fluvy-home' }, hass() as never);
      const said = warn.mock.calls.map(([words]) => words);
      expect(
        said.filter(
          (words) => words === `fluvy: the automatic dashboard is drawn without its ${part}`,
        ),
        part,
      ).toHaveLength(1);
      expect(
        warn.mock.calls.every(([, error]) => error instanceof Error),
        part,
      ).toBe(true);
      // every view still drawn, but the appliances' own where their search failed
      const kept = whole.views.map((view) => view.path);
      expect(
        views.map((view) => view.path),
        part,
      ).toEqual(
        said.some((words) => String(words).endsWith('appliances'))
          ? kept.filter((path) => path !== 'appliances')
          : kept,
      );
      expect(cardsOf(views).length, part).toBeGreaterThan(cardsOf(whole.views).length / 2);
      for (const template of TEMPLATES)
        await expect(generate({ type: template.type }, hass() as never)).resolves.toBeDefined();
    }
    warn.mockRestore();
  });

  it('end a capped list with "N more" and open every one on a subview (golden file, #78)', async () => {
    const hass = house(
      Array.from({ length: 12 }, (_, i) =>
        entity(
          `sensor.room_${i + 1}_humidity`,
          String(40 + i),
          { device_class: 'humidity', unit_of_measurement: '%' },
          { area_id: `room_${i + 1}` },
        ),
      ),
    ) as unknown as HomeAssistant;
    for (let i = 1; i <= 12; i++)
      hass.areas[`room_${i}`] = { area_id: `room_${i}`, name: `Room ${i}` } as never;
    const { views } = await generate({ type: 'custom:fluvy-home' }, hass as never);
    expect(
      views.filter((view) => view.path === 'climate' || view.path === 'climate-humidity'),
    ).toMatchSnapshot();
  });
});
