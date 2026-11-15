import type { AreaRegistryEntry } from '@fluvy/core';
import { flowed } from '../layout.js';
import { roomPart, roomRail, roomsOf } from '../rooms.js';
import type { Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The rooms dashboard (`custom:fluvy-rooms`): a tab a floor when the house has two or more, else every room on one
 * tab; each room a card that opens the room's own subview.
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
    [roomRail(ctx), ...rooms.map((area) => roomPart(ctx, area))],
    [],
    3,
  );

/** The views: one a floor (its name, its icon) plus the rooms on no floor, or all the rooms as one. */
export function roomsViews(ctx: StrategyContext): ViewSpec[] {
  const { rooms, floors } = floorsOf(ctx);
  const all: ViewSpec = {
    key: 'rooms',
    icon: 'fluvy:rooms',
    title: 'strategy.rooms',
    build: (c) => grid(c, rooms),
    when: () => true,
  };
  if (floors.length < 2) return [all];
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
  ];
}

/** The tab a room is reached from: its floor's, or the rooms' when there is one tab or the room has no floor. */
export function roomTab(ctx: StrategyContext, area: AreaRegistryEntry): string {
  const { floors } = floorsOf(ctx);
  const floor = floors.length >= 2 && floors.find((f) => f.floor_id === area.floor_id);
  return floor ? `floor-${floor.floor_id}` : 'rooms';
}
