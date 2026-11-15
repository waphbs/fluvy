import type { AreaRegistryEntry } from '@fluvy/core';
import { part } from '../edit.js';
import { flowed, full, thermostat } from '../layout.js';
import { roomParts, roomPath, roomRail, railFirst, type RoomBack } from '../rooms.js';
import type { Card, Section, StrategyContext, View, ViewSpec } from '../types.js';
import { climateView } from './home.js';

/*
 * The climate dashboard (`custom:fluvy-climate`): every thermostat, fan and reading at once on its first page, each
 * room's own page after it, the rail at the top of both.
 */

/** Every thermostat, the forecast and the readings, as the home dashboard's climate view draws them. */
export const CLIMATE_VIEWS: readonly ViewSpec[] = [
  {
    key: 'climate',
    icon: 'fluvy:thermometer',
    title: 'room.climate',
    build: (ctx) => railFirst(ctx, climateView(ctx)),
    when: (ctx) => ctx.home.climate.length > 0 || ctx.home.fans.length > 0,
  },
];

/** A room's page on the climate dashboard: its rail, its thermostats and its fans. */
export function climateRoomView(
  ctx: StrategyContext,
  area: AreaRegistryEntry,
  columns: number,
  back: RoomBack,
): View {
  const parts = roomParts(ctx.home, area.area_id);
  const blocks: Card[][] = [
    ...part(ctx, 'thermostats', parts.thermostats.map((id) => [thermostat(id, ctx.style)])),
    ...part(ctx, 'fans', parts.fans.map((id) => [full('fan', { entity: id })])),
  ];
  const sections: Section[] = [
    ...flowed(ctx, [roomRail(ctx, roomPath(ctx.base, area)), ...blocks], [], columns),
  ];
  return {
    title: area.name,
    icon: area.icon ?? 'fluvy:home',
    path: `room-${area.area_id}`,
    type: 'sections',
    max_columns: columns,
    subview: true,
    back_path: back.path,
    sections,
  };
}
