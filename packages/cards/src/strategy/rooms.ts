import { climateAttribute, holdsSomething, type AreaRegistryEntry } from '@fluvy/core';
import { applianceSections } from './appliances.js';
import { byArea, capped, each, foldAt, moreAfter, moreKeys } from './caps.js';
import type { HomeRegistry } from './home-registry.js';
import {
  applianceTile,
  entityRows,
  flowed,
  full,
  headed,
  heading,
  lightGroups,
  readoutsCards,
  section,
  sizedTile,
  thermostat,
  tileRows,
  when,
} from './layout.js';
import type { Card, Section, StrategyContext, View } from './types.js';

/*
 * The rooms: a view of every room of the house (its card, grouped by floor when there are floors), and a subview
 * per room with everything it shows, every device its card counts among it — its thermostats, lights, covers, gates,
 * fans, media, plugs, readings, openings and cameras, the rest of it as rows, its automations on a card of their own,
 * and its appliances across under them.
 */

/** The areas a dashboard shows: those with something to show, by the room card's own rule, floor by floor. */
export function roomsOf(home: HomeRegistry): AreaRegistryEntry[] {
  return home.areas.filter((area) => holdsSomething(home.contents(area.area_id)));
}

const roomPath = (base: string, area: AreaRegistryEntry): string => `${base}/room-${area.area_id}`;

/**
 * A room's card: its page as its path, the dashboard's style — its photo's own (#159) as the dashboard asks of every
 * room, then of this one — and what the dashboard tunes it to hold (`rooms`).
 */
export const roomCard = (ctx: StrategyContext, area: AreaRegistryEntry): Card => ({
  type: 'custom:fluvy-room-card',
  area: area.area_id,
  path: roomPath(ctx.base, area),
  ...(ctx.style.room ? { variant: ctx.style.room } : {}),
  ...ctx.style.roomLook,
  ...ctx.home.look(area.area_id),
  ...ctx.home.tuning(area.area_id),
  grid_options: { columns: 12 },
});

/** The Rooms view: a card a room; headed by floor when the house has more than one. */
export function roomsView(ctx: StrategyContext): Section[] {
  const { home, t, base } = ctx;
  const rooms = roomsOf(home);
  const floors = home.floors.filter((floor) =>
    rooms.some((room) => room.floor_id === floor.floor_id),
  );
  if (floors.length < 2)
    return flowed(
      ctx,
      rooms.map((area) => [roomCard(ctx, area)]),
    );
  const unplaced = rooms.filter(
    (room) => !floors.some((floor) => floor.floor_id === room.floor_id),
  );
  return flowed(ctx, [
    ...floors
      .map((floor) =>
        headed(
          heading(floor.name, floor.icon ?? 'fluvy:home', [], `${base}/rooms`),
          rooms
            .filter((room) => room.floor_id === floor.floor_id)
            .map((area) => [roomCard(ctx, area)]),
        ),
      )
      .flat(),
    ...(unplaced.length
      ? headed(
          heading(t('strategy.rooms'), 'fluvy:home', [], `${base}/rooms`),
          unplaced.map((area) => [roomCard(ctx, area)]),
        )
      : []),
  ]);
}

/** Where a room's heading leads back to, and what it says ("All rooms", or the wall's home). */
export interface RoomBack {
  readonly path: string;
  readonly title: string;
}

/**
 * What a room holds, each entity it shows (`areaContents`: the room card's own rule, as the dashboard tunes it) in one
 * part of its page (#76): every device its card counts is on it, and every reading, sensor and control its area shows
 * besides (#95).
 */
export interface RoomParts {
  readonly thermostats: readonly string[];
  readonly lights: readonly string[];
  /** Blinds, curtains, awnings. */
  readonly covers: readonly string[];
  /** Garage doors and gates. */
  readonly gates: readonly string[];
  readonly fans: readonly string[];
  readonly players: readonly string[];
  /** The plugs' tiles. */
  readonly appliances: readonly string[];
  /** Its temperatures and humidities. */
  readonly readings: readonly string[];
  /** Doors, windows, motion, leaks, smoke and gas. */
  readonly openings: readonly string[];
  readonly cameras: readonly string[];
  /** Its automations, on an Automations card of their own (#118): never a device. */
  readonly automations: readonly string[];
  /** The appliances drawn whole across the page (their devices). */
  readonly devices: readonly string[];
  /** Everything else, as rows. */
  readonly rest: readonly string[];
  /** What the parts' cards show of the room besides: an appliance's own entities, a plug's power and energy. */
  readonly within: readonly string[];
}

/** A room's parts, each in the house's order. */
export function roomParts(home: HomeRegistry, areaId: string): RoomParts {
  const shown = home.contents(areaId).entities;
  const has = new Set(shown);
  const of = (ids: readonly string[]): string[] => ids.filter((id) => has.has(id));
  const devices = home.applianceDevices.filter((device) => home.deviceArea(device) === areaId);
  const appliances = of(home.applianceTiles);
  const parts = {
    thermostats: of(home.climate),
    lights: of(home.lights),
    covers: of(home.covers),
    gates: of(home.gateways),
    fans: of(home.fans),
    players: of(home.players),
    appliances,
    readings: of([...home.temperatures, ...home.humidities]),
    openings: of(home.openings),
    cameras: of(home.cameras),
    automations: of(home.automations),
  };
  const drawn = new Set(Object.values(parts).flat());
  const whole = new Set(devices);
  const within = new Set([
    ...shown.filter((id) => whole.has(home.deviceOf(id) ?? '')),
    ...appliances.flatMap((id) => home.readoutsOf(id)),
  ]);
  return {
    ...parts,
    devices,
    rest: shown.filter((id) => !drawn.has(id) && !within.has(id)),
    within: [...within].filter((id) => has.has(id) && !drawn.has(id)),
  };
}

/**
 * One room: everything it holds, in the home view's reading order, under a way back to where it was opened from; each
 * list at the house's cap, with its "N more" row.
 */
export function roomSections(
  ctx: StrategyContext,
  area: AreaRegistryEntry,
  back: RoomBack,
  columns = 3,
): Section[] {
  const { home, t } = ctx;
  const parts = roomParts(home, area.area_id);
  const found = home.contents(area.area_id).climate;
  // the room's own readings, else the sensors its area names (a thermostat's or an appliance's reading is its card's)
  const named = (['temperature', 'humidity'] as const).flatMap((kind) => {
    const id = found[kind];
    return id && !climateAttribute(id, kind) && !home.ofAppliance(id) ? [id] : [];
  });
  const gate = (id: string): Card => full('cover', { entity: id, ...home.named(id) });
  const fan = (id: string): Card => full('fan', { entity: id, ...home.named(id) });
  const player = (id: string): Card => full('media', { entity: id, ...home.named(id) });
  const camera = (id: string): Card => full('camera', { entity: id });
  const coverTiles = (ids: readonly string[]): Card =>
    full('tiles', {
      size: 'compact',
      columns: 2,
      tiles: ids.map((id) => ({ entity: id, ...home.named(id) })),
    });
  const rows = (title: string, ids: readonly string[], extra: Record<string, unknown> = {}): Card =>
    full('entities', { title, rows: entityRows(home, ids), ...extra });
  const thermostats = capped(
    ctx,
    { key: 'thermostats', title: 'strategy.thermostats', icon: 'fluvy:thermo' },
    parts.thermostats,
    each((id) => thermostat(id, ctx.style)),
  );
  const lights = capped(
    ctx,
    { key: 'lights', title: 'room.lights', icon: 'fluvy:bulb' },
    parts.lights,
    (ids) => lightGroups(ctx, ids),
  );
  const covers = capped(
    ctx,
    { key: 'covers', title: 'room.covers', icon: 'fluvy:blinds' },
    parts.covers,
    (ids) => [[coverTiles(ids)]],
  );
  const gates = capped(
    ctx,
    { key: 'gates', title: 'strategy.gates', icon: 'fluvy:door' },
    parts.gates,
    each(gate),
  );
  const fans = capped(
    ctx,
    { key: 'fans', title: 'room.fans', icon: 'fluvy:fan' },
    parts.fans,
    each(fan),
  );
  const players = capped(
    ctx,
    { key: 'media', title: 'room.media', icon: 'fluvy:speaker' },
    parts.players,
    each(player),
  );
  const plugs = capped(
    ctx,
    { key: 'appliances', title: 'strategy.appliances', icon: 'fluvy:plug' },
    parts.appliances,
    (ids) => tileRows(ids.map((id) => applianceTile(home, id, ctx.style))),
  );
  // every reading on the room's page is the room's: each is named by what it measures, as the room card names its
  // climate, where it alone measures it (two thermometers keep their own names)
  const measured = parts.readings.length ? parts.readings : named;
  const kindOf = (id: string): 'temperature' | 'humidity' =>
    id === found.humidity || home.humidities.includes(id) ? 'humidity' : 'temperature';
  const measureName = (id: string): string =>
    measured.filter((other) => kindOf(other) === kindOf(id)).length > 1
      ? home.displayName(id)
      : t(`room.${kindOf(id)}`);
  const readings = capped(
    ctx,
    { key: 'readings', title: 'strategy.readings', icon: 'fluvy:thermo' },
    measured,
    (ids) => readoutsCards(home, ids, {}, measureName).map((card) => [card]),
  );
  const cameras = capped(
    ctx,
    { key: 'cameras', title: 'strategy.cameras', icon: 'fluvy:camera' },
    parts.cameras,
    each(camera),
  );
  const rest = capped(
    ctx,
    { key: 'devices', title: 'strategy.devices', icon: 'fluvy:devices' },
    parts.rest,
    (ids) => byArea(ctx, ids, t('strategy.devices'), (title, own) => [rows(title, own)]),
  );
  const sections = flowed(
    ctx,
    [
      [heading(back.title, 'fluvy:home', [], back.path)],
      ...moreAfter(
        thermostats.shown.map((id) => [thermostat(id, ctx.style)]),
        thermostats,
      ),
      ...when(lights.shown.length, () =>
        moreAfter(
          headed(
            heading(t('room.lights'), 'fluvy:bulb', parts.lights),
            tileRows(lights.shown.map((id) => sizedTile(id, home.named(id), ctx.style))),
          ),
          lights,
        ),
      ),
      ...when(covers.shown.length, () =>
        moreAfter(
          [[heading(t('room.covers'), 'fluvy:blinds', parts.covers), coverTiles(covers.shown)]],
          covers,
        ),
      ),
      // a garage door or a gate as a cover, as the security view draws it
      ...moreAfter(
        gates.shown.map((id) => [gate(id)]),
        gates,
      ),
      ...moreAfter(
        fans.shown.map((id) => [fan(id)]),
        fans,
      ),
      ...moreAfter(
        players.shown.map((id) => [player(id)]),
        players,
      ),
      ...when(plugs.shown.length, () =>
        moreAfter(
          headed(
            heading(t('strategy.appliances'), 'fluvy:plug', parts.appliances),
            tileRows(plugs.shown.map((id) => applianceTile(home, id, ctx.style))),
          ),
          plugs,
        ),
      ),
      ...moreAfter(
        readoutsCards(home, readings.shown, {}, measureName).map((card) => [card]),
        readings,
      ),
      // the openings and the safety sensors on one card scoped to the room, which folds them itself at their cap
      ...when(parts.openings.length, () => [
        [
          full('openings', {
            title: t('strategy.sensors'),
            entities: [...parts.openings],
            ...foldAt(ctx, 'openings', parts.openings),
          }),
        ],
      ]),
      ...moreAfter(
        cameras.shown.map((id) => [camera(id)]),
        cameras,
      ),
      ...when(rest.shown.length, () => [[rows(t('strategy.devices'), rest.shown, moreKeys(rest))]]),
      // its automations on their own card, each with its switch, its last and next run (the card folds them at their
      // cap); no `+`: a schedule added there would be of no room, and never on this card
      ...when(parts.automations.length, () => [
        [
          full('automations', {
            title: t('strategy.automations'),
            entities: [...parts.automations],
            show_add: false,
            ...foldAt(ctx, 'automations', parts.automations),
          }),
        ],
      ]),
    ],
    [],
    columns,
  );
  return [
    ...(sections.length ? sections : [section(heading(back.title, 'fluvy:home', [], back.path))]),
    ...applianceSections(ctx, parts.devices, columns),
  ];
}

/** The subview of a room. */
export function roomView(
  ctx: StrategyContext,
  area: AreaRegistryEntry,
  columns: number,
  back: RoomBack,
): View {
  return {
    title: area.name,
    icon: area.icon ?? 'fluvy:home',
    path: `room-${area.area_id}`,
    type: 'sections',
    max_columns: columns,
    subview: true,
    back_path: back.path,
    sections: roomSections(ctx, area, back, columns),
  };
}
