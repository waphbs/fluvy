import type { AreaRegistryEntry } from '@fluvy/core';
import { part } from '../edit.js';
import { flowed, full, thermostat } from '../layout.js';
import { roomParts, roomsOf } from '../rooms.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';
import { climateView } from './home.js';

/*
 * The climate dashboard (`custom:fluvy-climate`): every thermostat, fan and reading at once on its first tab, a tab a
 * room after it.
 */

/** The rooms whose page would hold something; every room where that would be none of them. */
const holding = (
  ctx: StrategyContext,
  holds: (area: AreaRegistryEntry) => boolean,
): readonly AreaRegistryEntry[] => {
  const rooms = roomsOf(ctx.home);
  const held = rooms.filter(holds);
  return held.length ? held : rooms;
};

/** A room's tab on the climate dashboard: its thermostats and its fans. */
export const climateRoomTab =
  (area: AreaRegistryEntry) =>
  (ctx: StrategyContext): Section[] => {
    const parts = roomParts(ctx.home, area.area_id);
    const blocks: Card[][] = [
      ...part(ctx, 'thermostats', parts.thermostats.map((id) => [thermostat(id, ctx.style)])),
      ...part(ctx, 'fans', parts.fans.map((id) => [full('fan', { entity: id })])),
    ];
    return flowed(ctx, blocks, [], ctx.more?.columns ?? 3);
  };

/** Every thermostat, the forecast and the readings, then a tab a room. */
export const climateViews = (ctx: StrategyContext): readonly ViewSpec[] => [
  {
    key: 'climate',
    icon: 'fluvy:thermometer',
    title: 'room.climate',
    build: climateView,
    when: (h) => h.home.climate.length > 0 || h.home.fans.length > 0,
  },
  ...holding(ctx, (area) => {
    const parts = roomParts(ctx.home, area.area_id);
    return parts.thermostats.length > 0 || parts.fans.length > 0;
  }).map(
    (area): ViewSpec => ({
      key: `room-${area.area_id}`,
      icon: area.icon ?? 'fluvy:home',
      title: 'room.climate',
      name: area.name,
      build: climateRoomTab(area),
      when: () => true,
    }),
  ),
];
