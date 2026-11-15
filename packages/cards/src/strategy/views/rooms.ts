import type { AreaRegistryEntry } from '@fluvy/core';
import { flowed } from '../layout.js';
import { roomPart, roomSections, roomsOf } from '../rooms.js';
import type { Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The rooms dashboard (`custom:fluvy-rooms`): a tab a floor when the house has two or more, else every room on one
 * tab, and a tab a room after them — the room's own page beside its neighbours, in the tab bar.
 */

/** The floors with a room on them. */
const floorsOf = (ctx: StrategyContext) => {
  const rooms = roomsOf(ctx.home);
  const floors = ctx.home.floors.filter((floor) =>
    rooms.some((room) => room.floor_id === floor.floor_id),
  );
  return { rooms, floors };
};

const grid = (ctx: StrategyContext, rooms: readonly AreaRegistryEntry[]): Section[] =>
  flowed(
    ctx,
    rooms.map((area) => roomPart(ctx, area)),
    [],
    3,
  );

/** A room's own tab: its page, the tab bar leading to its neighbours. */
const roomTabView = (area: AreaRegistryEntry): ViewSpec => ({
  key: `room-${area.area_id}`,
  icon: area.icon ?? 'fluvy:home',
  title: 'strategy.rooms',
  name: area.name,
  build: (ctx) => roomSections(ctx, area, undefined, ctx.more?.columns ?? 3),
  when: () => true,
});

/** The views: one a floor (its name, its icon) plus the rooms on no floor, or all the rooms as one; then a tab a room. */
export function roomsViews(ctx: StrategyContext): ViewSpec[] {
  const { rooms, floors } = floorsOf(ctx);
  const all: ViewSpec = {
    key: 'rooms',
    icon: 'fluvy:rooms',
    title: 'strategy.rooms',
    build: (c) => grid(c, rooms),
    when: () => true,
  };
  const roomTabs = rooms.map(roomTabView);
  if (floors.length < 2) return [{ ...all }, ...roomTabs];
  const unplaced = rooms.filter(
    (room) => !floors.some((floor) => floor.floor_id === room.floor_id),
  );
  return [
    ...floors.map((floor): ViewSpec => ({
      key: `floor-${floor.floor_id}`,
      icon: floor.icon ?? 'fluvy:home',
      title: 'strategy.rooms',
      name: floor.name,
      build: (c) =>
        grid(
          c,
          rooms.filter((room) => room.floor_id === floor.floor_id),
        ),
      when: () => true,
    })),
    ...(unplaced.length
      ? [
          {
            ...all,
            title: 'strategy.other_rooms' as const,
            build: (c: StrategyContext) => grid(c, unplaced),
          },
        ]
      : []),
    ...roomTabs,
  ];
}
