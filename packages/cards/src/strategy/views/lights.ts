import type { AreaRegistryEntry } from '@fluvy/core';
import { flowed, lightGroups } from '../layout.js';
import { roomParts, roomsOf } from '../rooms.js';
import type { Section, StrategyContext, ViewSpec } from '../types.js';
import { lightsView } from './home.js';

/*
 * The lights dashboard (`custom:fluvy-lights`): every light at once on its first tab, a tab a room after it, so a room
 * steps to its neighbours from the tab bar without going back to the list.
 */

/** A room's tab on the lights dashboard: its lights alone. */
export const lightsRoomTab =
  (area: AreaRegistryEntry) =>
  (ctx: StrategyContext): Section[] =>
    flowed(
      ctx,
      lightGroups(ctx, roomParts(ctx.home, area.area_id).lights, true),
      [],
      ctx.more?.columns ?? 3,
    );

/** The rooms whose page would hold something; every room where that would be none of them. */
const holding = (
  ctx: StrategyContext,
  holds: (area: AreaRegistryEntry) => boolean,
): readonly AreaRegistryEntry[] => {
  const rooms = roomsOf(ctx.home);
  const held = rooms.filter(holds);
  return held.length ? held : rooms;
};

/** Every light by room, then a tab a room. */
export const lightViews = (ctx: StrategyContext): readonly ViewSpec[] => [
  {
    key: 'lights',
    icon: 'fluvy:bulb',
    title: 'room.lights',
    build: lightsView,
    when: (h) => h.home.lights.length > 0,
  },
  ...holding(ctx, (area) => roomParts(ctx.home, area.area_id).lights.length > 0).map(
    (area): ViewSpec => ({
      key: `room-${area.area_id}`,
      icon: area.icon ?? 'fluvy:home',
      title: 'room.lights',
      name: area.name,
      build: lightsRoomTab(area),
      when: () => true,
    }),
  ),
];
