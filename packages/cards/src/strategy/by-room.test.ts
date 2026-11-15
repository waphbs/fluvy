// @vitest-environment happy-dom
import { setRoomOrder, type HomeAssistant, type RoomOrder } from '@fluvy/core';
import { DEMO_ROOMS, demoHass, type DemoEntity } from '@fluvy/demo-home';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import { familiesDefined } from '../index.js';
import { buildContext } from './context.js';
import { generate } from './generate.js';
import { HomeRegistry } from './home-registry.js';
import { lightRows } from './layout.js';
import { strategyOptions, templateById } from './templates.js';
import type { Card, FluvyStrategyConfig, View } from './types.js';

// the families' chunks are fetched as the module loads: they land before the file's environment goes
afterAll(() => familiesDefined);

/*
 * Which room a light or a scene belongs to (#189), on the automatic dashboards: the house's order of its rooms, read
 * by every list by room; Home's lights under their rooms' labels and the scenes as chips by room, each an option a
 * person turns on — with none of them, the dashboards are 1.20's.
 */

const entity = (
  id: string,
  name: string,
  area?: string,
  attributes: Record<string, unknown> = {},
): DemoEntity => ({
  id,
  state: 'off',
  attributes: { friendly_name: name, ...attributes },
  ...(area ? { registry: { area_id: area } } : {}),
});
const ONOFF = { supported_color_modes: ['onoff'] };

/**
 * The demo home in the reporter's shape: a kitchen of four lights named with it, three scenes there that all begin
 * "Lights", two in the living room named with it, and one in no room. Its rooms, as Home Assistant lists
 * them: the living room and the kitchen downstairs, the bedroom upstairs, the garden on no floor.
 */
const MORE: readonly DemoEntity[] = [
  ...DEMO_ROOMS,
  entity('light.kitchen_island', 'Kitchen Island', 'kitchen', ONOFF),
  entity('light.kitchen_pendant', 'Kitchen Pendant', 'kitchen', ONOFF),
  entity('light.kitchen_counter', 'Counter Kitchen', 'kitchen', ONOFF),
  entity('scene.kitchen_cooking', 'Lights Cooking', 'kitchen'),
  entity('scene.kitchen_dinner', 'Lights Dinner', 'kitchen'),
  entity('scene.kitchen_evening', 'Lights Evening', 'kitchen'),
  entity('scene.living_relax', 'Living room Relax', 'living_room'),
  entity('scene.living_tv', 'Living room TV', 'living_room'),
  entity('scene.good_night', 'Good night'),
];
const house = (more: readonly DemoEntity[] = MORE): HomeAssistant =>
  demoHass({ more }) as unknown as HomeAssistant;

const home = (config: Partial<FluvyStrategyConfig> = {}, hass = house()) =>
  generate({ type: 'custom:fluvy-home', ...config }, hass);
const viewOf = (views: readonly View[], path: string): View =>
  views.find((view) => view.path === path) as View;
const cardsOf = (view: View): Card[] => view.sections.flatMap((section) => section.cards);
const kind = (card: Card): string => card.type.replace('custom:fluvy-', '').replace('-card', '');
/** A view's cards of a kind. */
const ofKind = (view: View, name: string): Card[] =>
  cardsOf(view).filter((card) => kind(card) === name);
/** A card as a word: a heading or a label by its title, a tile by the name it says. */
const said = (card: Card): string =>
  kind(card) === 'heading'
    ? `${card['heading_style'] === 'label' ? '#' : '##'} ${String(card['title'])}`
    : `${String(card['entity'])}${card['name'] ? ` "${String(card['name'])}"` : ''}`;

describe('the house’s order of its rooms on the automatic dashboards (#189)', () => {
  afterEach(() => setRoomOrder({ sort: 'auto', order: [] }));

  /** The dashboards as a house that orders its rooms so reads them. */
  const under = async (rooms: RoomOrder) => {
    setRoomOrder(rooms);
    const { views } = await home();
    return {
      // the Rooms view: its floors' headings and its rooms' cards, as they stand
      rooms: cardsOf(viewOf(views, 'rooms'))
        .filter((card) => ['heading', 'room'].includes(kind(card)))
        .map((card) => String(card['title'] ?? card['area'])),
      // the Lights view: its groups, by their headings
      lights: ofKind(viewOf(views, 'lights'), 'heading').map((card) => String(card['title'])),
    };
  };

  it('keeps every list as 1.20 sorted it while the house names no order', async () => {
    expect(await under({ sort: 'auto', order: [] })).toEqual({
      // floor by floor, by level, each floor's rooms A to Z; the one on no floor last
      rooms: ['Ground floor', 'kitchen', 'living_room', 'Upstairs', 'bedroom', 'Rooms', 'garden'],
      // the biggest room first
      lights: ['Kitchen', 'Bedroom', 'Living room', 'Outdoor'],
    });
  });

  it('follows Home Assistant’s own order: every list by room, the rooms within their floors', async () => {
    expect(await under({ sort: 'home_assistant', order: [] })).toEqual({
      rooms: ['Ground floor', 'living_room', 'kitchen', 'Upstairs', 'bedroom', 'Rooms', 'garden'],
      // what is in no room last
      lights: ['Living room', 'Kitchen', 'Bedroom', 'Outdoor'],
    });
  });

  it('sorts A to Z', async () => {
    expect(await under({ sort: 'name', order: [] })).toEqual({
      rooms: ['Ground floor', 'kitchen', 'living_room', 'Upstairs', 'bedroom', 'Rooms', 'garden'],
      lights: ['Bedroom', 'Kitchen', 'Living room', 'Outdoor'],
    });
  });

  it('puts the house’s own rooms first, the rest as each list sorts them', async () => {
    expect(await under({ sort: 'auto', order: ['living_room', 'bedroom'] })).toEqual({
      // the floors keep their order: the living room leads its floor
      rooms: ['Ground floor', 'living_room', 'kitchen', 'Upstairs', 'bedroom', 'Rooms', 'garden'],
      lights: ['Living room', 'Bedroom', 'Kitchen', 'Outdoor'],
    });
  });

  it('orders a list split by room, a wall’s rooms and the rooms dashboard’s the same way', async () => {
    const groups = (rooms: RoomOrder): string[] => {
      setRoomOrder(rooms);
      const registry = new HomeRegistry(house());
      return registry.byRoom(registry.lights, () => 'Elsewhere').map(([name]) => name);
    };
    expect(groups({ sort: 'auto', order: [] })).toEqual([
      'Kitchen',
      'Bedroom',
      'Living room',
      'Elsewhere',
    ]);
    expect(groups({ sort: 'name', order: ['living_room'] })).toEqual([
      'Living room',
      'Bedroom',
      'Kitchen',
      'Elsewhere',
    ]);
    const walled = async (rooms: RoomOrder): Promise<string[]> => {
      setRoomOrder(rooms);
      const { views } = await generate({ type: 'custom:fluvy-wall' }, house());
      return ofKind(viewOf(views, 'wall'), 'room').map((card) => String(card['area']));
    };
    expect(await walled({ sort: 'auto', order: [] })).toEqual([
      'kitchen',
      'living_room',
      'bedroom',
      'garden',
    ]);
    expect(await walled({ sort: 'name', order: [] })).toEqual([
      'bedroom',
      'garden',
      'kitchen',
      'living_room',
    ]);
    // the rooms dashboard's tabs are the floors, in Home Assistant's order where the house follows it
    const tabs = async (rooms: RoomOrder): Promise<string[]> => {
      setRoomOrder(rooms);
      const hass = house();
      // Home Assistant lists the upper floor first
      const floors = Object.fromEntries(Object.entries(hass.floors ?? {}).reverse());
      const { views } = await generate({ type: 'custom:fluvy-rooms' }, { ...hass, floors });
      return views.filter((view) => !view.subview).map((view) => view.title);
    };
    expect(await tabs({ sort: 'auto', order: [] })).toEqual([
      'Ground floor',
      'Upstairs',
      'Other rooms',
      'Kitchen',
      'Living room',
      'Bedroom',
      'Garden',
    ]);
    expect(await tabs({ sort: 'home_assistant', order: [] })).toEqual([
      'Upstairs',
      'Ground floor',
      'Other rooms',
      'Bedroom',
      'Living room',
      'Kitchen',
      'Garden',
    ]);
  });
});

describe('Home by room, an option a person turns on (#189)', () => {
  it('is 1.20’s dashboard while nobody asks: the options’ own words for off write nothing new', async () => {
    const plain = await home();
    expect(await home({ group_by: 'none', scenes_style: 'tiles' })).toEqual(plain);
    const cards = plain.views.flatMap(cardsOf);
    expect(cards.some((card) => card['heading_style'] === 'label')).toBe(false);
    for (const card of cards.filter((card) => kind(card) === 'scenes')) {
      expect(card['variant']).toBeUndefined();
      expect((card['scenes'] as unknown[]).every((entry) => !Object(entry).section)).toBe(true);
    }
  });

  it('draws Home’s lights under their rooms’ labels, a label with its first row, the names short', async () => {
    const { views } = await home({ group_by: 'room' });
    const column = viewOf(views, 'home').sections.find((section) =>
      section.cards.some((card) => card['heading_style'] === 'label'),
    );
    const cards = column?.cards ?? [];
    const from = cards.findIndex((card) => card['title'] === 'Lights');
    const more = cards.findIndex((card) => card['more'] !== undefined);
    // the cap of six counts the tiles: the kitchen's four (the biggest room first), then the bedroom's two
    expect(cards.slice(from, more).map(said)).toEqual([
      '## Lights',
      '# Kitchen',
      'light.kitchen_counter "Counter"',
      'light.kitchen_island "Island"',
      'light.kitchen_pendant "Pendant"',
      'switch.kitchen_light "Light"',
      '# Bedroom',
      // a name that says nothing of its room stays as it is
      'light.bedroom_bedside',
      'light.bedroom_ceiling "Ceiling"',
    ]);
    // what the view leaves to the subview: every light, room by room, as the Lights view groups them
    expect(cards[more]?.['more']).toBe(2);
    const subview = viewOf(views, 'home-lights');
    expect(ofKind(subview, 'heading').map((card) => String(card['title']))).toEqual([
      'Home',
      'Kitchen',
      'Bedroom',
      'Living room',
      'Outdoor',
    ]);
    // a label is no heading of its own: 12 of its column, and never a meta, a glyph or a way somewhere
    const label = cards[from + 1] as Card;
    expect(label).toEqual({
      type: 'custom:fluvy-heading-card',
      title: 'Kitchen',
      heading_style: 'label',
    });
  });

  it('keeps a room’s lights together under its label: one block a room, so the columns never part one', async () => {
    const ctx = await buildContext({ type: 'custom:fluvy-home', group_by: 'room' }, house());
    const blocks = lightRows(ctx, [
      'light.kitchen_counter',
      'light.kitchen_island',
      'light.kitchen_pendant',
      'light.bedroom_bedside',
      'light.bedroom_ceiling',
    ]);
    // a block is what the layout keeps in one column: the label and every light of its room, the odd one across
    expect(blocks.map((block) => block.map(said))).toEqual([
      [
        '# Kitchen',
        'light.kitchen_counter "Counter"',
        'light.kitchen_island "Island"',
        'light.kitchen_pendant "Pendant"',
      ],
      ['# Bedroom', 'light.bedroom_bedside', 'light.bedroom_ceiling "Ceiling"'],
    ]);
    expect(blocks[0]?.at(-1)?.['grid_options']).toEqual({ columns: 12 });
  });

  it('keeps a name a person gave a light whole, and their own order inside its room', async () => {
    const { views } = await home({
      group_by: 'room',
      edit: {
        cards: { 'home/lights:light.kitchen_pendant': { options: { name: 'Kitchen Pendant' } } },
        entities: {
          'home/lights': { order: ['light.kitchen_pendant'], drop: ['light.kitchen_island'] },
        },
      },
    });
    const tiles = ofKind(viewOf(views, 'home'), 'tile').map(said);
    expect(tiles.slice(0, 3)).toEqual([
      'light.kitchen_pendant "Kitchen Pendant"',
      'light.kitchen_counter "Counter"',
      'switch.kitchen_light "Light"',
    ]);
  });

  it('follows the house’s order of its rooms: the first rooms’ lights are the ones Home shows', async () => {
    setRoomOrder({ sort: 'auto', order: ['living_room', 'bedroom'] });
    try {
      const { views } = await home({ group_by: 'room' });
      const labels = ofKind(viewOf(views, 'home'), 'heading')
        .filter((card) => card['heading_style'] === 'label')
        .map((card) => card['title']);
      expect(labels).toEqual(['Living room', 'Bedroom', 'Kitchen']);
    } finally {
      setRoomOrder({ sort: 'auto', order: [] });
    }
  });

  it('draws the scenes of Home and of the Lights view by room, as tiles under their labels', async () => {
    const { views } = await home({ group_by: 'room' });
    for (const path of ['home', 'lights']) {
      const [card] = ofKind(viewOf(views, path), 'scenes');
      expect(card?.['variant'], path).toBeUndefined();
      // the card reads the names short under each room itself; the one in no room stands under "Whole home"
      expect(card?.['scenes'], path).toEqual([
        { section: 'Kitchen' },
        'scene.kitchen_cooking',
        'scene.kitchen_dinner',
        'scene.kitchen_evening',
        { section: 'Living room' },
        'scene.living_relax',
        'scene.living_tv',
        { section: 'Whole home' },
        'scene.good_night',
      ]);
    }
    // a room's own page has one room: its scenes as they were
    const [kitchen] = ofKind(viewOf(views, 'room-kitchen'), 'scenes');
    expect(kitchen?.['scenes']).toEqual([
      'scene.kitchen_cooking',
      'scene.kitchen_dinner',
      'scene.kitchen_evening',
    ]);
  });

  it('draws the scenes as chips: by room on Home and the Lights view, twelve before their "N more" row', async () => {
    const { views } = await home({ scenes_style: 'chips' });
    const [card] = ofKind(viewOf(views, 'home'), 'scenes');
    expect(card).toMatchObject({ title: 'Scenes', variant: 'chips' });
    expect((card?.['scenes'] as unknown[]).filter((entry) => Object(entry).section)).toEqual([
      { section: 'Kitchen' },
      { section: 'Living room' },
      { section: 'Whole home' },
    ]);
    // the lights stay as they were: their grouping is another option
    expect(cardsOf(viewOf(views, 'home')).some((c) => c['heading_style'] === 'label')).toBe(false);
    // a room's page: its chips say their names without it
    const [living] = ofKind(viewOf(views, 'room-living_room'), 'scenes');
    expect(living).toMatchObject({ variant: 'chips' });
    expect(living?.['scenes']).toEqual([
      { entity: 'scene.living_relax', name: 'Relax' },
      { entity: 'scene.living_tv', name: 'TV' },
    ]);
    // twenty scenes: twelve as chips, room by room, where tiles show six
    const many = Array.from({ length: 14 }, (_, n) =>
      entity(`scene.hall_${String(n).padStart(2, '0')}`, `Hall ${n}`, 'bedroom'),
    );
    const chips = await home({ scenes_style: 'chips' }, house([...MORE, ...many]));
    const [capped] = ofKind(viewOf(chips.views, 'home'), 'scenes');
    const shown = (capped?.['scenes'] as unknown[]).filter((entry) => !Object(entry).section);
    expect(shown).toHaveLength(12);
    // the biggest room first: its fourteen fill the twelve
    expect((capped?.['scenes'] as unknown[])[0]).toEqual({ section: 'Bedroom' });
    const tiles = await home({}, house([...MORE, ...many]));
    expect((ofKind(viewOf(tiles.views, 'home'), 'scenes')[0]?.['scenes'] as unknown[]).length).toBe(
      6,
    );
  });

  it('offers both options on the home dashboard, the scenes’ on the rooms dashboard, and reads their words alone', () => {
    const keys = (id: 'home' | 'rooms' | 'wall' | 'energy'): string[] =>
      templateById(id).options.map((option) => option.key);
    expect(keys('home')).toEqual(expect.arrayContaining(['group_by', 'scenes_style']));
    expect(keys('rooms')).toContain('scenes_style');
    expect(keys('rooms')).not.toContain('group_by');
    expect(keys('wall')).not.toContain('scenes_style');
    expect(keys('energy')).not.toContain('group_by');
    const template = templateById('home');
    expect(strategyOptions({ group_by: 'room', scenes_style: 'chips' }, template)).toEqual({
      group_by: 'room',
      scenes_style: 'chips',
    });
    expect(strategyOptions({ group_by: 'floor', scenes_style: 'pills' }, template)).toEqual({});
  });
});
